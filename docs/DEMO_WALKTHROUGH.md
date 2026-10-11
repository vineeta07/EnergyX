# WattCycle — Complete Demo Walkthrough (every role, every screen)

This is the **click-by-click** guide for recording the hackathon video or giving a live demo. It covers:
- where to log in and which account to use;
- every page in the app, which role sees it, the exact nav item to click, what to click on the page, what it means, why it exists, and a line you can say;
- the order to record it in.

For the AWS console part and judge Q&A, see [HACKATHON_VIDEO_SCRIPT.md](HACKATHON_VIDEO_SCRIPT.md).

> **Live URL:** https://dzqvfns5axtkw.cloudfront.net (running on AWS, region ap-southeast-2)
> **Local:** http://localhost:3000 (when you run the stack on a laptop)

---

## Part 0 — Before you start

### 0.1 How logging in works

1. Open the site and click **Open dashboard** (top right), or go to **`/login`**.
2. The login page has two halves:
   - **Left:** a normal email + password form. Ignore it for the demo.
   - **Right:** a list called **"One network, six roles"**. Each row is a demo account. **Click a row's "Open dashboard"** and you are logged in as that role, no typing needed.
3. **To switch roles:** click your name/initials at the top right → **Log out** (the door icon), then pick another row.

| Row on the login page | Account | Who this person is in real life | Lands on |
|---|---|---|---|
| **Resident** | resident@wattcycle.demo | A Delhi citizen sorting household waste | `/home` (resident app) |
| **System operator** | admin@wattcycle.demo | The city/company team running the whole network | `/dashboard` |
| **Waste generator** | generator@wattcycle.demo | MCD Central & South zone sanitation office | `/dashboard` |
| **Fleet operator** | fleet@wattcycle.demo | Collection & transport contractor | `/dashboard` |
| **Hub operator** | hub@wattcycle.demo | Supervisor at the Okhla Transfer & Sorting Hub | `/dashboard` |
| **Plant operator** | facility@wattcycle.demo | Operator at Tehkhand Waste-to-Energy plant | `/dashboard` |

All demo accounts use the password `demo1234`, but you never need to type it.

### 0.2 Things that are on every screen (top bar)

| Control | What it does | Why it matters |
|---|---|---|
| **Run a full load** (green play button) | Runs one complete load through the *real* pipeline in about 25 seconds, with a progress overlay | The one-click proof that the whole loop works end to end |
| **Ask WattCycle** | Opens the assistant drawer. Ask questions in plain English; it looks up live data | Operators get answers without hunting through screens |
| **Bell** | Notifications | Alerts reach the right person |
| **Language** (English / हिन्दी / বাংলা / தமிழ் / ਪੰਜਾਬੀ) | Switches the whole UI | Built for Indian field staff, not just English speakers |
| **Moon / sun** | Dark / light theme | |
| **Left sidebar** | Only the screens this role needs | Role-based access is enforced by the API too, not just hidden in the UI |

### 0.3 Pre-flight checklist (do this 10 minutes before recording)

1. Open the live URL and hard-refresh (Ctrl+F5).
2. Log in as **System operator** → click **Run a full load** once and let it finish. This warms up the AI models and puts fresh data on every chart.
3. Have 3–5 photos on your desktop:
   - single items: a plastic bottle, a food scrap, cardboard, a can, a shirt;
   - one photo of several items spread out on a table (for the bag check).
4. Browser at 100–110% zoom, notifications off, a clean browser profile.
5. **If "Run a full load" says no truck is free:** go to **Routes**, then **Dispatch** the planned routes or let the active ones finish (2–3 min).

---

## Part 1 — Recommended recording order (follows one kilogram of waste)

