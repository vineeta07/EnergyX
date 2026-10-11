# WattCycle — Hackathon Video: the complete package

**One document to record from.** Every scene has three parts:

- 🧭 **GO TO**: exactly where to click
- 👀 **ON SCREEN**: what should be visible before you start talking
- 🎙️ **SAY**: read this out loud, word for word if you like

**Speakers:** **A** = product presenter, **B** = AWS / architecture. One person can read both.
**Full version:** about 11 minutes. **Short cut (6 minutes):** see the table at the end.
**Live app:** https://dzqvfns5axtkw.cloudfront.net, running on AWS in ap-southeast-2 (Sydney).

The per-screen reference for every page (useful for judge questions) is in [DEMO_WALKTHROUGH.md](DEMO_WALKTHROUGH.md).

---

## PART 0 — Set up before you press record

### 0.1 Browser tabs (open them in this order)

| Tab | Where |
|---|---|
| 1 | The live app: https://dzqvfns5axtkw.cloudfront.net |
| 2 | AWS Console → **ECS** → Clusters → `wattcycle` → **Services** tab |
| 3 | AWS Console → **CodeBuild** → Build projects → `wattcycle-images` → **Build history** |
| 4 | AWS Console → **RDS** → Databases → `wattcycle-pg` |
| 5 | AWS Console → **S3** → bucket `wattcycle-data-…` |
| 6 | AWS Console → **Amazon EventBridge** → Event buses → `wattcycle-domain` |
| 7 | AWS Console → **Secrets Manager** → `wattcycle-app-…` |
| 8 | AWS Console → **IAM** → Roles → `wattcycle-task` (not `wattcycle-task-exec`) |
| 9 | AWS Console → **Amazon Bedrock** → Model catalog → Anthropic Claude |
| 10 | AWS Console → **CloudWatch** → Log groups |
| 11 | AWS Console → **Service Quotas** → Amazon SageMaker → search `training job usage` |
| 12 | GitHub → `vineeta07/EnergyX` → `infra/terraform/` |

**Set every AWS tab to region "Asia Pacific (Sydney)"** (top right of the console).

### 0.2 Warm up the app (10 minutes before)

1. In tab 1, hard-refresh (**Ctrl + F5**).
2. Click **Open dashboard** → pick **System operator** → click **Run a full load** (green button, top bar). Let it finish. This warms the AI models and fills every chart.
3. Log out (door icon, top right).

### 0.3 Files on your desktop

- 4 single-item photos: plastic bottle, food scrap, cardboard, a shirt.
- 1 photo of 5–6 items spread out on a table, not overlapping (for the bag check).

### 0.4 Screen

- 1920×1080, browser zoom 110%, notifications off, bookmarks bar hidden.
- Light or dark theme, your choice. The moon/sun icon in the top bar switches it.

### 0.5 One decision before recording: Bedrock

- Open tab 9. If Claude shows **Access granted**, use the **Bedrock live** line in Scene 11.
- If not, use the **Bedrock pending** line. **Never say something is running when it isn't.**

---

## SCENE 1 — Hook (0:00 – 0:40)

🧭 **GO TO:** Tab 1, the landing page. Start at the top.

👀 **ON SCREEN:** The headline "Send each load to the plant that makes the most power from it." and the three numbers **+8% / −633 t / −19%**.

🎙️ **SAY (A):**
> Delhi produces about eleven thousand tonnes of municipal waste every single day.
> Most of it goes to a waste-to-energy plant or a landfill, chosen by habit, not by data. And nobody checks how much energy each load actually produced.
>
> We built **WattCycle**. It decides where every load of waste should go, collects it on optimised routes, predicts the energy, measures what was really produced, and learns from the difference.
>
> On Delhi's real plants, that means **eight percent more electricity** from the same waste, **six hundred and thirty-three tonnes a day** kept out of landfill, and **nineteen percent fewer** truck kilometres.

🧭 **THEN:** On the **Try a load** card (right side), click **Plastic**, then **Food waste**, and drag the **Load size** slider.

