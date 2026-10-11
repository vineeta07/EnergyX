# WattCycle — Hackathon Video Script (≈ 6½ minutes)

**Goal of the video:** show one closed loop, from waste to energy to feedback, running live on AWS, and make clear *what each AWS service does* and *why we chose it*.

**Live URL:** https://dzqvfns5axtkw.cloudfront.net (AWS region ap-southeast-2)

---

## Before you record (checklist)

1. Open these tabs, logged in, in this order:
   1. The live app (landing page).
   2. AWS Console → **ECS** → cluster `wattcycle` → Services tab.
   3. **RDS** → Databases → `wattcycle-pg`.
   4. **S3** → bucket `wattcycle-data-…`.
   5. **EventBridge** → Event buses → `wattcycle-domain`.
   6. **CloudWatch** → Log groups.
   7. **CodeBuild** → `wattcycle-images` → Build history.
   8. **CloudFront** → the distribution.
   9. **Bedrock** → Model catalog → Claude Opus 5.5.
   10. GitHub → `infra/terraform/`.
2. Make sure every console tab is set to region **Asia Pacific (Sydney)**.
3. Do one dry run of **Run Full Optimization**, so the first-start training is finished and the dashboards have data.
4. Have 3–5 waste photos ready on the desktop: a plastic bottle, a food scrap, cardboard, a shirt, a can.
5. Use a 1920×1080 screen, 110% browser zoom, dark theme, and notifications off.
6. **Bedrock:** if your Bedrock access is approved by recording day, the assistant runs on Claude. If not, use the alternate line marked *(if Bedrock not yet enabled)*. Never say something is running when it isn't.

Speakers: **A** = presenter / product, **B** = AWS / architecture. One person can read both.

---

## 0:00 – 0:30 · Hook

**SHOW:** Landing page. Slowly scroll the truck animation.

**SAY (A):**
> "Delhi produces about **eleven thousand tonnes** of municipal waste every day. Most of it goes to a waste-to-energy plant or a landfill, chosen by habit rather than by data, and nobody checks how much energy that load actually produced.
> We built **WattCycle**: an AI platform that decides where every load of waste should go, collects it on optimised routes, predicts the energy, measures what was really produced and learns from the difference. It runs entirely on **AWS**."

---

## 0:30 – 1:15 · Architecture on AWS (the money slide)

**SHOW:** The architecture diagram from `infra/aws/README.md`, or draw it. Point at each box as you name it.

```
Browser ──HTTPS──► CloudFront ──► Application Load Balancer
                                   ├─ /api, /ws ─► ECS Fargate: API (Node.js)  ─┐ Cloud Map (private DNS)
                                   └─ /         ─► ECS Fargate: Web (Next.js)   │
                                                   ECS Fargate: AI  (Python) ◄──┘
API ─► RDS PostgreSQL · S3 (waste photos) · EventBridge (every domain event)
AI  ─► S3 (versioned models) · Bedrock (Claude assistant)
Images built by CodeBuild → ECR · secrets in Secrets Manager · logs in CloudWatch · all in Terraform
```

**SAY (B):**
> "Three containers on **ECS Fargate**: a Next.js web app, a Node.js API that owns the data and the workflow, and a Python AI service that runs every model and optimiser. With Fargate there are no servers to manage; each service scales on its own.
> **CloudFront** is the single HTTPS front door. It serves the site and passes the API and live WebSocket feed through an **Application Load Balancer**.
> The API talks to the AI service over a private DNS name from **Cloud Map**, so the AI is never exposed to the internet.
> Data lives in **RDS PostgreSQL**. Photos and trained models live in **S3**. Every business event goes onto an **EventBridge** bus. Secrets are generated into **Secrets Manager**; none are in code. And the whole stack, **67 resources**, is defined in **Terraform** and deployed with one script."

---

## 1:15 – 3:15 · The live closed loop (Run Full Optimization)

**SHOW:** Login page → click **System operator** → Dashboard → **Run Full Optimization**. Let the stage overlay play. Narrate each stage as it lights up.

| Stage on screen | SAY |
|---|---|
| Waste discovered | "It starts with a **forecast**. A LightGBM model trained on daily tonnage history predicts how much waste each MCD zone will produce." |
| Pickups requested / route optimized | "Three real zones (Central, South, West, ten tonnes in all) request pickups. **Google OR-Tools** solves the vehicle-routing problem with truck capacity and time windows, and consolidates three trips into one route." |
| Waste collected | "The truck drives the route live on the map. Positions stream to the browser over WebSockets through CloudFront." |
| AI classification | "At the hub the AI estimates the composition: organic, plastic, paper, metal, other. It also splits **recyclable from non-recyclable**." |
| Energy prediction / facilities evaluated | "For every stream it predicts the energy at **every eligible plant**. This uses each plant's real capacity and megawatt rating: Okhla, Tehkhand, Ghazipur, Bawana. It then ranks them on energy, distance, carbon, cost and spare capacity." |
| Best destination selected | "And it explains why. Open the decision…" *(click it)* "…ranking, decision drivers, confidence, and the runners-up it rejected." |
| Route generated → Energy generated | "A human approves, the truck dispatches, and the plant records its output." |
| Feedback recorded | "Predicted versus actual: about **two percent** error. That difference is stored as training data and drives **automatic retraining** when the error drifts." |