| # | Role / page | Time | Story beat |
|---|---|---|---|
| 1 | Landing page (logged out) | 0:30 | The problem and the proof |
| 2 | Resident | 1:00 | Waste starts in a home |
| 3 | Waste generator | 0:40 | A zone produces it; forecast; request pickup |
| 4 | Fleet operator | 0:50 | Trucks collect it on optimised routes |
| 5 | Hub operator | 1:30 | Weigh, AI sort, recyclable split, upcycle, choose plant |
| 6 | Plant operator | 0:40 | Plant reports the meter, closing the loop |
| 7 | System operator | 1:30 | Whole network, planner, models, Run a full load |
| 8 | Circular: upcycling + batteries | 1:00 | Beyond burning |
| 9 | AWS console | 1:30 | How it runs on AWS (see the video script) |

Total: about 9 minutes for the full version. For a 5–6 minute cut, do 1 → 7 (Run a full load) → 5 (classification page only) → 8 → 9.

---

## Part 2 — Public pages (logged out)

### 2.1 Landing page `/`
**Show:** scroll slowly from top to bottom.

| Section | Point at | Say |
|---|---|---|
| Hero | Headline, then the three numbers **+8% / −633 t / −19%** | "Send each load to the plant that makes the most power from it. On Delhi's real plants, that gives 8% more electricity, 633 tonnes a day less landfill and 19% fewer truck kilometres." |
| **Try a load** card (right) | Click **Plastic**, then **Food waste**; drag **Load size** | "Change what's in the truck and the plants re-rank live. The nearest plant isn't always the best one." |
| Road scene | Scroll; the truck drives to the plant and the label turns into **Meter: +784 kWh** | "One load: ward bins → hub scale → the chosen plant → metered energy." |
| Live counters | The four numbers | "Live from the demo network: tonnes weighed, MWh metered, CO₂ avoided, prediction accuracy." |
| How it works | Hover the six steps | "Six steps, and the last one, Learn, feeds the first." |
| Delhi result | The three bar cards | "Same waste, same plants. Only where each zone's waste goes changes." |
| Beyond the furnace | Three cards | "Burning is the last resort: recycle first, upcycle, give batteries a second life." |
| **Built on AWS** | The layered diagram | "CloudFront, Fargate, RDS, S3, EventBridge, Bedrock: one Terraform apply." |
| Six roles | Cards | "Every role has its own working screen." |

**Why it exists:** a judge decides in the first 30 seconds whether to keep watching, so proof sits above the fold.

### 2.2 `/about` (nav: **How it works**)
Deeper explanation of each model, the routing and the AWS services, with an honest **"(planned)"** label on SageMaker, ElastiCache, Amazon Location and IoT Core. **Show briefly**, only if asked "how does it work?".

### 2.3 `/impact` (nav: **Impact**)
Public impact numbers: waste processed, energy, CO₂, with the emission factors written out. **Why:** a city can publish this without giving anyone a login.

---

## Part 3 — Resident (citizen app)

**Login:** login page → **Resident** row → lands on **`/home`**. The sidebar changes completely; residents get their own app.

### 3.1 Home `/home` (nav: **Home**)
- **You see:** "Hello, {name}", your level and a **plant that grows** as you sort, your rank, a streak, badges, "What you sort most", and recent activity.
- **Why:** sorting at home is a habit problem. Points, a growing plant, streaks and a neighbourhood leaderboard make it stick.
- **Say:** "Waste starts in a home. Residents get points for sorting correctly, and their plant grows as they do."

### 3.2 Scan an item `/scan` (nav: **Scan an item**)
- **Do:** upload one item photo (e.g. the plastic bottle).
- **You see:** what the item is, **which bin** it goes in, whether it's **recyclable**, and whether it can be **remade** (upcycled).
- **Why:** most sorting mistakes happen because people don't know which bin. This answers it in one photo.
- **Say:** "One photo: the vision model names the item from 30 types and says which bin, and whether it's recyclable."

### 3.3 Check a whole bag `/bag` (nav: **Check a whole bag**)
- **Do:** upload the photo with several items spread out ("Lay things out so they do not overlap").
- **You see:** a box around **every item** in the photo, with the bin for each.
- **Why:** real bins hold many things at once.
- **Say:** "A YOLOv8 detector finds every item in one photo of a bag, and sorts each one."
- *If the detector is still loading after a restart, it says so and offers single-item scan instead.*

