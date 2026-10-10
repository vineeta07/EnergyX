# WattCycle
**Turn every waste stream into its highest-value energy destination.**

WattCycle is an AI waste-to-energy optimization platform. It runs one closed loop:

```
WASTE NETWORK → COLLECTION OPTIMIZATION → PROCESSING HUB → AI CHARACTERIZATION → ENERGY PREDICTION
→ FACILITY OPTIMIZATION → ROUTE → ENERGY CONVERSION → ACTUAL OUTPUT → FEEDBACK → MODEL IMPROVEMENT
```

> **New here?** Read the **[detailed user & system guide](docs/USER_GUIDE.md)**. It walks through every role's flow screen by screen, what each button calls, and what every function does. The models, their data contracts and the plan to move to real data are in **[docs/AI_SCHEMA.md](docs/AI_SCHEMA.md)**.

The platform does not send waste to the nearest facility. It sends it where it maximizes **useful energy**, net of transport cost, carbon, and capacity.

## Architecture

| Part | Stack | Port | Role |
|---|---|---|---|
| `server/` | Node.js · Express 5 · TypeScript · PostgreSQL · zod · JWT · ws | 4000 | Auth & RBAC, all data, the closed-loop state machine (`services/pipeline.ts`), domain events + WebSockets, audit log, scheduler, demo orchestrator |
| `ai-service/` | Python · FastAPI · LightGBM · scikit-learn · OR-Tools · Anthropic SDK | 8000 | All AI: forecasting, composition classification, energy prediction, facility ranking, VRP routing, training pipeline, assistant |
| `frontend/` | Next.js 16 · React 19 · Tailwind 4 · Recharts · MapLibre · TanStack Query · Zustand · Framer Motion | 3000 | Landing, auth, role-based dashboards, 20+ app screens |
| `infra/` | Docker · docker-compose (PostGIS + Redis) · Terraform · AWS notes | | See `infra/aws/README.md` |

The browser only talks to Next.js, which proxies `/api` to Node. Node calls the AI service with a shared service key. The AI service reads training data and assistant tools from Node's `/internal/*` API, so no service shares a database connection.

### Models (`ai-service/ml/`)
| # | Job | Approach | Held-out result (time-based split) |
|---|---|---|---|
| 1 | Waste generation forecast | LightGBM, scale-normalised lags, recursive 7-day forecast with intervals | MAPE ≈ 7.6% vs 11.9% seasonal-naive |
| 2 | Waste composition | Multi-output random forest on source mix, size and season. Labels are lab audits plus operator corrections (3× weight). Confidence = ensemble agreement | MAE ≈ 1.2 percentage points per stream |
| 3 | Energy yield | LightGBM on kWh/kg with leakage-safe historical facility yield, 90% intervals, calibrated confidence | MAPE ≈ 6.9%, R² 0.99 vs 7.5% historical-yield baseline |
| 4 | Destination optimization | Configurable weighted utility over eligible facilities, plus Monte-Carlo decision stability | Rule-based by design (auditable) |
| 5 | Route optimization | OR-Tools CVRP, soft time windows, urgency penalties, guided local search | Distance saved vs individual trips is reported per route |

Training pipeline (`ml/pipelines/train.py`): raw export → snapshot → validation → cleaning (missing days, robust-z outliers) → features → split → train → evaluate against naive baselines → versioned artifact → registry → callback to the API. Feedback rows are then marked as consumed. Retraining is triggered by bootstrap, the Retrain buttons, the nightly schedule, or the feedback-volume rule. Models never "self-train."

## Run locally (Windows / macOS / Linux)

Requirements: Node 20+ and Python 3.11+.

```bash
cd server && npm install
cd ai-service && python -m venv .venv && .venv/Scripts/pip install torch --index-url https://download.pytorch.org/whl/cpu && .venv/Scripts/pip install -r requirements.txt   # macOS/Linux: .venv/bin/pip
cd frontend && npm install
```

Download the pretrained waste image classifier (needs `git lfs`, about 28 MB):