**SAY (B), while the last stage finishes:**
> "Every one of those stages was an event: pickup requested, waste classified, facility selected, energy recorded. Each one was published to **Amazon EventBridge**. I'll show that in a minute."

---

## 3:15 – 4:15 · Circular economy (beyond burning waste)

**SHOW:** Processing Hub → open a shipment → upload 3–5 photos → **Analyze Waste**.

**SAY (A):**
> "Energy recovery shouldn't be the first choice for everything. We photograph a sample of items. A pretrained **EfficientNet** vision model recognises **30 item types**, and every photo is labelled recyclable, non-recyclable or biodegradable, using Indian rules like the 2022 single-use-plastic ban.
> The recyclable plastic and paper now go to a **recycling facility**, and only the rest is sent for energy."

**SHOW (B), quick cut:** AWS Console → **S3** → bucket → `uploads/…` → the photo you just uploaded.
> "Those photos went straight into **Amazon S3**. The browser only ever gets a five-minute **pre-signed URL**; the bucket itself is private and encrypted."

**SHOW:** **Upcycling** page → a lot → AI partner ranking.
> "Textiles, glass jars, PET bottles are set aside for **upcycling**. The AI matches each lot to a partner on value, carbon saved and how much that partner usually accepts. Every receipt updates that number."

**SHOW:** **Battery Second Life** → a lot → grading scatter → a pack → group-balance chart.
> "E-waste batteries: we test every cell and the AI grades its health. Then the AI combines the good ones into a new storage pack, using OR-Tools to balance the groups. Imbalance drops from **eleven percent to under 0.1 percent**. These packs *store* solar power for the hub; they don't generate it. Dead cells go to an authorised recycler."

**SHOW (optional, 10 s):** log in as **Resident** → scan an item → bin guidance + points.
> "And residents get their own app: scan an item, learn the right bin, earn points."

*(only after the AWS deploy is updated to the latest `main`)*: open **Check a bag** → upload one photo of a mixed bag.
> "A **YOLOv8** detector finds every item in one photo of a whole bag and sorts it into bins."

---

## 4:15 – 6:00 · How we use AWS (console tour)

Go through the tabs quickly, about 8–10 seconds each. **B** speaks over all of it.

1. **ECS** (Services tab: `web`, `api`, `ai` all *Running*):
   > "Our three services on Fargate. Each has its own CPU and memory budget: the AI task gets four gigabytes for the vision model, and each can scale independently."
2. **CodeBuild** (Build history):
   > "We never build Docker images on a laptop. **CodeBuild** pulls the commit from GitHub, builds all three images and pushes them to **ECR**, tagged with the git commit, so every running container traces back to exact code."
3. **RDS** (`wattcycle-pg`):
   > "**RDS PostgreSQL 16**, in private subnets, encrypted, with automatic backups. It's the same schema we run locally, so there's one code path."
4. **EventBridge** (bus `wattcycle-domain` → Archive → CloudWatch log group `/aws/events/wattcycle-feedback`):
   > "Every domain event lands on this bus and is archived for 30 days, so we can **replay** history. A rule routes feedback events (predicted versus actual) into CloudWatch. New consumers like alerts, analytics or a partner integration just add a rule; no code change in the API."
5. **S3** (`ml/models/…` folder):
   > "Each trained model version is mirrored to S3, so a new AI container loads the last good model instead of retraining."
6. **Secrets Manager**:
   > "The database password, JWT signing key and service key were **generated by Terraform** straight into Secrets Manager and injected into containers at start. Nobody has ever seen them."
7. **IAM** (task role policy):
   > "Least privilege: the app's role can touch *only* our bucket, *only* our event bus, and Bedrock. Nothing else."
8. **Bedrock** (Claude in the model catalog), then switch to the app → click **WattCycle Intelligence** → ask *"Which plant should take organic waste today and why?"*
   > "The built-in assistant runs on **Claude through Amazon Bedrock**. It calls live tools in our API, such as facility capacity, recent decisions and predictions, so it answers from real data, not guesses."
   >
   > *(if Bedrock not yet enabled)*: "The assistant is wired for **Claude on Amazon Bedrock**. Our account's Bedrock access is still being approved, so right now it runs on its built-in rule engine. Switching to Bedrock is one Terraform variable."