### 3.4 Plastic codes `/resin` (nav: **Plastic codes**)
- **Do:** tap a number 1–7 ("Turn the item over… tap the number you see").
- **You see:** what that plastic is, whether Delhi recyclers take it, and what it becomes.
- **Why:** the triangle code is the one label on every plastic item, and almost nobody knows what it means.

### 3.5 Upcycling ideas `/ideas` (nav: **Upcycling ideas**)
- **You see:** things worth making from waste, each with "You will need" and "Steps".
- **Why:** reuse at home is better than any facility.

### 3.6 Leaderboard `/leaderboard` (nav: **Leaderboard**)
- Points from sorting, the quiz, plastic codes, ideas and reports, compared with neighbours.
- **Why:** social comparison drives participation.

### 3.7 Daily quiz `/quiz` (nav: **Daily quiz**)
- **Do:** answer the 5 items ("Pick where each one goes").
- **Why:** teaches sorting in one minute a day; points once a day.

### 3.8 Where to take it `/dropoff` (nav: **Where to take it**)
- **Do:** click **Use my location**, or pick your area. Then pick what you're bringing.
- **You see:** the nearest recycling centres, upcycling workshops and the battery recycler, with distance, what each **turns it into**, and **Directions**.
- **Why:** connects residents straight to the circular partners the platform uses.