```bash
git clone https://huggingface.co/Darshan764/waste-classification-v2 ai-service/ml/models/pretrained/waste-classification-v2
```

Start the three services in separate terminals:

```bash
cd server && npx tsx src/index.ts
```
```bash
cd ai-service && .venv/Scripts/python -m uvicorn app.main:app --port 8000
```
```bash
cd frontend && npm run dev
```

1. On first start the API seeds a **simulated** Delhi NCR network: 20 sources (~2,300 daily records), 8 vehicles, 3 hubs, 6 facilities, 220 lab-audited shipments and ~530 meter readings. The data lives in embedded PostgreSQL (PGlite) under `server/data/`.
2. The scheduler then bootstrap-trains all models through the AI service, which takes about 15 seconds.
3. Open http://localhost:3000 → **Launch Dashboard** → pick a demo role. Every demo account uses the password `demo1234`.
4. Press **Run Full Optimization**. It takes about 25 seconds and runs every stage through the real pipeline. Only truck movement and the facility meter reading are simulated.

Optional: set `ANTHROPIC_API_KEY` for the AI service to turn on Claude (`claude-opus-5-5`) for WattCycle Intelligence. Claude answers via tool calls against live data. Without the key, an offline router answers from the same tools. Each answer lists the tools it called.

Docker (real PostGIS + Redis):

```bash
JWT_SECRET=... SERVICE_KEY=... docker compose -f infra/docker/docker-compose.yml up --build
```

Reset the demo data:

```bash
cd server && npx tsx src/database/seed.ts --reset
```

## Tests

```bash
cd server && npm test
```
```bash
cd ai-service && .venv/Scripts/python -m unittest discover -s tests -t .
```
```bash
cd ai-service && .venv/Scripts/python -m ml.evaluation.vision_eval --per-dataset 300
```

The first two run in CI (`.github/workflows/ci.yml`) along with typechecks and `next build`. The third is a manual real-photo vision evaluation; it needs the datasets in `ml/data/datasets/`.

## Demo script (2 minutes)
1. **Overview:** KPIs, Sankey (source → stream → pathway → outcome), live map with moving trucks, AI decision cards, predicted vs actual.
2. **Run Full Optimization:** watch the 11 stages stream in.
3. **Inspect AI decision:**
   - inputs, model output and confidence
   - the "why" bullets and decision drivers
   - the ranking of every facility
   - approve or override with a reason
4. **City Planner:** MCD's current zone→plant assignment vs the optimized one (+152 MWh/day, −633 TPD landfilled). Toggle the published expansions.
5. **AI Models:** pipeline, metrics vs baselines, feedback rows waiting for the next run. Press **Retrain**.
6. **Assistant:** ask "Why did the AI select Tehkhand WtE?"

## Roles
| Role | Can |
|---|---|
| Waste Generator | Register sources (live estimates), see forecasts, request pickups with a quote, track status, view impact |
| Fleet Operator | Pickup board, run OR-Tools optimization, recalculate, dispatch, mark collected/delivered |
| Hub Operator | Weighbridge, Analyze Waste, confirm/edit/reject classification (edits become training labels), energy pathways, approve/override destinations |
| Energy Facility | Facility console, incoming loads, report metered output (or read the simulated meter), status |
| System Operator | Everything above, plus optimizer weights, retraining, users, audit log |

## Security
- Passwords hashed with bcrypt.
- JWT with logout revocation.
- Per-route RBAC.
- zod validation plus input sanitization.
- Global rate limit, and a stricter one on auth endpoints.
- Helmet and a CORS allow-list.
- Uploads are checked by magic bytes, limited to 8 MB, and given random keys. S3 with presigned URLs in AWS mode.
- Service-to-service key compared in constant time.
- No secrets in the frontend.
- Audit log for every state-changing action.

## Team plan: four people, four lanes

The codebase already splits along three service boundaries plus infrastructure. The fastest way to work is to **assign one owner per boundary**. Each person then works in their own folder almost all the time, merge conflicts stay rare, and the only coordination needed is on a few explicit **contracts** between lanes.