9. **CloudWatch** (log groups `/ecs/wattcycle/api` and `/ecs/wattcycle/ai`):
   > "All container logs and Container Insights in one place. Here you can see the AI service training three models in eight seconds on startup."
10. **GitHub** → `infra/terraform`:
    > "And all of it (network, NAT, load balancer, containers, database, CloudFront) is **Terraform**: one command to deploy, one command to destroy."
11. **SageMaker: what we wanted, and why it isn't live yet** (about 30 s)

    **SHOW:** AWS Console → **Service Quotas** → Amazon SageMaker, searched for `training job usage`. The values read **0**. Then cut to the architecture diagram, with a dotted box labelled *SageMaker (next)*.

    **SAY (B):**
    > "We did plan for **Amazon SageMaker**, and here's honestly why it isn't in this build.
    > Our AWS account is a restricted one. An organization policy limits it to the Sydney region, and the SageMaker **training-job quota is zero**. You can see it right here. So we couldn't run SageMaker Training Jobs. We trained our models inside the AI container instead. That's fine at our scale: all three tabular models retrain in about **eight seconds** on a CPU, and every version is saved to S3.
    > Where SageMaker fits next, and the code is already shaped for it:
    > **One:** a **SageMaker Serverless Inference** endpoint for our two image models, the 30-class item classifier and the YOLOv8 bag detector. Photo uploads come in bursts, and serverless scales with them and costs nothing while idle, instead of reserving four gigabytes in an always-on container.
    > **Two:** **SageMaker Training Jobs and Pipelines** for retraining, once we have real data at scale and a GPU. Our pipeline already runs as fixed steps (validate, clean, train, evaluate against baselines, register), which maps one-to-one onto a SageMaker Pipeline.
    > **Three:** the **SageMaker Model Registry** to replace our S3 version folders, with approval before a model goes live.
    > Our feedback loop already produces the labelled data those jobs need: every predicted-versus-actual result lands in the database and on EventBridge."

---

## 6:00 – 6:30 · Impact + close

**SHOW:** **City Planner** page → the optimized vs current comparison. End on the Impact page.

**SAY (A):**
> "Run on Delhi's real plants and zones, our city planner finds **eight percent more electricity** from the same waste, **633 fewer tonnes a day** going to landfill, and **19 percent less** truck tonne-kilometres, just by sending the right waste to the right place.
> WattCycle: forecast, collect, classify, predict, route, measure, learn, all running on AWS. Thank you."

---

## Honesty notes (keep these true on camera)

- **Real data:**
  - Delhi zones and their daily tonnage; plant capacities and megawatt ratings; landfills; MRFs.
  - Road distances from OpenStreetMap. On AWS, uncached road distances are currently estimates.
- **Simulated and labelled in the app:** daily operations, truck movement, meter readings, battery tester readings and upcycling partners. Say "simulated" if a judge asks.
- **Not used:** SageMaker, IoT Core and Amazon Location Service. Never say they're running. Our answers if asked:
  - **SageMaker:** "We wanted it. Our account's SageMaker training-job quota is 0 and the account is region-restricted, so training runs in the AI container, which takes about 8 s per retrain at our scale. Next: Serverless Inference for the image models, Pipelines and Model Registry for retraining." See console-tour step 11.
  - "IoT Core is for real truck GPS and plant meters."
- **Region:** our account is restricted to Sydney. We designed for Mumbai (ap-south-1) to be close to Delhi, and moving region is one variable.
- **Second-life batteries store energy; they don't generate it.**

## Likely judge questions — short answers

| Question | Answer |
|---|---|
| Why Fargate, not EC2 or Lambda? | Three long-running services, including a WebSocket feed and a 4 GB vision model. Fargate gives containers without managing servers; Lambda's cold starts and time limits don't fit the AI service. |
| Why EventBridge? | It decouples the workflow from consumers. Alerts, analytics and future partner integrations subscribe with rules, and the archive gives replay for audits and retraining. |
| How does it learn? | Every prediction is compared with the measured output. Errors are stored as feedback, drift is monitored, and retraining runs on schedule or when error crosses a threshold. Operator corrections count 3× in classification training. |
| Why not SageMaker? | We designed for it, but our restricted account has a SageMaker training-job quota of 0. Training in the container takes about 8 seconds and versions go to S3. Next step: a Serverless Inference endpoint for the two image models (bursty load, $0 when idle), then Pipelines and Model Registry once we have GPU-scale real data. |
| Isn't training in the API container risky? | It runs in the separate AI service, in a background thread. Each new version is evaluated against naive baselines with the metrics stored on the version, and earlier versions stay in S3. |
| What does it cost? | About $150/month always on, mostly the NAT gateway, load balancer, database and three tasks. We destroy it when not demoing. |
| Security? | Private subnets for the database and AI, secrets generated into Secrets Manager, a least-privilege IAM role, a private S3 bucket with pre-signed URLs, JWT + role-based access, and an audit log. |
