import Link from "next/link";
import { PublicNav, PublicFooter } from "@/components/shell/PublicNav";

const LOOP = [
  ["Waste network", "Generators register sources; daily generation is logged and forecast."],
  ["Collection optimization", "Open pickups are solved as a capacitated VRP with time windows (OR-Tools)."],
  ["Processing hub", "Loads are consolidated, weighed and queued for characterisation."],
  ["AI characterization", "Composition model estimates organic / plastic / paper / metal / other + moisture."],
  ["Waste-to-energy prediction", "Yield model predicts kWh per pathway and per facility, with intervals."],
  ["Facility optimization", "Configurable utility ranks every eligible facility; decision is explained."],
  ["Route optimization", "Dispatch route hub → facility; truck telemetry streams to the map."],
  ["Energy conversion", "Facility processes the load (meter simulated in demo mode)."],
  ["Actual output", "Facility reports metered kWh; error vs prediction is computed."],
  ["Feedback", "Prediction, actual, facility, distance & cost stored as a training row."],
  ["Model improvement", "Scheduled / drift-triggered retraining publishes a new model version."],
  ["Better future decisions", "Next ranking uses the new model and updated historical yields."],
];

const MODELS = [
  ["1 · Waste generation forecast", "LightGBM on scale-normalised lags (1, 2, 7 days), rolling means, weekday, season and business type. Recursive 7-day forecast with residual-quantile intervals. Benchmarked against seasonal-naive."],
  ["2 · Waste composition", "Multi-output random forest on source mix, load size and season, trained on lab audits + operator corrections (3× weight). Confidence = ensemble agreement within 6 pp. No vision model is deployed because no labelled image corpus exists — uploaded images are stored to build one."],
  ["3 · Energy yield", "LightGBM gradient-boosted trees predicting kWh/kg from stream, technology, efficiency, compatibility, load, moisture, season and leakage-safe historical facility yield. 90% interval & calibrated confidence P(|error| ≤ 10%)."],
  ["4 · Destination optimization", "Not a classifier: U = w₁·energy + w₂·efficiency + w₃·compatibility + w₄·capacity − w₅·cost − w₆·carbon − w₇·distance over eligible facilities (capacity, moisture limit, compatibility ≥ 50%). Monte-Carlo stability of the winner under prediction uncertainty."],
  ["5 · Route optimization", "OR-Tools routing: capacity dimension, soft time windows, urgency-weighted drop penalties, guided local search. Nearest-neighbour + 2-opt fallback."],
];

const AWS = [
  ["CloudFront", "Next.js frontend + /api path routing"],
  ["ALB → ECS Fargate", "Node.js API (Express) — auth, data, orchestration, WebSockets"],
  ["ECS Fargate (private)", "Python AI service (FastAPI) — inference, OR-Tools, assistant"],
  ["RDS PostgreSQL + PostGIS", "Operational DB (same schema as local embedded Postgres)"],
  ["S3", "Waste images (presigned URLs), dataset snapshots, model artifacts"],
  ["SageMaker", "Training jobs + Model Registry for the 3 learned models"],
  ["EventBridge", "Domain-event bus + scheduled retraining / sweeps"],
  ["SQS", "Async work queues (training, notifications)"],
  ["ElastiCache Redis", "KPI cache, token revocation, rate-limit counters"],
  ["Amazon Location Service", "Map tiles + route matrix (replaces the OSRM / OpenStreetMap road matrix used locally)"],
  ["IoT Core", "Vehicle GPS & facility meter telemetry (replaces demo simulator)"],
  ["CloudWatch", "Logs, metrics, model-drift alarms"],
];

export default function About() {
  return (
    <div className="min-h-screen">
      <PublicNav />
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="text-xs font-medium uppercase tracking-[0.2em] text-accent">How it works</div>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight">One closed loop from waste source to metered energy — and back into the model.</h1>

        <ol className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {LOOP.map(([t, d], i) => (
            <li key={t} className="rounded-md border border-line bg-panel p-4">
              <div className="num text-[11px] text-accent">{String(i + 1).padStart(2, "0")}</div>
              <div className="mt-1 text-sm font-semibold">{t}</div>
              <p className="mt-1 text-sm text-ink-2">{d}</p>
            </li>
          ))}
        </ol>

        <h2 className="mt-20 text-2xl font-semibold">Five models, each doing one job</h2>
        <p className="mt-2 max-w-3xl text-ink-2">Trained offline on historical records through a validated pipeline: raw export → snapshot → validation → cleaning (missing days interpolated, robust-z outliers) → features → time-based split → training → evaluation vs naive baselines → versioned artifact → serving. Live metrics are on the AI Models page.</p>
        <div className="mt-6 space-y-3">
          {MODELS.map(([t, d]) => <div key={t} className="rounded-md border border-line bg-panel p-4"><div className="text-sm font-semibold text-ink">{t}</div><p className="mt-1 text-sm text-ink-2">{d}</p></div>)}
        </div>

        <h2 id="architecture" className="mt-20 text-2xl font-semibold">Architecture</h2>
        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <div className="rounded-md border border-line bg-panel p-5 text-sm">
            <div className="font-semibold">Services</div>
            <pre className="num mt-3 overflow-x-auto text-[12px] leading-relaxed text-ink-2">{`Browser (Next.js)
   │  REST /api  +  WebSocket /ws
   ▼
Node.js API  (Express, TypeScript)
   │  JWT auth · RBAC · validation · audit
   │  pipeline state machine · events
   ├──► PostgreSQL  (PGlite locally, RDS in AWS)
   └──► Python AI service (FastAPI)
          forecast · classify · predict-energy
          rank-facilities · optimize-routes
          train (→ registry) · assistant
          └─► /internal/datasets  (training data)
              /internal/tools     (assistant)`}</pre>
            <div className="mt-4 font-semibold">Event flow</div>
            <p className="num mt-2 text-[12px] leading-relaxed text-ink-2">WastePickupRequested → CollectionOptimizationStarted → RouteOptimized → WasteCollected → WasteArrivedAtHub → WasteClassificationCompleted → EnergyPotentialCalculated → FacilitySelected → WasteDispatched → EnergyGenerationCompleted → ActualOutputRecorded → AITrainingDataCreated</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {AWS.map(([s, d]) => <div key={s} className="rounded-md border border-line bg-panel px-4 py-3"><div className="text-sm font-semibold text-cyan">{s}</div><div className="mt-0.5 text-xs text-ink-2">{d}</div></div>)}
          </div>
        </div>
        <div className="mt-12"><Link href="/login" className="rounded bg-accent px-4 py-2 text-sm font-semibold text-[#04140b]">Try the demo</Link></div>
      </div>
      <PublicFooter />
    </div>
  );
}