### Lanes and ownership

| Lane | Owner | Owns (folders) | Mission |
|---|---|---|---|
| **A · AI / ML** | Colleague 1 | `ai-service/` | Make predictions better and more trustworthy |
| **B · Backend & data** | Colleague 2 | `server/` | Make the loop robust, secure and production-shaped |
| **C · Frontend & UX** | Colleague 3 | `frontend/` | Make the 2-minute judge experience flawless |
| **D · Cloud, DevOps & quality** | Colleague 4 | `infra/`, `.github/`, `docs/`, the demo script | Make it deployable on AWS, tested, and pitch-ready |

### Contracts (the only shared surfaces)

Change a contract only in a PR that **both listed owners approve**. Everything else is owner-merges.

| Contract | Files | Owners |
|---|---|---|
| Node ↔ AI request/response shapes | `server/src/services/aiClient.ts` ↔ `ai-service/app/schemas.py` | B + A |
| Training data & assistant tools | `server/src/api/internal.ts` ↔ `ai-service/ml/data/loader.py`, `ai-service/app/assistant.py` | B + A |
| Public REST API used by the UI | `server/src/api/*.ts` ↔ `frontend/lib/api.ts` and page queries | B + C |
| Database schema | `server/src/database/schema.sql` (B owns; A is consulted when training tables change) | B (+A) |
| Domain events → UI cache invalidation | `server/src/services/events.ts` ↔ `frontend/hooks/useLiveSocket.ts` | B + C |
| Env vars, ports, Docker images | `.env.example` files, `infra/docker/*` | D + the service owner |

### Backlog per lane (highest judge impact first)

**A · AI / ML (`ai-service/`)**
1. **Energy model accuracy.** Add quantile LightGBM models for real prediction intervals. Tune with time-series CV. Add features such as weather/temperature for digesters and the facility's recent 7-day yield. Target: hero-demo error under 5%.
2. **Drift and feedback.** Compute rolling MAPE per facility in the AI service. Expose `/v1/model-health`. Weight live feedback rows above backtest rows in retraining.
3. **Forecasting.** Add holiday and festival calendar features, plus a per-source "anomaly today" flag. Feed the anomaly into alerts.
4. **Vision path.** Build an image-labelling flow from hub uploads. Once ~300 labels exist, train a small fine-tuned CNN/ViT. Keep the tabular model as fallback, and blend both by confidence.
5. **Routing.** Add multiple depots, vehicle start positions and real time windows. Add an "insert new pickup into a live route" endpoint.
6. **Assistant.** Add tools for alerts and per-source forecasts. Write an eval set of 20 questions with expected tool calls.

**B · Backend & data (`server/`)**
1. **Tests.** Add Vitest + supertest over `pipeline.ts`, covering REQUESTED→…→feedback, overrides and RBAC denials. Mock the AI service.
2. **Migrations and Postgres parity.** Move to versioned migrations (e.g. `node-pg-migrate`). Run against docker PostGIS in CI. Use `ST_DWithin` for consolidation candidates.
3. **AWS adapters behind interfaces.** Implement EventBridge publish in `events.ts`, S3 presigned uploads in `platform.ts`, and Redis in `cache.ts` + token revocation. All three are switched by env vars.
4. **OpenAPI spec** generated from the zod schemas. Lane C then gets typed clients.
5. **Hardening.** Add refresh tokens, pagination on list endpoints, request IDs and structured logging (pino), and idempotency keys on demo and dispatch.

**C · Frontend & UX (`frontend/`)**
1. **Demo polish.** Animate the hero truck on the map during the demo. Auto-scroll to the decision. Add a "replay last run" mode that works offline.
2. **Explainability views.** Add a "what-if" weight slider on the decision page that re-ranks facilities without saving (uses `/ai/rank-facilities`). Add a side-by-side facility comparison.
3. **Accessibility and data viz.** Table view for every chart, keyboard navigation, focus states, skeleton loaders, empty/error states on every query.
4. **Mobile.** Bottom navigation for the generator and fleet roles. Make the pickup request flow work one-handed.
5. **E2E tests** (Playwright): log in as each role and click through its main flow. These double as the demo rehearsal.