### 3.9 Report a problem `/report` (nav: **Report a problem**)
- **Do:** pick a problem (full bin, truck didn't come, dumping, burning) → **Use my location** → submit.
- **You see:** "Your reports" with status.
- **Why:** citizens become sensors. "The collection team for your area sees it straight away."
- **Say:** "Residents can report overflowing bins or illegal burning with their location; it goes straight to the collection team."

---

## Part 4 — Waste generator (MCD zone office)

**Login:** **Waste generator** row → **`/dashboard`**.

### 4.1 Dashboard `/dashboard` (nav: **Overview**)
- **You see:** **My waste sources** and **My pickups** (role-specific queue), plus the shared network map and activity feed.
- **Why:** a zone office only cares about its own sources and pickups.

### 4.2 Waste network `/waste-sources` (nav: **Waste network**)
- **You see:** "{n} sources, {t} t/day, about {kWh}/day of energy". Every registered source with its daily weight, next pickup and energy potential. The 12 real MCD zones are here, with ward counts.
- **Why:** you can't optimise waste you can't see. This is the inventory.

### 4.3 Source detail `/waste-sources/:id` (click any row, e.g. **MCD Central Zone**)
- **You see:**
  - **Forecast today / Forecast tomorrow / Next 7 days**: the LightGBM forecast with a range;
  - **Average quantity** and **Energy potential**;
  - the composition from lab-audited loads;
  - **Source of the published figures** (DPCC/MCD).
- **Do:** click **Request a pickup**. The drawer shows a **Suggested vehicle**, **Suggested route**, **Estimated cost** and **Estimated CO₂** before you confirm. Pick **urgency** and **quantity** → confirm.
- **Why:** pickups are requested *before* bins overflow, and the cost and carbon are visible upfront.
- **Say:** "The forecast says how much this zone will produce this week. Requesting a pickup shows the truck, route, cost and CO₂ before confirming."

### 4.4 Add a waste source `/waste-sources/new` (button **Add a waste source**)
- **You see:** a **Source profile** form, and on the right **"Worked out for this source"** with weekly volume, energy potential and collection frequency. It "updates as you type".
- **Do:** type a daily quantity and watch the right side change. You don't have to save.
- **Why:** onboarding a new bulk generator (a market, a hotel) takes one minute.

### 4.5 Collection `/pickups` (nav: **Collection**)
- **You see:** pickups moving through **Requested → Assigned → On the way → Collected → Delivered**.
- Click one → **`/pickups/:id`**: the **Pickup request**, its **Route**, the **Vehicle**, and an **Event timeline** of every step with timestamps.
- **Why:** full traceability. The generator sees exactly where their waste is.

---

## Part 5 — Fleet operator (collection contractor)

**Login:** **Fleet operator** row → **`/dashboard`**.

### 5.1 Dashboard
- **You see:** **Pickups with no truck (n)** and **Routes on the road**, plus a **Plan routes** button.

### 5.2 Collection `/pickups` → **Plan routes for open pickups**
- **Do:** click **Plan routes for open pickups**.
- **What happens:** Google **OR-Tools** groups the open pickups into truck routes. It respects each truck's **weight limit** and each pickup's **time window**, and urgent pickups are the last ones it would ever drop.
- **Say:** "One click: the solver consolidates pickups into routes. Urgent ones are protected, and trucks are never overloaded."

### 5.3 Routes `/routes` (nav: **Routes**)
- **You see:** **All routes**. Select one and you see:
  - stops in order on the map;
  - **Distance**, **Estimated time**, **Fuel**, **Cost**, **Route score**;
  - **Truck fill at the hub**;
  - **Progress, from live GPS**.
- The badges at the bottom say where road distances came from: **"OpenStreetMap through OSRM"**, or the straight-line fallback.
- **Do:** click **Dispatch** on a planned route and watch the truck move on the map. **Recalculate route** re-optimises when new pickups arrive.
- **Why:** fewer kilometres means less diesel, cost and CO₂ for the same waste.
- **Say:** "Each route shows distance, time, fuel, cost and how much shorter it is than separate trips. Trucks move live over WebSockets."

### 5.4 City plan `/planner` (nav: **City plan**; fleet, hub and admin can see it)
Covered in 7.3.

---

## Part 6 — Hub operator (Okhla Transfer & Sorting Hub)

This is the **heart of the demo**: where the AI decides.

**Login:** **Hub operator** row → **`/dashboard`** (**Hub queue**, **Plants waiting for your approval (n)**, **Open the hub**).

### 6.1 Processing hub `/hub` (nav: **Processing hub**)
- **You see:** four queues: **Incoming loads**, **Being sorted**, **Plants waiting for approval**, **Finished loads**.
- **Why:** the hub is where mixed waste becomes known waste.

### 6.2 Weighbridge `/hub/incoming` (button **All incoming loads**)
- **Do:** pick a load → type the scale reading → **Save the weight**.
- **Why:** "It replaces the declared total, and a load on the road is marked as received." Real weight, not what the zone declared.

### 6.3 One shipment `/hub/classification/:id` (click a shipment code like **WC-10xx** in any hub queue)
Walk down this page top to bottom; it is the whole AI story for one load.

1. **Step bar** at the top shows where this load is: weighed → sorted → reviewed → plant chosen → dispatched → energy recorded.
2. **Received load:** **Weighbridge** kg, **Moisture, estimated**, and the **Sources** it came from.
3. **Sort the load** (if it says "This load has not been sorted yet"):
   - **Do:** click the upload box ("Optional: photograph 5 to 20 items picked at random from the load") and add 3–5 photos, then **Sort this load**.
   - **You see** the **Sort result** panel: a donut with **organic / plastic / paper / metal / other** shares, mass and spread per stream, and the confidence.
   - **Photo sample audit:** each photo listed with what the vision model saw, its confidence, and a **recyclable / non-recyclable / biodegradable** tag.
   - **Say:** "The composition starts from the source mix, and the photos update it. Photos under 50% confidence are ignored and flagged for review."
4. **Human review:**
   - **Confirm**, **Edit**, or **Reject**.
   - **Do:** click **Edit**, change organic by a few %, then **Save the correction**.
   - **Say:** "Operators stay in control. A correction becomes labelled training data that counts three times in the next retraining."
5. **Recyclable vs non-recyclable** panel:
   - **You see:** recyclable %, non-recyclable %, and the biodegradable share, then a per-stream table. Plastic and paper show their recyclable share; the basis says "prior" or "prior + photos".
   - **Say:** "Thin film, cutlery, styrofoam and lined cups aren't recyclable in Delhi; PET, cans, cardboard and paper are. The recyclable part goes to recycling, not to the furnace."
6. **Upcycling opportunities** panel:
   - **You see:** estimated upcyclable kg for textiles, glass, PET, HDPE and cardboard.
   - **Do:** click **Set aside** next to Textiles. An upcycle lot appears under "Upcycle lots from this load".
7. **Energy prediction** panel (appears after review; click **Predict energy** if it doesn't load by itself):
   - Organic headline: **Recommended technology**, **Biogas**, **Electricity**, **Heat**, **Confidence**.
   - Per-stream option lists, each with its *basis*. Streams show **"+x kg recyclable → MRF"** and **"+x kg upcycled"**: what was taken out first.
8. **Compare plants and pick one** ("Scores every eligible plant for each stream, using the weights in Settings"):
   - **Do:** click it. The **Choice of plant** section appears.
   - **You see:** one decision per stream.
   - **Recycling pathway** decisions send recyclable plastic and paper to the nearest MRF.
   - **Plant decisions** for the energy streams: **every plant ranked**, with predicted kWh, **Distance**, **Transport** cost, **Compatibility**, **Capacity used**, the **Excluded** plants with their reasons, **"What the energy model relies on most"**, and **"Chance the error stays within 10%"** (a Monte-Carlo stability check).
9. **Approve or override:**
   - **Approve this plant** dispatches a truck to that plant.
   - Or **Choose this plant instead**, with a required **reason** that's kept in the audit log.
   - **Say:** "The AI recommends; a human approves. Overrides need a written reason, and the outcome is still measured against what the model predicted for that plant."
10. **Prediction record** (bottom: "Predicted kWh, metered kWh and the training row they produce"): predicted, metered, error and model for each stream, filled in once the plant reports.

### 6.4 Plant decisions `/ai-decisions` (nav: **Plant decisions**)
- **You see:** every decision across all loads, **Error against the meter**, the **Scoring weights** in use, and a **Decision log**. **Open full page** on any decision shows the same detail as 6.3.8.
- **Why:** auditability. Every plant choice can be explained later with its inputs, ranking, weights and model version.

### 6.5 Upcycling and Battery second life
Covered in Part 8. The hub operator runs these day to day.

---

## Part 7 — System operator (whole network)

**Login:** **System operator** row → **`/dashboard`**. This role sees everything.

### 7.1 Overview `/dashboard`
- **You see:**
  - "Last 30 days: x sorted, y of useful energy";
  - **Where the waste went** (flow);
  - **Network map**: sources, trucks, hubs, plants and active routes, with trucks moving as GPS updates;
  - **Plant decisions** with reasons;
  - **Energy: predicted and metered**;
  - **Recent activity**: events as they happen over WebSocket.
- **Say:** "The whole loop on one screen. Every event you see here is also published to Amazon EventBridge."

### 7.2 Run a full load (top bar button)
- **Do:** click **Run a full load**. An overlay, **"One full load, start to finish"**, shows each stage lighting up:
  - forecast;
  - 3 pickups from MCD Central, South and West (10 t);
  - OR-Tools route;
  - truck drives;
  - AI classification;
  - energy prediction;
  - all plants ranked;
  - best plant chosen;
  - dispatch;
  - meter reading;
  - feedback.
- At the end it shows **Predicted vs Metered** (typically about 2% error) and **See the plant decision**.
- **Say:** "Every stage calls the real pipeline. Only the trucks and the plant meter are simulated."

### 7.3 City plan `/planner` (nav: **City plan**)
- **You see:**
  - **MCD current** vs **WattCycle plan**: electricity (MWh/day), sent to landfill, haulage;
  - **Tonnes a day, by plant**;
  - **Zone to plant flows**;
  - **Allocation by zone**, labelled "Real Delhi data".
- **Do:** tick a capacity addition under **Scenarios** (e.g. a commissioning plant) and the plan re-solves. Then **Reset**.
- **Why:** the same AI that routes one load also plans the city: which zone should feed which plant, within capacity limits.
- **Say:** "On Delhi's real zones and plants: about 8% more electricity, 633 tonnes a day less landfill, 19% fewer truck tonne-kilometres. And you can test what a new plant would change before it's built."

### 7.4 Plants `/facilities` (nav: **Facilities**)
- **You see:** every real plant (Okhla, Tehkhand, Ghazipur and Bawana WtE, Ghogha biomethanation, the MRFs, the landfills) with capacity, what it accepts and its performance.
- **Add a plant** → **Save plant**: "A new plant can receive loads straight away. Until it has a history, the energy model uses network averages and gives a wider range."
- Click a plant → **`/facilities/:id`**: throughput, efficiency, predicted vs metered, dispatches.

### 7.5 Energy `/energy` (nav: **Energy**)
- **You see:** output **By waste stream** and **By technology**, **Waste in, energy out**, **Predicted and metered over time**, and **Prediction calibration**. Each dot is one batch; "the dashed line is a perfect prediction".
- **Say:** "This is the evidence the model works: predicted against metered, batch by batch."

### 7.6 Analytics `/analytics` (nav: **Analytics**)
- Waste trend, energy trend, generation by source type, **Grid CO₂ displaced**, predicted vs metered, **Model error by week**, and plant performance over the last 30 days.

### 7.7 Models `/ai-model` (nav: **Models**)
- **You see:**
  - the **Training pipeline**: validate → clean → features → train → evaluate against baselines → versioned artifact, saved to S3;
  - each model's held-out score vs a naive baseline;
  - **Model 4: Plant choice** (weighted score + Monte-Carlo), **Model 5: Routing** (OR-Tools);
  - **Latest feedback from real use**;
  - **Training runs**;
  - **Data quality in the last run**.
- **Say:** "Models only change through a logged retraining run, and they're tested on days they never saw."

### 7.8 Alerts `/alerts` (nav: **Alerts**)
- Full bins, late trucks, overdue pickups, odd load mixes, **energy readings off the prediction**, **drifting models**, uncertain sorting, all raised automatically, each with possible causes. **Acknowledge** / **Resolve**.

### 7.9 Settings `/settings` (nav: **Settings**)
- **How plants are scored:** the weights for energy, efficiency, compatibility, capacity, cost, carbon and distance. "Each decision records the weights it used." Only system operators can change them.
- **When models retrain:** the schedule and the drift threshold.
- **Why:** policy is configurable. A city that cares more about carbon than cost moves one slider.

### 7.10 Admin `/admin` (nav: **Admin**)
- **Services** (API, database, prediction service status), **Users**, and the **Audit log** of every change: who approved, who overrode and why.

---

## Part 8 — Circular economy (hub operator or system operator)

### 8.1 Upcycling `/upcycling` (nav: **Upcycling**)
- **You see:** counters for **Diverted to upcycling**, **CO₂e avoided**, **Partner payments**, **Products made**, then **Upcycle lots**.
- **Do:**
  1. Click the lot you set aside in 6.3.6 (or **New lot**).
  2. **Match partner with AI.** The ranking shows score, learned acceptance, net value, CO₂e avoided and km, plus excluded partners with reasons, compared with the **default route** (e.g. textiles → WtE).
  3. **Dispatch to {partner}.**
  4. **Record partner receipt.** Enter the accepted kg; the AI's expected kg is shown.
  5. **Record products**, e.g. "tote bags, 40".
- **Partners table** (bottom): each partner's received kg, accepted kg and **observed acceptance**. This updates with every receipt (the feedback loop).
- **Say:** "Textiles, jars and PET bottles are worth more whole. The AI matches each lot to the partner who pays most, saves most carbon and actually accepts the material, and it learns that acceptance from every receipt."
- *Partners are labelled DEMO PARTNERS: generic names at real Delhi localities.*

### 8.2 Battery second life `/batteries` (nav: **Battery second life**)
- **Top note:** "Combined old batteries store electricity; they don't generate it." Say this on camera.
- **Counters:** units tested (A / B / R), second-life storage kWh, electricity delivered, new-battery CO₂e avoided, kg sent to recycling.
- **Do:**
  1. In **Battery lots (intake)**, click a lot (e.g. **Laptop & power-bank 18650 cells**).
  2. **Run tester (simulated readings).** Or open "…or paste real tester CSV" for real data.
     - **You see:** the **AI grading** scatter, state of health vs internal resistance, coloured **A / B / R**; the median remaining cycles; why units were rejected.
  3. Pick an application (**Hub solar storage 48 V**, **E-rickshaw pack**, **Solar street light 12 V**, **Telecom backup**) → **Design pack with AI**.
     - **You see:** the configuration (e.g. **13S14P**), usable kWh, **group imbalance (e.g. 0.04% vs about 11% unmatched)**, predicted life, CO₂e avoided, and cost vs a new pack.
     - The **group-capacity bar chart** shows every series group equal; the weakest is highlighted.
  4. **Mark assembled** → **Deploy** at a hub → **+90 days telemetry**. The **predicted vs measured SoH** chart appears, and the observed fade updates the chemistry's prior.
  5. **Send to authorised recycler** for grade-R units, with expected recovery (black mass, copper, aluminium, or lead).
- **Say:** "Batteries are tested one by one. The AI combines the healthy cells into balanced packs with OR-Tools: imbalance drops from 11% to under 0.1%. Packs store rooftop solar for the hub, and real wear feeds back into grading. Dead cells go to an authorised recycler under India's Battery Waste Management Rules."

---

## Part 9 — Plant operator (Tehkhand WtE)

**Login:** **Plant operator** row → **`/dashboard`** ("{plant}: loads waiting for a meter reading" + **Plant console**).

### 9.1 Plant console `/facilities/:id` (button **Plant console**)
- **You see:** loads delivered to this plant that still need a meter reading, each with its **Predicted** kWh.
- **Do:** click **Read the simulated meter** on a delivered load, or type a **Meter kWh** value and save.
- **What happens:** the reading is stored next to the prediction. That creates a **feedback row** and an `AITrainingDataCreated` event. If the error is over 15%, an **energy deviation** alert is raised.
- **Why:** this closes the loop. Without the meter there's no learning.
- **Say:** "The plant reports what it actually produced. That number goes next to the prediction and becomes training data; that's how the system gets less wrong over time."

---

## Part 10 — Ask WattCycle (assistant)

**Any operator role** → **Ask WattCycle** (top bar). Try:
- "Which plant should take organic waste today and why?"
- "How much spare capacity does Okhla have?"
- "What's the prediction error this week?"

It answers from live data. On AWS it is wired to **Claude on Amazon Bedrock**. While our account's Bedrock access is being approved, it runs on its built-in rule engine; say so if asked.

---

## Part 11 — Honesty checklist (what's real vs simulated)

| Real | Simulated, and labelled in the app |
|---|---|
| Delhi's 12 MCD zones, wards, daily tonnage | Day-to-day tonnage variation |
| Plant capacities and MW (Okhla, Tehkhand, Ghazipur, Bawana), landfills, MRFs | Truck GPS movement |
| OpenStreetMap road distances (where cached) | Plant meter readings (calibrated to each plant's published MW ÷ TPD) |
| The vision model (30 classes) and the YOLOv8 detector | Battery tester readings, pack telemetry |
| OR-Tools routing, LightGBM models, the CP-SAT pack design | Upcycling partners (generic names) |

Second-life packs **store** energy; they don't generate it. SageMaker, Amazon Location and IoT Core are **planned**, not live; don't claim them.
