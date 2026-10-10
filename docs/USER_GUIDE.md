# WattCycle — Detailed User & System Guide

> **Data note.** The network is real Delhi: 12 MCD zones, 4 WtE plants, 2 landfills, 6 MRFs and 1 biomethanation plant, all from DPCC/MCD and published reports. Road distances come from OpenStreetMap (OSRM). Day-to-day operations (daily tonnage, truck loads, meter readings) are simulated around those published averages.

This guide follows every user from login to logout. For each screen and button it covers:
- what the user sees and does;
- which API call the button makes;
- which backend function handles the call;
- what the AI service computes;
- which events fire;
- what is written to the database.

Read it top to bottom once. After that, use it as a reference.

**Contents**
1. [Big picture](#1-big-picture)
2. [Signing in and what every user shares](#2-signing-in-and-what-every-user-shares)
3. [Waste Generator](#3-waste-generator-eg-mcd-central-zone-office)
4. [Fleet Operator](#4-fleet-operator)
5. [Processing Hub Operator](#5-processing-hub-operator)
6. [Energy Facility](#6-energy-facility-eg-facility-b)
7. [System Operator (Admin)](#7-system-operator-admin)
8. [Run Full Optimization (demo mode)](#8-run-full-optimization-demo-mode)
9. [WattCycle Intelligence (assistant)](#9-wattcycle-intelligence-assistant)
10. [Alerts](#10-alerts)
11. [Background workers](#11-background-workers-what-happens-without-anyone-clicking)
12. [Function reference — Node.js API](#12-function-reference--nodejs-api-server)
13. [Function reference — Python AI service](#13-function-reference--python-ai-service-ai-service)
14. [Function reference — Frontend](#14-function-reference--frontend-frontend)
15. [Data model and lifecycle of one kilogram of waste](#15-data-model-and-the-lifecycle-of-one-kilogram-of-waste)
16. [Security model](#16-security-model)

---

## 1. Big picture

```
 Browser (Next.js, :3000)
   │  REST  /api/*   (proxied by Next.js to the API)
   │  WS    /ws?token=…   (live events + truck positions)
   ▼
 Node.js API (Express, :4000) ── owns ALL data, auth, RBAC, the loop's state machine
   │  POST /v1/*  with X-Service-Key
   ▼
 Python AI service (FastAPI, :8000) ── owns ALL AI: forecast, classify, predict-energy,
   │                                   rank-facilities, optimize-routes, train, assistant
   └─ GET /internal/datasets/* and /internal/tools/*  (reads data back from the API)
```

The closed loop, and the Node function that drives each step (all in `server/src/services/pipeline.ts` unless noted):

| # | Stage | Function | AI endpoint used | Event(s) published |
|---|---|---|---|---|
| 1 | Discover | `ai.forecast` (via source page / demo), `fillLevelDiscovery` (scheduler) | `/v1/forecast` | `WastePickupRequested` (auto) |
| 2 | Request | `createPickup` | – | `WastePickupRequested` |
| 3 | Collection optimization | `optimizeCollection` | `/v1/optimize-routes` | `CollectionOptimizationStarted`, `RouteOptimized`, `PickupAssigned` |
| 4 | Collect | `startRoute` → fleet simulator `tick` → `markStopReached` → `completeRoute` | – | `VehicleEnRoute`, `WasteCollected`, `WasteArrivedAtHub` |
| 5 | Characterize | `classifyShipment`, `reviewClassification` | `/v1/classify` | `WasteClassificationCompleted`, `ClassificationReviewed`, `AITrainingDataCreated` |
| 6 | Predict | `predictPathways` | `/v1/predict-energy` | `EnergyPotentialCalculated` |
| 7 | Optimize destination | `optimizeDestination` | `/v1/rank-facilities` | `FacilitySelected` |
| 8 | Route to facility | `approveDecision` → `createDispatchRoute` → `startRoute` | – | `DestinationApproved`, `WasteDispatched` |
| 9 | Convert + measure | `recordOutput` | – | `EnergyGenerationCompleted`, `ActualOutputRecorded` |
| 10 | Feedback | `recordOutput` (writes `feedback_records`), `checkDrift` | – | `AITrainingDataCreated`, `AlertRaised` |
| 11 | Learn | `triggerTraining` → AI `train` → `completeTraining` | `/v1/train` | `ModelRetrainingStarted`, `ModelRetrained` |

Every event is saved in the `events` table and broadcast over the WebSocket. The browser uses each event to refresh the screens that changed (`frontend/hooks/useLiveSocket.ts`).

-----

## 2. Signing in and what every user shares

### 2.1 Landing page (`/`)
- **The user sees:** the hero headline, the six-step loop animation, and four live counters (waste processed, energy, CO₂ avoided, prediction accuracy).
- **Behind it:** `GET /api/public/impact`, an unauthenticated route in `server/src/api/platform.ts`. It sums `shipments.measured_kg` and `energy_outputs.actual_kwh`. CO₂ = kWh × 0.71 + organic kg × 0.45 (constants in `services/analytics.ts`).
- **Hero card:** labelled *illustrative*. The real decisions live in the AI Decision Center.

### 2.2 Register (`/register`)
1. The user picks a role (generator / fleet / hub / facility) and enters organisation, name, email and password. Admin accounts can't self-register.
2. `POST /api/auth/register` runs `authRouter.post("/register")`:
   - zod validates the form;
   - duplicate emails are rejected;
   - the password is stored as a bcrypt hash (cost 12);
   - the action is written to `audit_logs`.
3. The API returns a JWT, and the browser stores it in `localStorage` (`store/auth.ts`).
4. Generators are redirected to `/waste-sources/new`. Everyone else goes to `/dashboard`.

### 2.3 Login (`/login`)
- **Email + password:** `POST /api/auth/login` checks the password with bcrypt. Failed attempts are audited as `auth.login_failed`. Auth routes are limited to 30 requests per 15 minutes per IP.
- **Demo role buttons:** these sign in with the seeded accounts (`*@wattcycle.demo` / `demo1234`).
- **After login:** if the user was sent to login from a protected page (`?next=`), they return there. Otherwise they land on `/dashboard`.

### 2.4 The app shell (every signed-in page)
`components/shell/AppShell.tsx` wraps all app pages:

- **Auth guard.** No token sends the user to `/login?next=…`. Any `401` from the API clears the session (`lib/api.ts`).
- **Sidebar.** Shows only the sections the user's role can use (the `NAV` array). Hiding links is cosmetic; the API enforces permissions independently with `requireRole`.
- **Top bar contains:**
  - **Run Full Optimization:** shown only to admin, hub and fleet users. See §8.
  - **WattCycle Intelligence:** opens the assistant. See §9.
  - **Bell:** the open-alerts popover. It polls `/api/alerts?status=open` every 30 s.
  - **Profile and sign out:** sign out calls `POST /api/auth/logout`, which adds the token's hash to the revocation set.
- **System Status (bottom of sidebar).** `GET /api/system/status` reports whether the AI service is reachable and the models are loaded. The *Live* dot shows WebSocket health.
- **Live socket.** `useLiveSocket()` opens `ws://…/ws?token=…`. The server checks the token and closes the socket with code 4401 if it's invalid. Two kinds of message arrive:
  - **Domain events.** Each is pushed to the activity feed and invalidates the matching React Query caches (the `INVALIDATE` map). For example, `WasteArrivedAtHub` refreshes the shipments, dashboard and map queries.
  - **`positions`.** Truck coordinates go into `store/live.ts`, which moves trucks on every map.

### 2.5 Overview dashboard (`/dashboard`, all roles)
`GET /api/dashboard` returns these five blocks in one call (`platform.ts`):

| Block | Source function | What it shows |
|---|---|---|
| KPI cards | `analytics.kpis()` (5 s cache) | Waste available (open pickups), collected 7d, in processing, energy 30d/today, CO₂ avoided 30d, active routes |
| Sankey | `analytics.flow(30)` (15 s cache) | Source type → stream → pathway → outcome. Each shipment's composition comes from the operator label if one exists, otherwise the lab audit, otherwise the AI estimate. Flows are split across source types by their kg share |
| Map | separate `GET /api/map` | Sources (size = kg/day, bright = open request), hubs, facilities, vehicles (live), active routes |
| AI decisions | latest 4 `facility_selection` rows | Facility, expected kWh, confidence, top "why" drivers, actual vs predicted once metered |
| Energy performance | `analytics.timeseries(30)` | Daily predicted vs actual (only batches that had a prediction) |
| Recent activity | last 25 `events` + live socket events | Time-stamped narration of the loop |

Under the KPIs, **`RoleQueue`** shows a work queue specific to the user's role. These are described in each role section below.

---

## 3. Waste Generator (e.g. MCD Central Zone office)

**Demo account:** `generator@wattcycle.demo`. **Navigation:** Overview, Waste Network, Collection, Facilities, Energy, Alerts, Settings.

### 3.1 Dashboard queue
- **"My waste sources":** each card shows recent kg/day and its energy potential. Click a card to open the source detail.
- **"My pickups":** the user's latest pickups and their status.
- Data comes from `GET /api/waste-sources`, which is automatically filtered to `user_id = me` for generators, and `GET /api/pickups`, filtered by source ownership.

### 3.2 Register a waste source (`/waste-sources/new`)
1. The generator fills in:
   - business name and type;
   - address, city, and GPS (or presses ⌖ to use the browser's location);
   - waste type, quantity and unit;
   - frequency and operating hours;
   - storage capacity;
   - a contamination slider;
   - an optional photo.
2. **Live estimates.** Each change (debounced 300 ms) calls `POST /api/waste-sources/estimate` in `network.ts`:
   - `sourceEstimates()` turns quantity + unit + frequency into kg/day and kg/week.
   - `potentialKwhPerDay()` multiplies kg/day by the **data-derived** average composition for that business type (from lab-audited shipments, via `energyPriors()`), then by the **best observed facility yield** per stream.
   - `recommendFrequency()` returns daily for perishable food waste. For other waste it schedules a pickup when storage reaches 80% full.
3. **Photo upload.** `POST /api/uploads` (multer, 8 MB max) checks the file's **magic bytes**: only JPEG, PNG or WebP are accepted. The file gets a random UUID key, and the key is attached to the source.
4. **Register.** `POST /api/waste-sources` validates the form and inserts the source plus one `waste_records` row as a forecasting anchor. It writes an audit entry, publishes `WasteSourceRegistered`, and redirects to the source page.

### 3.3 Source detail (`/waste-sources/:id`)
- **KPIs:** average quantity, forecast today and tomorrow (with an 80% interval), 7-day total, energy potential.
- **AI forecast chart.** `GET /api/waste-sources/:id` gathers the last 90 days of `waste_records` and calls the AI service's `/v1/forecast`, which runs `ml/inference/predict.forecast` (§13). The chart shows recorded history, the dashed forecast and an interval band. The subtitle reports the model's test MAPE against a seasonal-naive baseline.
- **Typical composition:** a 100% bar from lab audits that include this business type.
- **Impact:** kg delivered, energy enabled and CO₂ avoided (estimated with the same factors as above).
- **Pickup history** table.

### 3.4 Request a pickup (button **Request Pickup**)
1. A dialog opens with **quantity** pre-filled from today's forecast, plus **urgency**.
2. On every change, `POST /api/pickups/quote` (`operations.ts`) returns:
   - the nearest hub (`nearestHub`, by road distance);
   - a suggested vehicle at that hub;
   - nearby open requests within 6 km as consolidation candidates, which give the suggested route;
   - **estimated cost:** round trip × ₹36/km + ₹400 fixed, scaled by the share of a 2.5 t truck, + ₹150 handling (compared with the solo cost);
   - **estimated CO₂:** 0.85 kg/km + 6 kg per trip, scaled the same way.
3. **Confirm Pickup** calls `POST /api/pickups`, which runs `createPickup()`:
   - checks the generator owns the source;
   - inserts `pickup_requests` with status **REQUESTED**, a code like `PU-2025`, and a 1–6 h window;
   - publishes `WastePickupRequested`;
   - the browser navigates to `/pickups/:id`.
4. **Tracking.** The pickup page shows a five-step tracker: **REQUESTED → ASSIGNED → EN ROUTE → COLLECTED → DELIVERED**. It refreshes every 5 s and on events. It also shows the map, the route once assigned, and an event timeline filtered by this pickup's id, route and shipment.

### 3.5 What the generator cannot do
- Edit other organisations' sources: the API returns 403.
- Assign trucks, classify waste or approve destinations: `requireRole` blocks these.

---

## 4. Fleet Operator

**Demo account:** `fleet@wattcycle.demo`. **Navigation:** Overview, Waste Network, Collection, Routes, Facilities, Energy, Analytics, Alerts, Settings.

### 4.1 Dashboard queue
- **Unassigned pickups:** status REQUESTED.
- **Active routes:** progress bars driven by live telemetry.

### 4.2 Collection board (`/pickups`)
- **Status funnel:** counts per status. Click a status to filter the table.
- **Table columns:** source, quantity, urgency, window, vehicle/route, estimated cost and CO₂.
- **Assign** (per row) calls `POST /api/pickups/:id/assign`, which runs `optimizeCollection({ pickup_ids: [id] })`: a one-stop route on the best idle truck at the nearest hub.

### 4.3 Route optimization (`/routes`) — main fleet screen
1. Choose a hub, or leave it on "nearest to first request".
2. Press **Optimize N open pickups**. This calls `POST /api/routes/optimize` → `optimizeCollection()`, which:
   1. loads REQUESTED pickups near that hub and the hub's **idle** vehicles;
   2. publishes `CollectionOptimizationStarted`;
   3. sends depot, vehicles (remaining capacity) and stops (demand kg, urgency, time windows in minutes from now) to AI `/v1/optimize-routes`, which runs `ml/optimization/routing.optimize` (§13: OR-Tools CVRPTW);
   4. for each returned route:
      - inserts a `routes` row, `kind=collection, status=planned`, with km, baseline km, duration, fuel, CO₂, cost, `opt_score`, solver and explanation;
      - inserts `route_stops` (depot → pickups in solver order → hub);
      - sets each pickup to **ASSIGNED** with the vehicle and route;
      - sets the vehicle to `assigned`;
   5. publishes `RouteOptimized` and `PickupAssigned`.
3. **The right panel shows the chosen route:**
   - vehicle, capacity and current load;
   - truck fill at the hub;
   - ordered stops with lettered markers, cumulative load and ETA;
   - distance (vs solo trips), estimated time, fuel, CO₂, cost and optimization score;
   - the solver's plain-language explanation, e.g. *"consolidates 3 pickups and reduces estimated travel distance by 58%…"*.
4. **Dispatch** calls `POST /api/routes/:id/start` → `startRoute()`. The route becomes `active`, the vehicle `en_route`, and its pickups **EN_ROUTE**. `VehicleEnRoute` is published.
5. The **fleet simulator** (§11) then moves the truck. As the truck passes each pickup, `markStopReached()` sets it **COLLECTED**, adds kg to the truck load and publishes `WasteCollected`. At the hub, `completeRoute()`:
   - creates a **shipment** (e.g. `WC-1027`) with the source mix and a weighbridge reading (total ±2%);
   - sets the pickups to **DELIVERED** and links them to the shipment;
   - writes `waste_records` rows (actual generation data for the forecaster);
   - increases the hub's on-site load;
   - publishes `WasteArrivedAtHub`.
6. **Recalculate Route** (planned routes only): `POST /api/routes/:id/recalculate` releases the route's pickups back to REQUESTED, frees the truck, cancels the old route, and re-solves with any new requests near the same hub.
7. **Manual overrides** on a pickup page:
   - **Mark collected:** `POST /pickups/:id/status`.
   - **Deliver to hub:** `POST /pickups/:id/complete`, which runs `completeRoute` immediately.

---

## 5. Processing Hub Operator

**Demo account:** `hub@wattcycle.demo` (Okhla hub). **Navigation:** Overview, Processing Hub, AI Engine, Facilities, Energy, Analytics, AI Models, Alerts, Settings.

### 5.1 Hub overview (`/hub`)
- **KPIs:** incoming shipments, active sorting jobs, completed (48 h), AI recommendations awaiting approval.
- **Hub cards:** on-site kg, queue length, capacity.
- **Tables:**
  - **Incoming:** in transit or awaiting classification.
  - **Active jobs:** classified or dispatched.
  - **Completed:** processed in the last 48 h.
- **Analyze Waste** (on rows awaiting classification) calls `POST /api/ai/classify`, then opens the shipment's classification page.

### 5.2 Weighbridge (`/hub/incoming`)
Select a shipment, enter the measured kg and press **Record weight**. This calls `POST /api/hub/shipments/:id/weigh`, which:
- stores `measured_kg`;
- for a shipment still in transit, marks it received and publishes `WasteArrivedAtHub`.

The measured weight is used for every later calculation.

### 5.3 Classification → prediction → destination (`/hub/classification/:id`)
This page carries one shipment through characterization, prediction and destination choice. A step bar at the top shows: Weighed · AI classified · Operator reviewed · Destination decided · Dispatched · Energy recorded.

**Step 1 — Analyze Waste**
1. Optionally upload a photo. It is stored as the start of a future vision dataset.
2. Press **Analyze Waste**. `classifyShipment()`:
   - sends total kg, month and the **source mix** (business types + kg) to AI `/v1/classify`;
   - the AI service runs the random-forest composition model;
   - it returns the composition (organic / plastic / paper / metal / other), the per-stream uncertainty (spread across the forest's trees), the estimated moisture, and a **confidence** score: the share of trees within 6 percentage points of the consensus on every stream.
3. The API stores a `waste_classifications` row (`pending_review`) and an AI row in `waste_compositions`. The shipment becomes `classified`.
4. It publishes `WasteClassificationCompleted`. If confidence is below 80%, it raises a **Low classification confidence** alert.

**Step 2 — Human review** (the panel with the donut chart)

| Button | API → function | Effect |
|---|---|---|
| **Confirm** | `POST /hub/classifications/:id/review {action:"confirm"}` → `reviewClassification` | Status `confirmed`. A `feedback_records` row (kind `classification`) stores the AI label = the human label, which counts as a positive example |
| **Edit** | Same endpoint with `{action:"edit", corrected:{…}}` | The operator types percentages, which must total 100% ± 2. Status `corrected`. An `operator` composition row is stored, plus a feedback row with **AI label vs human label**. `AITrainingDataCreated` fires. The next classifier training weights operator labels **3×** |
| **Reject** | `{action:"reject"}` | Status `rejected`. The shipment returns to the queue to be re-analyzed |

**Step 3 — AI energy prediction** (loads automatically once reviewed)
- `POST /api/ai/predict-energy` → `predictPathways()`. For each stream above 1 kg it calls AI `/v1/predict-energy` → `predict.pathways()`.
- **Headline card (organic):** quantity, **recommended technology**, then biogas m³, electricity kWh, heat kWh and confidence with its interval.
- **Per-stream option lists (A/B/C):** e.g. anaerobic digestion vs combustion vs landfill gas. Each option shows expected kWh and its *basis*:
  - "ML model @ network-average facility";
  - "literature reference factor (no facility in network)";
  - "material recovery".

**Step 4 — Evaluate facilities & optimize destination**
`POST /api/ai/optimize-destination` → `optimizeDestination()`, which handles each stream:
- **Organic and plastic** (energy streams):
  1. `facilityCandidates()` collects every facility that accepts the stream, with: distance from the hub (road km), transport cost and CO₂, compatibility, maximum moisture, utilization, efficiency, and historical yield from that facility's own meter readings.
  2. AI `/v1/rank-facilities` → `ranking.rank()` (§13) predicts kWh at **each** facility, filters out ineligible ones (with a reason), scores the rest with the configurable utility, runs 1,000 Monte-Carlo draws to measure decision stability, and writes the explanation.
  3. The API stores an `ai_decisions` row: inputs, output, full ranking, explanation, decision drivers, model feature importance, weights, confidence, score and model version. It also stores an `energy_predictions` row for the chosen facility, and publishes `FacilitySelected`.
- **Paper, metal and other:** a rule-based *pathway* decision: recycling, material recovery, or residual. The decision names the most compatible material-recovery facility. No ML is involved, and the decision says so.

**Step 5 — Approve or override** (the *Human oversight* panel)
- **Approve Destination:** `POST /api/ai-decisions/:id/approve` → `approveDecision()`. The status becomes `approved`, then `createDispatchRoute()`:
  - picks an idle truck large enough, preferring one at this hub;
  - creates a `dispatch` route hub → facility with distance, CO₂, cost and duration;
  - reduces the hub's on-site load.
  - `DestinationApproved` is published.
- **Override:** pick another *eligible* facility and give a reason (required, audited). The status becomes `overridden`, and the energy prediction is rewritten to the chosen facility's predicted values, so the outcome is still measured against what the model said for that facility.
- When no decisions on the shipment remain *proposed*, the shipment becomes `dispatched`.

**Step 6 — Closed-loop record** (bottom table)
Each stream's predicted kWh and 90% interval, the actual kWh once the facility reports, the error %, and the model version. This is the per-shipment audit trail.

---

## 6. Energy Facility (e.g. Tehkhand WtE)

**Demo account:** `facility@wattcycle.demo` (linked to Tehkhand WtE). **Navigation:** Overview, AI Engine, Facilities, Energy, Analytics, AI Models, Alerts, Settings.

### 6.1 Dashboard queue
**"Loads awaiting output report"** comes from `GET /api/facilities/:myId` → `awaiting_output`: predictions for this facility that have no meter reading yet.

### 6.2 Facility console (`/facilities/:id`)
- **Header:**
  - technology and coordinates;
  - gate fee;
  - a **SIMULATED METER** badge on demo facilities;
  - a **status selector** (online / maintenance / offline), available only for the user's own facility. It calls `PATCH /api/facilities/:id`. Offline or maintenance facilities become **ineligible** in the next ranking.
- **KPIs:** technology, capacity, utilization (with free t/day), measured vs rated efficiency, **historical yield (kWh/kg)** across all readings, and carbon intensity.
- **Report actual energy output:** each delivered load awaiting a report is one row.
  - **Submit** (manual meter kWh) → `POST /api/energy/output {prediction_id, actual_kwh}`.
  - **Read simulated meter** (demo facilities only) → the same endpoint with `{simulate:true}`. The API calls `simulateEnergy()` (§12). It is labelled `source = meter-sim`.
  - In both cases `recordOutput()`:
    1. inserts an `energy_outputs` row, with efficiency = actual ÷ theoretical potential;
    2. publishes `EnergyGenerationCompleted` and `ActualOutputRecorded`;
    3. writes a **`feedback_records`** row with predicted kWh, actual kWh, signed error %, facility, technology, stream, quantity, distance and transport cost — the training row for the next retrain;
    4. publishes `AITrainingDataCreated`;
    5. if |error| > 15%, raises **Energy output deviation** (critical if more than 25% under), with possible causes;
    6. marks the shipment `processed` when all its predictions have outputs;
    7. runs `checkDrift()`: if rolling MAPE over the last 20 conversions exceeds the threshold (12%), it raises **Model drift detected**.
- **Charts:** daily throughput (kg), energy output (kWh), measured efficiency (%), and predicted vs actual.
- **Tables:** incoming dispatch routes, and recent meter readings with their source (manual vs simulated).

### 6.3 Register a facility (`/facilities` → **Register facility**)
`POST /api/facilities` takes name, coordinates, technology, capacity, efficiency and one compatible stream. It assigns a code and label and publishes `FacilityRegistered`. The facility is **immediately eligible**. Until it has history, the energy model uses network-average yields and **widens the uncertainty by 1.6×**.

---

## 7. System Operator (Admin)

**Demo account:** `admin@wattcycle.demo`. Sees everything and can do everything the other roles can.

| Screen | What admin does | Behind it |
|---|---|---|
| `/ai-decisions` | Browse every decision. Filter by kind/status. KPIs: count, human overrides, live outcome error. View the current optimizer weights | `GET /api/ai-decisions` + `/settings/optimizer` |
| `/ai-decisions/:id` | Full explainability: inputs, output, why, drivers, model feature importance, ranking table, map of hub → each facility (winner highlighted), approve/override, final outcome | `GET /api/ai-decisions/:id` |
| `/energy` | Energy today / week / month / all-time; kWh per kg; efficiency; CO₂ avoided; landfill diverted; breakdown by stream and technology; input vs output (two panels, no dual axis); predicted vs actual; **calibration scatter** (each dot one batch, diagonal = perfect) | `GET /api/energy/analytics?days=` |
| `/analytics` | Whole-chain KPIs: generated, collected, energy, energy/kg, transport cost and CO₂, **cost per kWh** (transport + gate fees), accuracy, route efficiency, utilization. Trend charts, waste by source type, weekly model MAPE, facility performance table | `GET /api/analytics?days=` |
| `/ai-model` | Training pipeline diagram; one card per model (version, training date, dataset size, MAE/RMSE/R²/MAPE or precision/recall/F1, **naive baseline** for comparison); **Retrain** per model or all; production feedback table (which training run used each row); training runs; data-quality report (rows in/out, imputed days, outliers, split, snapshot hash) | `GET /api/models`, `POST /api/models/:key/retrain` |
| `/settings` | Optimizer weight sliders (benefits **+**, costs **−**), normalized to sum to 1 on save; the retraining policy | `PUT /api/settings/optimizer` |
| `/admin` | Inventory counts, service health (database mode, AI service, each model version), user list with **role changes** (cannot demote self), **audit log** | `/api/admin/*` |
| `/alerts` | Acknowledge or resolve any alert | `POST /api/alerts/:id/acknowledge|resolve` |

**Retrain flow:** pressing Retrain calls `triggerTraining(key, "manual")`, which:
1. refuses if a run started less than 10 minutes ago is still running;
2. creates `training_runs` rows, counting the pending feedback rows;
3. publishes `ModelRetrainingStarted`;
4. calls AI `/v1/train`, which returns 202 and trains in a background thread.

When training finishes, the AI service calls back `POST /internal/training-runs/:id/complete` → `completeTraining()`, which:
- archives the old version and inserts a new `model_versions` row marked active;
- marks consumed feedback rows with the `training_run_id`;
- for the energy model, stores **backtest predictions** (time-based holdout) against historical outputs, labelled `-backtest`;
- publishes `ModelRetrained`.

---

## 8. Run Full Optimization (demo mode)

Available to admin, hub and fleet. The button calls `POST /api/demo/run` → `workers/demo.ts` `runDemo()`. It refuses if a run is already in progress, if the AI service is down, or if the models aren't trained yet. It then executes `execute()` in the background and paces each stage so it can be followed (about 25 s in total).

| Stage | What runs (real functions) | Example narration |
|---|---|---|
| 0 Discover | `ai.forecast` for MCD Central Zone (real published average 1,000 TPD) | "MCD Central Zone (25 wards): forecast 1,037 t today" |
| 1 Request | `createPickup` ×3: Central 4.0 t, South 3.5 t, West 2.5 t (urgency high) | "3 transfer loads requested" |
| 2 Optimize | `optimizeCollection` on MTS truck T-104 (15 t) or any idle truck at the hub | "T-104: Okhla hub → zones → hub (53 km, 40% shorter than separate trips)" |
| 3 Collect | `startRoute` with a 600× simulation speed; the fleet simulator completes it → shipment; weight fixed at 10,000 kg for reproducibility | "WC-1023 arrived at Okhla Transfer & Sorting Hub: 10,000 kg" |
| 4 Classify | `classifyShipment` + `reviewClassification(confirm)` | "organic 4,230 kg, plastic 938 kg …" |
| 5 Predict | `predictPathways` | "Organic → waste-to-energy (biomethanation not yet online)" |
| 6 Evaluate | `optimizeDestination` (ranking shown as bars) | "7 facilities evaluated: Tehkhand, Okhla, Ghazipur, Bawana WtE, 2 landfills, Ghogha (excluded: commissioning)" |
| 7 Select | the decision's headline | "Tehkhand WtE selected because it provides 6% higher predicted energy yield" |
| 8 Dispatch | `approveDecision` for every decision; dispatch route started at 900× | "T-xxx dispatched: hub → Tehkhand WtE (1.5 km)" |
| 9 Energy | `recordOutput({simulate:true})` for each prediction (meter simulated around Tehkhand's published 25 MW ÷ 2,000 TPD) | "845 kWh generated; predicted 829" |
| 10 Feedback | the feedback rows created in stage 9 | "prediction error ~2% — added to next retraining set" |

The overlay (`features/demo/DemoOverlay.tsx`) is driven entirely by `DemoStage` WebSocket events. At the end it shows predicted, actual and error, with links to the **decision**, the **shipment trace** and the **feedback loop**.

---

## 8b. City Allocation Planner (`/planner`, admin / hub / fleet)

The planner answers a city-level question: how should Delhi's 11,000 TPD be split across its plants?

1. `POST /api/planner/city {scenarios}` → `api/planner.ts` builds the inputs from the database:
   - each zone's real TPD and its current DPCC destinations;
   - each facility's real capacity and yield, where yield = MW × 24 ÷ TPD;
   - OSRM road distances from every zone to every facility.
2. Scenarios add the published expansions: Okhla to 2,950 TPD / 40 MW, Tehkhand to 3,000 TPD / 45 MW, new Ghazipur and Narela-Bawana plants, and Ghogha biomethanation coming online.
3. The AI service `/v1/plan-city` → `ml/optimization/city_plan.py` solves a linear program (OR-Tools GLOP).
   - **Objective:** maximize electricity minus haulage diesel energy (0.33 kWh per tonne-km).
   - **Constraints:** plant capacities, and segregated organics only for biomethanation.
   - **Overflow:** landfill.
4. It compares the result with **MCD's current practice**: each zone split equally over its listed destinations, overflow to the nearest landfill.
   - This baseline processes ≈7,000 TPD, close to the 7,200 TPD DPCC reports.
   - Re-assigning zones within today's plants yields **+152 MWh/day (+8%)**, **−633 TPD to landfill** and **−19% haulage**.

## 9. WattCycle Intelligence (assistant)

Opened from the top bar on any page.

1. The user asks a question. The drawer sends the conversation to `POST /api/assistant/chat`. The API forwards it to AI `/v1/assistant/chat` together with the user's name and role.
2. `app/assistant.py` `chat()`:
   - **With `ANTHROPIC_API_KEY`:** a Claude (`claude-opus-5-5`) tool-use loop runs, up to 6 turns. Claude can only call the eight data tools; each tool performs a GET on `/internal/tools/*` in the Node API. The system prompt requires every number to come from a tool result.
   - **Without a key:** `_rules()` matches the intent and calls the same tools, then formats the answer.
3. The drawer shows the answer (rendered with a safe Markdown renderer), **the tools that were called with their arguments**, and which engine answered.

| Tool | API route | Answers |
|---|---|---|
| `get_kpis` | `/internal/tools/kpis` | Network snapshot |
| `get_facility_decisions` | `/internal/tools/decisions?facility=Tehkhand` | "Why did the AI select Tehkhand WtE?" (ranking table + weights) |
| `get_energy_generation` | `/internal/tools/energy?days&stream` | "How much energy did organic waste generate this month?" |
| `get_co2_avoided` | `/internal/tools/co2?days` | "How much CO₂ did we avoid this week?" (grid + landfill − transport) |
| `get_facility_capacity` | `/internal/tools/facilities` | "Which facility has the most available capacity?" |
| `get_source_priority` | `/internal/tools/source-priority` | "Which source should we prioritize today?" Score = storage fill × urgency × energy value ÷ distance; days since collection from the latest shipment or delivered pickup |
| `get_routes` | `/internal/tools/routes` | "Why is this route inefficient?" (truck fill, km per pickup, savings vs solo trips) |
| `get_models` | `/internal/tools/models` | Model versions and metrics |

---

## 10. Alerts

| Type | Raised by | When |
|---|---|---|
| `facility_capacity` | scheduler `capacitySweep` (every 2 min) + seed | Utilization ≥ 85% |
| `pickup_overdue` | scheduler `overdueSweep` (every 1 min) | REQUESTED past its window end (critical if urgency is critical) |
| `vehicle_delayed`, `route_disruption`, `facility_unavailable` | seed (simulated operations feed) | Demo context |
| `low_classification_confidence` | `classifyShipment` | Confidence < 80% |
| `energy_deviation` | `recordOutput` | \|actual − predicted\| > 15%, with possible causes |
| `model_drift` | `checkDrift` | Rolling MAPE over the last 20 conversions > policy threshold (deduplicated per hour) |

All alerts go through `services/alerts.ts` `raiseAlert()`, which inserts the row and publishes `AlertRaised`. The bell and the Alerts page refresh live. Operators can **Acknowledge** or **Resolve** an alert; both actions are audited.

---

## 11. Background workers (what happens without anyone clicking)

**`workers/scheduler.ts`** (EventBridge Scheduler + SQS in AWS)

| Job | Every | What it does |
|---|---|---|
| `ensureModels` | 15 s | Pings the AI service. If any of the 3 models has no active version, calls `triggerTraining("all","bootstrap")`. Once all are active, runs `bootstrapOperations` once: optimizes and starts routes for hubs H-02/H-03 so trucks move on the map, and classifies + ranks one queued shipment so the Decision Center isn't empty |
| `overdueSweep` | 1 min | Overdue pickup alerts |
| `capacitySweep` | 2 min | Facility capacity alerts |
| `fillLevelDiscovery` | 10 min | **Discover** stage: estimates each source's storage fill since its last collection. If ≥ 85% and no open request, auto-creates a pickup ("Auto-requested: storage estimated ≥85% full"). One per sweep |
| `retrainPolicy` | 30 min | Retrains the energy model when pending feedback ≥ `min_new_feedback` (25), or daily if any is pending |

**`workers/fleet.ts`** (IoT Core in AWS)
- `tick()` runs every 1.5 s. For each active route it:
  1. advances progress at 28 km/h × speed-up (25× normally; the demo sets 600–900×);
  2. interpolates the truck's position along the stop polyline and computes its heading;
  3. updates the `vehicles` row and broadcasts `positions`;
  4. calls `markStopReached` for every pickup passed;
  5. calls `completeRoute` at 100%.

---

## 12. Function reference — Node.js API (`server/`)

### `src/index.ts`
`main()` runs at startup:
1. `initDb()`;
2. `seed()` (first run only);
3. Express setup: helmet, CORS allow-list, 1 MB JSON limit, a global rate limit of 600 requests/min;
4. routes:
   - `/api/auth` (public);
   - `/api/public/*` (public);
   - `/api/*` (JWT required);
   - `/internal/*` (service key);
5. the WebSocket server on `/ws` (verifies the JWT from `?token`);
6. the fleet simulator and the scheduler.

### `src/config.ts`
Environment configuration. Production fails fast if `JWT_SECRET` or `SERVICE_KEY` is missing.

### `src/database/`

| Function | Purpose |
|---|---|
| `db.initDb()` | Picks the driver: `pg` Pool if `DATABASE_URL` is set, else embedded **PGlite** (Postgres compiled to WASM) under `data/pg`. Applies `schema.sql` |
| `db.query / one / insert / update / exec` | Thin SQL helpers. `insert`/`update` JSON-encode objects. PGlite calls are serialized by a small mutex |
| `schema.sql` | 24 tables (§15) |
| `seed.seed(reset)` | Builds the simulated network: hubs; facilities placed by road-km and bearing from H-01, so A=20 km, B=35 km, C=12 km really holds; demo users; 20 sources with 120 days of records (weekly seasonality, festive bump, ~2.5% missing days, ~0.6% outliers on purpose for the cleaning stage); vehicles; 220 historical shipments with lab audits, dispatched under the legacy "random compatible facility" rule and metered by the simulator; queued shipments, open pickups and alerts. Default optimizer weights and retrain policy |
| `simulator.simulateEnergy()` | **The demo world, not the model.** kWh = kg × stream/technology potential × the facility's hidden true factor × moisture adjustment × overload penalty × noise. The ML never sees this formula |
| `simulator.sampleComposition / sampleMoisture` | Lab-audit generator: business-type priors, seasonal tweaks, noise, normalized |
| `simulator.rng / gaussian` | Deterministic PRNG for reproducible seeds |

### `src/middleware/`

| Function | Purpose |
|---|---|
| `auth.signToken / verifyToken` | Sign and verify the JWT (`sub, email, name, role, facility_id, hub_id`). Checks the revocation set |
| `auth.requireAuth` | Bearer token → `req.user`, else 401 |
| `auth.requireRole(...roles)` | RBAC. Admin passes every check |
| `auth.requireService` | Constant-time `X-Service-Key` check for `/internal` |
| `http.parse(schema, data)` | `sanitize()` (strip HTML and control characters) + zod parse |
| `http.ah()` | Async error wrapper |
| `http.errorHandler` | zod → 400 with field details; `HttpError` → its status; file too large → 413; anything else → 500 |

### `src/services/`

| Function | Purpose |
|---|---|
| `pipeline.createPickup` | §3.4 |
| `pipeline.nearestHub` | Online hub with the smallest road distance |
| `pipeline.optimizeCollection` | §4.3. With `dry_run` it only returns the solution |
| `pipeline.getRoute / startRoute / markStopReached / completeRoute` | Route lifecycle (§4.3). `completeRoute` creates shipments (collection) or marks delivery (dispatch) |
| `pipeline.classifyShipment / reviewClassification / effectiveComposition` | §5.3 steps 1–2. `effectiveComposition` prefers the operator correction over the AI estimate |
| `pipeline.facilityCandidates` | Facilities for a stream, with distance, cost, CO₂ and history-based yield |
| `pipeline.predictPathways` | §5.3 step 3 |
| `pipeline.optimizeDestination` | §5.3 step 4. Idempotent: returns existing decisions if any |
| `pipeline.approveDecision / createDispatchRoute` | §5.3 step 5 |
| `pipeline.recordOutput` | §6.2 (conversion → feedback → alerts → drift) |
| `pipeline.checkDrift` | Rolling MAPE drift alert |
| `pipeline.triggerTraining / completeTraining` | §7 retrain flow |
| `pipeline.streamMoisture` | Per-stream moisture after sorting: organic = load + 6 pp; dry streams ≈ ¼ of the load, between 5% and 30% |
| `aiClient.ai.*` | Typed calls to the AI service with timeouts. Network failure → 503 with startup instructions |
| `events.publish / subscribe / broadcast / attachSocket` | Domain event bus: persist (except ephemeral types), invalidate dashboard caches, push to sockets, notify in-process subscribers |
| `alerts.raiseAlert` | Insert + `AlertRaised`, with optional one-hour dedupe |
| `analytics.kpis / flow / timeseries / facilityPerformance` | Dashboard and analytics rollups (cached) |
| `audit.audit` | Append to `audit_logs` (user, action, entity, details, IP) |
| `cache.wrap / invalidate` | TTL cache; the Redis-shaped interface |
| `settings.getSetting / setSetting / nextCode` | `system_settings` key/value; human codes (`PU-`, `R-`, `WC-`, `AI-`) |

### `src/api/` (route → handler)
- **`auth.ts`:** register, login, logout, me.
- **`network.ts`:**
  - waste-sources: list, detail + forecast, estimate, create, patch;
  - waste-records;
  - facilities: list, detail, create, patch;
  - hubs, vehicles.
- **`operations.ts`:**
  - pickups: list, detail, quote, create, assign, status, complete;
  - routes: list, detail, optimize, start, complete, recalculate;
  - hub: shipments list and detail, weigh, classification review.
- **`intelligence.ts`:**
  - ai: classify, predict-energy, rank-facilities (preview), optimize-destination, forecast;
  - ai-decisions: list, detail, approve;
  - optimizer settings;
  - energy: output, analytics, outputs;
  - models: list, detail, retrain.
- **`platform.ts`:** dashboard, map, analytics, public impact, alerts, events, uploads, assistant proxy, demo run/status, admin users/audit/overview, system status.
- **`internal.ts`:** datasets for training, the training callback, and assistant tools.

---

## 13. Function reference — Python AI service (`ai-service/`)

### `app/`

| Item | Purpose |
|---|---|
| `main.py` | FastAPI app. `service_auth` (constant-time key check). `ModelNotReady` → 503. The `x-inference-ms` header on every response. Routes `/health` and `/v1/{forecast, classify, predict-energy, rank-facilities, optimize-routes, train, assistant/chat}` |
| `schemas.py` | Pydantic request validation (types, ranges, list sizes) |
| `assistant.py` | §9 |
| `config.py` | Backend URL, service key, artifact and snapshot paths, assistant model |

### `ml/data/`
- **`loader.fetch(name)`:** pulls one of `waste_records | compositions | energy` from `/internal/datasets`.
- **`loader.snapshot()`:** writes a CSV plus a SHA-12 digest (keeping the last 5), so every model version records the exact data it saw.
- **`loader.post_callback()`:** reports training results to the API.
- **`validation.validate(name, df)`:** schema checks and range checks, plus composition sums within ±3%. Returns the cleaned frame and a report of rows in/out and drops per column.

### `ml/features/`
- **`cleaning.regularise_daily()`:** reindexes each source to a continuous daily calendar. Missing days are interpolated over time and flagged `imputed`. Outliers are found with a robust z-score on a 15-day rolling median/MAD; values beyond |z| > 5 are replaced by the median and flagged `outlier`.
- **`build.forecast_frame()`:** target = kg ÷ the source's median (scale-free across sources). Features: lags 1/2/7, rolling 7/14 means (shifted, no leakage), weekday, weekend, month sin/cos, day of month, business type.
- **`build.mix_features()` / `classifier_frame()`:** kg share per business type, log size, number of sources, month sin/cos.
- **`build.energy_row()` / `energy_frame()`:** one-hot stream and technology; efficiency, compatibility, utilization, over-capacity, capacity; moisture and its deviation from 75%; log kg; month sin/cos; historical yield.
- **`build.add_hist_yield()`:** **leakage-safe** historical yield — the expanding mean kWh/kg per facility+stream using **only earlier records**, falling back to the earlier technology mean.
- **`build.FEATURE_GROUPS`:** groups features for human-readable importance.

### `ml/training/`

| Module | Training procedure |
|---|---|
| `forecast.train` | validate → `regularise_daily` → features → time split (last 14 d test, prior 14 d validation) → LightGBM with early stopping → residual 10/90% quantiles → test metrics + **seasonal-naive baseline** → refit on all data with the tuned iteration count → gain importance |
| `classifier.train` | validate → features → time-ordered 80/20 split → random forest (300 trees, multi-output: 5 fractions + moisture), operator labels × 3 weight → per-stream MAE, moisture MAE, dominant-stream accuracy/P/R/F1 → refit on all data |
| `classifier.predict` | Per-tree predictions → normalized composition, per-stream std, moisture, **confidence = share of trees within 6 pp of the consensus on every stream** |
| `energy.train` | validate → drop material recovery → impute moisture → `add_hist_yield` → exclude yield outliers (robust z > 6) → time-ordered 70/10/20 → LightGBM predicting **kWh/kg** → per-stream relative residual σ on validation → test metrics + **historical-yield baseline** → backtest predictions for the test rows → refit → grouped importance, and per stream+technology mean yields and technology profiles (for pathway estimates) |
| `energy.confidence(σ)` | P(\|relative error\| ≤ 10%) = erf(0.10 / (σ√2)) |

### `ml/inference/predict.py`
- **`forecast()`:** recursive multi-step forecast from the history (cold start uses the declared average as lag history). Intervals widen with √horizon.
- **`classify()`:** wraps `classifier.predict`, plus kg per detected stream and the method note (mentions that an uploaded image is stored but no vision model is used).
- **`predict_facility()`:** yield × kg, a 90% interval from σ (× 1.6 if the facility has no history), confidence, and `_energy_split()` into biogas m³ / electricity / heat using documented CHP factors (6 kWh/m³, 38% electrical, 80% useful).
- **`pathways()`:** for each candidate technology of a stream, uses the ML prediction at a network-average facility, a literature factor (flagged) for landfill gas, or material recovery. Picks the best **available** option and gives the reason.
- **`model_feature_importance()`:** grouped gain importance for the UI.

### `ml/optimization/`
- **`ranking.rank()`:** for each facility:
  1. `_eligibility()` checks status, free capacity ≥ batch, moisture ≤ limit, and compatibility ≥ 50%;
  2. it predicts kWh;
  3. `_components()` normalizes: energy relative to the best candidate; efficiency, compatibility and free capacity as fractions; cost, CO₂ and distance on **absolute** scales (₹5,000 / 100 kg / 100 km);
  4. `_score()` computes 100 × (Σ w·benefits − Σ w·costs + Σw_costs) ÷ Σw_all;
  5. candidates are sorted, then 1,000 Monte-Carlo draws of the energy predictions give **decision stability**;
  6. **decision drivers** = each criterion's share of the winner's score;
  7. `explain()` writes the headline, bullets (energy gain vs runner-up, efficiency difference, compatibility, utilization, extra transport cost, historical yield), per-facility comparisons, the "vs nearest facility" sentence, and the net energy advantage.
- **`routing.optimize()`:**
  1. uses the real road distance and drive-time matrices sent by the API (OSRM), or builds a great-circle × road-factor matrix if none were sent;
  2. computes the **baseline** (individual round trips);
  3. `_ortools()` sets up: arc cost = metres; fixed cost per vehicle (encourages consolidation); capacity dimension (remaining capacity); time dimension (travel + 8 min service, soft upper bound on each window); **drop penalties by urgency**; PATH_CHEAPEST_ARC + GUIDED_LOCAL_SEARCH, 2 s limit. Falls back to `_heuristic()` (nearest neighbour + 2-opt);
  4. per route it returns km, duration, ETAs, load, savings %, **score** = 100 × (0.5 × min(1, savings/40%) + 0.25 × fill + 0.25 × on-time share), and the explanation.

### `ml/models/registry.py`
- **`next_version`:** `v{n}.{timestamp}`.
- **`save`:** writes `model.joblib` + `metadata.json` and the `current.json` pointer, and hot-swaps the model in memory.
- **`load`:** loads the current version lazily.
- **`status`:** reports what `/health` shows.

### `ml/pipelines/train.py`
- **`train_one(key)`:** fetch → snapshot → train → version → save.
- **`run_jobs()`:** trains sequentially under a lock and calls back the API with success or failure.
- **`start_background()`:** what `/v1/train` uses.
- **CLI:** `python -m ml.pipelines.train --all`.

---

## 14. Function reference — Frontend (`frontend/`)

| File | Purpose |
|---|---|
| `lib/api.ts` | `api.get/post/put/patch/upload` add the Bearer token and parse errors (including zod field details). On 401 they clear the session and redirect to login. `WS_URL` |
| `lib/format.ts` | Number/date formatting (en-IN), stream colours (validated colour-blind-safe palette), technology/business labels, `cx` |
| `store/auth.ts` | Zustand store (persisted) with token + user, and role labels |
| `store/live.ts` | Live events, truck positions, demo state machine (`demoStart/demoStage/demoFinish`) |
| `hooks/useLiveSocket.ts` | WebSocket with reconnect back-off. Event → cache invalidation map. Demo stage handling |
| `components/shell/AppShell.tsx` | Guard, role-filtered sidebar, top bar (demo button, assistant, notifications, profile), system status |
| `components/map/NetworkMap.tsx` | MapLibre GL map (keyless CARTO style; set `NEXT_PUBLIC_MAP_STYLE` for Amazon Location). GeoJSON layers for sources/hubs/facilities/vehicles/routes plus extra lines. Click popups. Merges live positions. Fits bounds to highlighted lines |
| `components/charts/index.tsx` | `FlowSankey`, `PredictedVsActual`, `TrendArea`, `SimpleBars`, `HBars`, `InputOutputPair`, `CalibrationScatter`, `ForecastChart`, `CompositionBar`, shared tooltip |
| `components/ui/index.tsx` | Panel, Kpi, Badge/Status, SimTag, Button, PageHeader, Field/Input/Select, table cells, Meter, BarList, SeverityIcon |
| `features/decisions/DecisionView.tsx` | The explainable decision view (headline stats, inputs, why, drivers, model importance, ranking table, map, approve/override, outcome) |
| `features/hub/ShipmentTable.tsx` | Shipment table with **Analyze Waste** |
| `features/pickups/RequestPickup.tsx` | Quote + confirm dialog |
| `features/demo/DemoOverlay.tsx` | Live 11-stage narration panel |
| `features/assistant/AssistantDrawer.tsx`, `Markdown.tsx` | Chat UI showing the tools called, plus a safe Markdown renderer (no raw HTML) |
| `app/**/page.tsx` | One file per route in the information architecture. Dynamic routes are server components that await `params` and render a client component |

---

## 15. Data model and the lifecycle of one kilogram of waste

```
users ─< waste_sources ─< waste_records          (daily generation; pickup_id once collected)
              │
              └─< pickup_requests >─ routes ─< route_stops
                         │              │
                         └──────────► shipments ─< waste_compositions (lab_audit | ai | operator)
                                        │   └─< waste_classifications ─< feedback_records(kind=classification)
                                        ├─< ai_decisions ──► facilities ─< facility_capabilities
                                        └─< energy_predictions ─< energy_outputs
                                                   └──────────────┴──► feedback_records(kind=energy)
model_versions ─< training_runs        alerts   notifications   audit_logs   events   system_settings
```

The life of 1 kg of food waste from the MCD Central Zone:
1. It is part of a daily `waste_records` row, and the forecaster learns from it.
2. A **pickup_request** (REQUESTED) is created, by the generator or automatically by the fill-level sweep.
3. The VRP puts it on a **route** (ASSIGNED). The truck leaves (EN_ROUTE) and passes the stop (COLLECTED).
4. At the hub it becomes part of a **shipment**. The weighbridge reading is recorded, and a new `waste_records` row stores the actual quantity collected.
5. The **classification** says it is about 63% likely to sit in the organic fraction. The operator confirms or corrects; a correction becomes a training label.
6. **Energy predictions** for each pathway are made. The **ai_decision** ranks the facilities, and the operator approves.
7. A **dispatch route** carries it to Tehkhand WtE. The facility meter records **energy_outputs**.
8. A **feedback_records** row stores predicted vs actual. The next **training_run** consumes it, and a new **model_version** goes live. The next kilogram is ranked with a better model.

---

## 16. Security model

| Control | Where |
|---|---|
| Passwords hashed with bcrypt (cost 12 on register) | `api/auth.ts` |
| JWT (12 h) + logout revocation | `middleware/auth.ts` |
| RBAC on every mutating route; generator data scoped to the owner | `requireRole`, ownership checks in handlers |
| zod validation + HTML/control-character sanitization | `middleware/http.ts` |
| Rate limits: 600/min globally, 30/15 min on auth | `index.ts`, `api/auth.ts` |
| Helmet headers, CORS allow-list, 1 MB JSON limit | `index.ts` |
| Uploads: magic-byte type check, 8 MB, random keys, strict key regex on read | `api/platform.ts` |
| Service-to-service key compared in constant time (both directions) | `requireService`, `app/main.py` |
| No secrets in the browser; Next.js proxies `/api` | `next.config.ts` |
| Audit log of every state change (who, what, entity, details, IP) | `services/audit.ts` |
| Fail-fast on missing secrets in production | `config.ts` |