**D · Cloud, DevOps & quality (`infra/`, CI, docs)**
1. **CI.** GitHub Actions running typecheck, lint, the Python import/training smoke test (`python -m ml.pipelines.train --all` against a seeded API) and `next build` on every PR.
2. **Deploy.** Finish Terraform: ECS services, ALB with WebSocket support, Cloud Map, CloudFront, ECR repos, and secrets wiring. One-command deploy script, plus a hosted demo URL for judges.
3. **Observability.** CloudWatch dashboard (API latency, AI inference ms from the `x-inference-ms` header, rolling MAPE metric, queue depth) and the drift alarm.
4. **Realism of demo data.** Calibrate simulator factors against published AD/RDF yields and document the sources in `docs/`. Keep everything flagged SIMULATED.
5. **Pitch.** Own the 2-minute script, the architecture slide (`infra/aws/README.md`), and a backup screen recording of the demo.

### Phases

| Phase | Goal | A · AI | B · Backend | C · Frontend | D · Cloud/QA |
|---|---|---|---|---|---|
| **1 · Stabilise** (day 1) | Everyone can run, test and trust `main` | Model eval report + pinned seeds | Pipeline tests | Error/empty states | CI on every PR |
| **2 · Improve** (days 2–3) | Biggest quality wins per lane | Quantile intervals, drift endpoint | AWS adapters, migrations | What-if slider, demo polish | Terraform deploy, staging URL |
| **3 · Integrate & rehearse** (day 4) | Contracts frozen, demo rehearsed | Assistant eval set | OpenAPI + typed client handoff | Playwright role flows | Dashboards, backup recording, pitch |

Contracts **freeze at the start of phase 3**. After that, only fixes go in.

### Working agreement
- **Branches:** `a/<topic>`, `b/<topic>`, `c/<topic>`, `d/<topic>`. Make small PRs into `main`. Rebase daily.
- **Reviews:** each PR gets one reviewer from the lane on the other side of the contract it touches. If it touches no contract, the reviewer rotates (A↔B, C↔D).
- **Definition of done:** CI green, `Run Full Optimization` still completes, and any number shown in the UI is either computed or labelled SIMULATED.
- **Sync:** a 10-minute daily stand-up focused on contract changes and blockers. Keep one shared doc listing upcoming contract changes.
- **Never commit generated state:** `server/data/`, model artifacts, snapshots, `.env`. These are already in `.gitignore`. Reset locally with `npx tsx src/database/seed.ts --reset`.

## Honesty notes
- **Real Delhi data:** the network is built from published Delhi figures (`server/src/database/realdata/delhi.ts`):
  - 12 MCD zones with wards, daily tonnage and current disposal site (DPCC/MCD);
  - 4 WtE plants with real TPD and MW, 2 landfills, the commissioning Ghogha biomethanation plant, and 6 MRFs;
  - 40% biodegradable city composition;
  - OpenStreetMap coordinates.
- **Simulated data (labelled):** day-to-day tonnage around each zone's published average, individual transfer loads, hubs, trucks, per-load composition variation and plant meter readings. Meter readings are calibrated so each plant averages its published MW ÷ TPD. No public Delhi source publishes these at that granularity. Every generated row is flagged `is_simulated`.
- **Waste photos:** classified by the pretrained `Darshan764/waste-classification-v2` model. On independent real photos it scores 62–79% (79–91% when confident); see `docs/AI_SCHEMA.md`.
- **Distances:** real road distances and drive times from OpenStreetMap via OSRM, cached in `road_distances`. Points without a cached pair fall back to great-circle × 1.25. Amazon Location Service would replace OSRM in AWS mode.
- **Emission factors:** 0.71 kg CO₂/kWh grid and 0.45 kg CO₂e/kg organic landfill. These are shown on `/impact`. Replace them with official factors for production.