🎙️ **SAY (A):**
> Watch the plants re-rank as I change what's in the truck. The nearest plant is not always the best plant. That's the whole idea.

---

## SCENE 2 — Built on AWS (0:40 – 1:30)

🧭 **GO TO:** Scroll down the landing page to the section **"Built on AWS — One Terraform apply. Sixty-seven resources."**

👀 **ON SCREEN:** The layered diagram: **Edge → Compute → Data and events → Intelligence and operations**.

🎙️ **SAY (B), pointing at each layer as you say it:**
> Here's how it runs on AWS.
>
> **Edge:** Amazon CloudFront is our single HTTPS front door. It serves the site, the API and the live feed. Behind it, an Application Load Balancer sends API and WebSocket traffic to the API and everything else to the web app.
>
> **Compute:** three containers on Amazon ECS with AWS Fargate. A Next.js web app, a Node.js API that owns the data and the workflow, and a Python AI service that runs every model and optimiser. No servers to manage, and each one scales on its own. The API reaches the AI service over a private DNS name from Cloud Map, so the AI is never exposed to the internet.
>
> **Data and events:** Amazon RDS for PostgreSQL holds the network, every load, every prediction and every outcome. Amazon S3 holds waste photos and trained model versions. And every step of the workflow is published as an event to Amazon EventBridge.
>
> **Intelligence and operations:** Amazon Bedrock for the Claude assistant, CodeBuild and ECR to build our images, Secrets Manager for keys, CloudWatch for logs.
>
> The whole stack, sixty-seven resources, is Terraform, deployed with one script.

---

## SCENE 3 — The resident (1:30 – 2:30)

🧭 **GO TO:** Top right **Open dashboard** → on the login page, in the right-hand list **"One network, six roles"**, click the **Resident** row.

👀 **ON SCREEN:** The resident **Home** page: "Hello, …", the level, the growing plant, badges.

🎙️ **SAY (A):**
> Waste starts in a home, so we start with the resident.
> Residents get their own app. Every item they sort correctly earns points and grows their plant. There are streaks, badges, and a leaderboard with their neighbours.

🧭 **GO TO:** Left sidebar → **Scan an item** → upload the **plastic bottle** photo.

👀 **ON SCREEN:** The item name, the bin, and the recyclable tag.

🎙️ **SAY (A):**
> One photo. Our vision model recognises thirty kinds of item and tells you which bin it goes in, whether it's recyclable, and whether it can be remade into something.

🧭 **GO TO:** Sidebar → **Check a whole bag** → upload the **spread-out items** photo.

👀 **ON SCREEN:** A box around every item, each with its bin.

🎙️ **SAY (A):**
> Real bins hold many things at once. A YOLOv8 detector finds every item in a single photo of a bag and sorts each one.

🧭 **GO TO:** Sidebar → **Report a problem** (just show it, don't submit).

🎙️ **SAY (A):**
> Residents can also report an overflowing bin or illegal burning with their location. It goes straight to the collection team. Citizens become our sensors.

🧭 **THEN:** Log out (door icon, top right).

---

## SCENE 4 — The waste generator: forecast and pickup (2:30 – 3:10)

🧭 **GO TO:** Login page → click **Waste generator**. Sidebar → **Waste network** → click the row **MCD Central Zone**.

👀 **ON SCREEN:** **Forecast today**, **Forecast tomorrow**, **Next 7 days**, **Energy potential**.

🎙️ **SAY (A):**
> This is the MCD Central Zone sanitation office. These are Delhi's real zones, with their real ward counts and daily tonnage.
> A LightGBM model forecasts how much waste this zone will produce, today, tomorrow and for the week, so pickups are booked before bins overflow.

🧭 **GO TO:** Click **Request a pickup**.

👀 **ON SCREEN:** **Suggested vehicle**, **Suggested route**, **Estimated cost**, **Estimated CO₂**.

🎙️ **SAY (A):**
> Before confirming, the office sees which truck, which route, the cost and the carbon. Transparent from the first click.

🧭 **THEN:** Close the drawer and log out.

---

## SCENE 5 — The fleet operator: routes (3:10 – 3:50)

🧭 **GO TO:** Login page → **Fleet operator**. Sidebar → **Collection** → click **Plan routes for open pickups**. Then sidebar → **Routes** → click the newest route.

👀 **ON SCREEN:** The route on the map with **Distance**, **Estimated time**, **Fuel**, **Cost**, **Route score**.

🎙️ **SAY (A):**
> The collection contractor clicks one button. Google OR-Tools groups all open pickups into truck routes. It never overloads a truck, it respects each pickup's time window, and urgent pickups are the last ones it would ever drop.
> Every route shows its distance, time, fuel, cost, and how much shorter it is than sending trucks one by one.

🧭 **THEN:** Click **Dispatch**. Point at the truck starting to move. Log out.

🎙️ **SAY (A):**
> And the truck moves live, streamed to the browser over WebSockets.

---

## SCENE 6 — The processing hub: where the AI decides (3:50 – 5:40)

🧭 **GO TO:** Login page → **Hub operator**. Sidebar → **Processing hub** → in **Incoming loads**, click a shipment code like **WC-10xx**.

👀 **ON SCREEN:** **Received load**, with the weighbridge weight and the zones it came from.

🎙️ **SAY (A):**
> This is the Okhla transfer and sorting hub. A load has arrived and been weighed on the weighbridge. Now the AI works out what's in it.

🧭 **GO TO:** Click the upload box ("Optional: photograph 5 to 20 items…") → add your 4 single-item photos → click **Sort this load**.

👀 **ON SCREEN:** The **Sort result** donut (organic, plastic, paper, metal, other) and the photo list with **recyclable / non-recyclable / biodegradable** tags.

🎙️ **SAY (A):**
> The composition starts from where the waste came from, and the photos update it. Each photo is one sampled item. Low-confidence photos are ignored and flagged for review.
> Every item is also labelled recyclable, non-recyclable or biodegradable, using Delhi's rules. Thin film, plastic cutlery, styrofoam and lined paper cups aren't recyclable here. PET, cans, cardboard and paper are.

🧭 **SHOW (B), quick cut:** Tab 5 → **S3** bucket → folder **`uploads/`** → today's date → the newest file.

🎙️ **SAY (B):**
> Those photos went straight into Amazon S3. The bucket is private and encrypted. The browser only ever gets a five-minute pre-signed link.

🧭 **BACK TO TAB 1:** Click **Edit** → change organic by a few percent → **Save the correction**.

🎙️ **SAY (A):**
> Operators stay in control. A correction becomes labelled training data, and it counts three times in the next retraining.

🧭 **GO TO:** Scroll to **Recyclable vs non-recyclable** and **Upcycling opportunities**. Click **Set aside** next to **Textiles & shoes**.

🎙️ **SAY (A):**
> Before anything is burned, we take out what's worth more. The recyclable plastic and paper go to a recycling facility. Textiles, glass jars and PET bottles are set aside for upcycling.

🧭 **GO TO:** Scroll to **Energy prediction** → then click **Compare plants and pick one**.

👀 **ON SCREEN:** **Choice of plant**: every plant ranked, with excluded plants and their reasons.

🎙️ **SAY (A):**
> For each stream, the energy model predicts the electricity at every plant that could take it: Okhla, Tehkhand, Ghazipur, Bawana. These are their real capacities and megawatt ratings.
> Then it scores them on energy, distance, cost, carbon and spare capacity, shows which plants it excluded and why, and runs a Monte-Carlo check of how stable the winner is.

🧭 **GO TO:** Click **Approve this plant**.

🎙️ **SAY (A):**
> The AI recommends; a human approves. If the operator picks a different plant, they must write a reason, and it's kept in the audit log. A truck is dispatched to the approved plant automatically.

🧭 **THEN:** Log out.

---

## SCENE 7 — The plant operator: closing the loop (5:40 – 6:10)

🧭 **GO TO:** Login page → **Plant operator**. On the dashboard click **Plant console**.

👀 **ON SCREEN:** Tehkhand WtE, with loads waiting for a meter reading and their **Predicted** kWh.

🧭 **DO:** Click **Read the simulated meter** on a delivered load.

🎙️ **SAY (A):**
> This is the Tehkhand waste-to-energy plant. When a load is burned, the plant reports what the meter actually read.
> That number is stored next to what we predicted. The gap becomes training data. That's how WattCycle gets a little less wrong with every load.
> In the demo the meter is simulated, calibrated to each plant's published output. Everything upstream is the real pipeline.

🧭 **THEN:** Log out.

---

## SCENE 8 — The whole loop in one click (6:10 – 7:30)

🧭 **GO TO:** Login page → **System operator**. On the dashboard, click **Run a full load** (green, top bar).

👀 **ON SCREEN:** The overlay **"One full load, start to finish"** with stages lighting up one by one.

🎙️ **SAY (A), following the stages as they light up:**
> Now everything you just saw, in one run.
> It starts with a forecast. Three real zones, Central, South and West, request ten tonnes of pickups.
> OR-Tools merges them into one route. The truck drives it.
> At the hub, the AI sorts the load and splits out what's recyclable.
> It predicts the energy at every plant, ranks them, and picks the best.
> The load is dispatched, the plant meter reads the output…
> …and the prediction was off by about two percent. That difference is stored as training data.

🎙️ **SAY (B), as it finishes:**
> Every one of those stages was also an event. Pickup requested, load sorted, plant selected, energy recorded. Each one was published to Amazon EventBridge. I'll show you that in the console.

🧭 **THEN:** Click **See the plant decision**.

🎙️ **SAY (A):**
> And every decision can be explained later: its inputs, the full ranking, the weights it used, and the model version.

---

## SCENE 9 — Circular economy: upcycling and batteries (7:30 – 8:30)

🧭 **GO TO:** Still as System operator. Sidebar → **Upcycling** → click the lot you set aside in Scene 6 → **Match partner with AI**.

👀 **ON SCREEN:** The partner ranking (score, acceptance, net value, CO₂e avoided, km) and the comparison with the default route.

🎙️ **SAY (A):**
> Burning should be the last resort. Here the AI matches the textiles we set aside to an upcycling partner, on price, carbon saved, and how much that partner really accepts. Every receipt updates that acceptance rate, so the next match is better.

🧭 **GO TO:** Sidebar → **Battery second life** → click the lot **Laptop & power-bank 18650 cells**.

👀 **ON SCREEN:** The grading scatter (A / B / R). If the lot is untested, click **Run tester (simulated readings)** first.

🧭 **DO:** Choose **Hub solar storage (48 V)** → **Design pack with AI**.

👀 **ON SCREEN:** The pack config (e.g. 13S14P), **Group imbalance** about 0.04% versus about 11% unmatched, and the equal group bars.

🎙️ **SAY (A):**
> E-waste batteries. Discarded laptop cells, scooter modules and e-rickshaw batteries are tested one by one, and the AI grades each cell's health.
> Then it combines the healthy ones into a new pack, using OR-Tools to make every group equal. Imbalance drops from about eleven percent to under a tenth of a percent.
> To be clear: these packs **store** electricity, from the hub's rooftop solar. They don't generate it. Cells that fail go to an authorised recycler.

---

## SCENE 10 — City plan and model evidence (8:30 – 9:10)

🧭 **GO TO:** Sidebar → **City plan**.

👀 **ON SCREEN:** **MCD current** versus **WattCycle plan**, with electricity, landfill and haulage.

🎙️ **SAY (A):**
> The same AI that routes one truck can plan the whole city: which zone should feed which plant, within each plant's capacity.
> On Delhi's real network: eight percent more electricity, six hundred and thirty-three tonnes a day less landfill, and nineteen percent fewer truck tonne-kilometres.

🧭 **GO TO:** Sidebar → **Energy** → scroll to **Prediction calibration**.

🎙️ **SAY (A):**
> And this is the evidence that the model works: predicted against metered energy, batch by batch. A perfect prediction sits on the dashed line.

---

## SCENE 11 — AWS console tour (9:10 – 11:00)

About 8–10 seconds per tab. **B** speaks.

**① ECS (tab 2).** 👀 Services `web`, `api`, `ai`, all **Running**.
> Our three services on Fargate. Each has its own CPU and memory. The AI service gets four gigabytes for the vision models. Each scales independently, and there are no servers to patch.

**② CodeBuild (tab 3).** 👀 Build history, all **Succeeded**.
> We never build images on a laptop. CodeBuild pulls the exact commit from GitHub, builds the images, and pushes them to ECR tagged with that commit. Every running container traces back to exact code. When only the website changes, we rebuild just that image, in under two minutes.

**③ RDS (tab 4).** 👀 `wattcycle-pg`, Available.
> Amazon RDS for PostgreSQL 16. Private subnets, encrypted, automatic backups. It's the same schema we run locally.

**④ EventBridge (tab 6).** 👀 Bus `wattcycle-domain` → **Archives** → `wattcycle-domain-archive`. Then CloudWatch log group `/aws/events/wattcycle-feedback`.
> Every domain event lands on this bus and is archived for thirty days, so we can replay history. A rule sends the predicted-versus-actual feedback events to CloudWatch. A new consumer, say alerts or a partner integration, is just a new rule. No change to the API.

**⑤ S3 (tab 5).** 👀 Folder `ml/models/`.
> Every trained model version is saved here, so a fresh AI container loads the last good model instead of retraining.

**⑥ Secrets Manager (tab 7).** 👀 The secret exists. **Do not click "Retrieve secret value".**
> The database password, the login signing key and the service key were generated by Terraform straight into Secrets Manager, and injected into the containers at start. They're not in code, and nobody typed them.

**⑦ IAM (tab 8).** 👀 The task role's inline policy.
> Least privilege. The app's role can use only our bucket, only our event bus, and Bedrock. Nothing else.

**⑧ Bedrock (tab 9), then tab 1 → Ask WattCycle** (top bar) → type *"Which plant should take organic waste today and why?"*

*Bedrock live:*
> The assistant runs on Claude through Amazon Bedrock. It calls live tools in our API, plant capacity, recent decisions, predictions, so it answers from real data, not guesses.

*Bedrock pending:*
> The assistant is wired for Claude on Amazon Bedrock. Our account's Bedrock access is still being approved, so right now it answers with its built-in rule engine. Switching to Bedrock is a single Terraform variable.

**⑨ CloudWatch (tab 10).** 👀 Log group `/ecs/wattcycle/ai`.
> All container logs in one place. Here you can see the AI service training all three models in about eight seconds when it starts.

**⑩ GitHub (tab 12).** 👀 `infra/terraform/`.
> And all of it, network, NAT, load balancer, containers, database, CloudFront, is Terraform. One command to deploy, one command to destroy.

**⑪ SageMaker: what we wanted, and why it isn't live (tab 11, about 30 seconds).** 👀 Service Quotas, SageMaker, `training job usage`. The values read **0**.
> We did plan for Amazon SageMaker, and here's honestly why it isn't in this build.
> Our AWS account is a restricted one. An organisation policy limits it to the Sydney region, and the SageMaker training-job quota is zero, as you can see right here. So instead, we train inside our AI container. At our scale that's fine: all three models retrain in about eight seconds, and every version is saved to S3.
> Where SageMaker fits next:
> **One**, a Serverless Inference endpoint for our two image models. Photo uploads come in bursts, and serverless scales with them and costs nothing when idle.
> **Two**, SageMaker Training Jobs and Pipelines once we have real data at scale. Our training already runs as fixed steps, validate, clean, train, evaluate, register, which maps one-to-one onto a SageMaker Pipeline.
> **Three**, the SageMaker Model Registry, with an approval step before a model goes live.
> Our feedback loop already produces the labelled data those jobs need.

---

## SCENE 12 — Close (11:00 – 11:30)

🧭 **GO TO:** Tab 1 → log out → the landing page → scroll to **"Watch one load go from pickup to meter in about 25 seconds."**

🎙️ **SAY (A):**
> WattCycle. Forecast, collect, sort, predict, route, measure, learn.
> Recycle first, upcycle what's still whole, give old batteries a second life, and send only what's left to the plant that makes the most power from it.
> All of it running on AWS. Thank you.

---

## The 6-minute cut

| Time | Scene | Keep |
|---|---|---|
| 0:00 – 0:40 | 1 Hook | All |
| 0:40 – 1:20 | 2 Built on AWS | Edge + Compute + Data paragraphs |
| 1:20 – 2:40 | 8 Run a full load | All |
| 2:40 – 3:40 | 6 Hub | Sort this load + recyclable split + Compare plants (skip Edit and S3 cut) |
| 3:40 – 4:20 | 9 Circular | Battery pack only |
| 4:20 – 5:30 | 11 AWS tour | ① ECS, ② CodeBuild, ④ EventBridge, ⑧ Bedrock, ⑪ SageMaker |
| 5:30 – 6:00 | 12 Close | All |

---

## If something goes wrong while recording

| Problem | Fix |
|---|---|
| "Run a full load" says no truck is free | Sidebar → **Routes** → **Dispatch** the planned routes, or wait 2–3 min for active ones to finish |
| The bag check says the detector is loading | Wait 30 s and retry, or use **Scan an item** instead |
| The first photo sort is slow | Normal right after a restart (models load). The warm-up in 0.2 avoids it |
| A page shows old text | Hard-refresh: Ctrl + F5 |
| Charts look empty | Run a full load once more as System operator |

---

## Honesty notes (keep these true on camera)

- **Real:**
  - Delhi's 12 MCD zones with wards and daily tonnage;
  - plant capacities and MW ratings (Okhla, Tehkhand, Ghazipur, Bawana), landfills, MRFs;
  - the vision model and the YOLOv8 detector;
  - OR-Tools routing; the LightGBM models.
- **Simulated (labelled in the app):** day-to-day tonnage variation, truck movement, plant meter readings, battery tester readings, pack telemetry, upcycling partners. If a judge asks, say "simulated".
- **Road distances:** from OpenStreetMap where cached. On AWS, uncached ones are straight-line estimates.
- **Not used:** SageMaker, IoT Core, Amazon Location Service. Never say they're running.
- **Region:** the account is restricted to Sydney. We designed for Mumbai (ap-south-1), near Delhi; moving region is one variable.
- **Batteries:** second-life packs **store** energy; they don't generate it.

## Likely judge questions — short answers

| Question | Answer |
|---|---|
| Why Fargate, not EC2 or Lambda? | Three long-running services, including a WebSocket feed and a 4 GB vision model. Fargate gives containers without managing servers; Lambda's time limits and cold starts don't fit the AI service. |
| Why EventBridge? | It decouples the workflow from whoever consumes it. Alerts, analytics or a partner integration subscribe with a rule, and the archive lets us replay history for audits and retraining. |
| How does it learn? | Every prediction is compared with the metered output. Errors become feedback rows, drift is monitored, and retraining runs on a schedule or when the error crosses a threshold. Operator corrections count 3× in sorting training. |
| Why not SageMaker? | We designed for it, but our restricted account has a SageMaker training-job quota of 0. Training in the container takes about 8 seconds and versions go to S3. Next: Serverless Inference for the image models, then Pipelines and Model Registry. |
| Isn't training inside a container risky? | It runs in the separate AI service, in the background. Each version is evaluated against naive baselines with its metrics stored, and earlier versions stay in S3. |
| What does it cost? | About $150/month always on, mostly the NAT gateway, load balancer, database and three tasks. We destroy it when not demoing. |
| Is it secure? | Private subnets for the database and AI, secrets generated into Secrets Manager, a least-privilege IAM role, a private S3 bucket with pre-signed links, JWT + role-based access, and an audit log of every change. |
| What's real data? | The zones, plants, capacities and MW ratings are published Delhi figures. Day-to-day operations are simulated and labelled. |
