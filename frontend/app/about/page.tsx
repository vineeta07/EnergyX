"use client";
import Link from "next/link";
import { PublicNav, PublicFooter } from "@/components/shell/PublicNav";
import { t } from "@/lib/i18n";

const LOOP = [
  ["Waste network", "Generators register their sources. Daily weights are logged and forecast."],
  ["Collection", "Open pickups are grouped into truck routes with capacity limits and time windows."],
  ["Processing hub", "Loads are weighed on arrival and queued for sorting."],
  ["Sorting", "A model splits each load into organic, plastic, paper, metal and other, and estimates moisture."],
  ["Energy prediction", "Expected kWh is predicted per technology and per plant, with a range."],
  ["Choosing a plant", "Every eligible plant is scored. The hub operator sees why one won, and can override it."],
  ["Delivery", "The load is dispatched from the hub to the chosen plant. Truck GPS shows on the map."],
  ["Conversion", "The plant processes the load. In the demo the meter is simulated."],
  ["Metered output", "The plant reports kWh. The gap against the prediction is worked out."],
  ["Feedback", "Prediction, reading, plant, distance and cost are saved as one training row."],
  ["Retraining", "A scheduled or drift-triggered run publishes a new model version."],
  ["Next load", "The next ranking uses the new model and the updated plant yields."],
] as const;

const MODELS = [
  ["Waste forecast", "LightGBM on lagged daily weights (1, 2 and 7 days), rolling averages, weekday, season and business type. Gives a seven-day forecast with a range. Tested against a seasonal-naive baseline."],
  ["Load composition", "A random forest on source mix, load size and season, trained on lab audits and hub operator corrections (counted three times). Confidence is how closely the trees agree. A photo model refines the split when sample photos are uploaded."],
  ["Energy yield", "Gradient-boosted trees predicting kWh per kg from stream, technology, efficiency, compatibility, load, moisture, season and the plant's past yield. Gives a 90% range and a confidence that the error stays within 10%."],
  ["Plant choice", "Not trained. A weighted score over every plant that can take the load: energy, efficiency, compatibility and spare capacity count for it; cost, carbon and distance count against it. A Monte-Carlo run checks the winner holds under prediction error."],
  ["Routing", "OR-Tools with a capacity limit, soft time windows, higher drop penalties for urgent pickups and guided local search. Falls back to nearest-neighbour with 2-opt."],
] as const;

const AWS = [
  ["CloudFront", "Serves the web app and routes /api"],
  ["ALB and ECS Fargate", "Node.js API: sign-in, data, the pipeline, WebSockets"],
  ["ECS Fargate (private)", "Python service: prediction, routing, the assistant"],
  ["RDS PostgreSQL with PostGIS", "Main database, same schema as the local one"],
  ["S3", "Waste photos, dataset snapshots, model files"],
  ["SageMaker", "Training jobs and model registry for the three learned models"],
  ["EventBridge", "Event bus and scheduled retraining"],
  ["SQS", "Queues for training and notifications"],
  ["ElastiCache Redis", "KPI cache, revoked tokens, rate limits"],
  ["Amazon Location Service", "Map tiles and the route matrix (OpenStreetMap locally)"],
  ["IoT Core", "Truck GPS and plant meter feeds (a simulator in the demo)"],
  ["CloudWatch", "Logs, metrics and model-drift alarms"],
] as const;

export default function About() {
  return (
    <div className="min-h-screen">
      <PublicNav />
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h1 className="max-w-3xl font-serif text-4xl font-medium leading-tight text-ink">{t("How a load of waste turns into a meter reading, and what the system learns from it.")}</h1>

        <ol className="mt-10 grid border-t border-line md:grid-cols-2 md:gap-x-12">
          {LOOP.map(([name, what], i) => (
            <li key={name} className="grid grid-cols-[2.5rem_1fr] gap-x-3 border-b border-line py-3.5">
              <span className="num pt-0.5 text-sm text-ink-3">{String(i + 1).padStart(2, "0")}</span>
              <div><div className="font-medium text-ink">{t(name)}</div><p className="mt-0.5 text-sm leading-relaxed text-ink-2">{t(what)}</p></div>
            </li>
          ))}
        </ol>

        <div className="mt-20 grid gap-8 lg:grid-cols-[0.8fr_1.6fr]">
          <div>
            <h2 className="font-serif text-2xl font-medium text-ink">{t("Five models, one job each")}</h2>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-ink-2">{t("Models are trained offline on past records: export, snapshot, validation, cleaning, features, a time-based split, evaluation against simple baselines, then a versioned file. Live scores are on the Models screen.")}</p>
          </div>
          <dl className="divide-y divide-line border-y border-line">
            {MODELS.map(([name, how], i) => (
              <div key={name} className="grid gap-1 py-4 sm:grid-cols-[11rem_1fr] sm:gap-4">
                <dt className="font-medium text-ink"><span className="num mr-2 text-ink-3">{i + 1}</span>{t(name)}</dt>
                <dd className="text-sm leading-relaxed text-ink-2">{t(how)}</dd>
              </div>
            ))}
          </dl>
        </div>

        <h2 id="architecture" className="mt-20 font-serif text-2xl font-medium text-ink">{t("Architecture")}</h2>
        <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <pre className="num overflow-x-auto rounded-lg border border-line bg-panel p-4 text-xs leading-relaxed text-ink-2">{`Browser (Next.js)
   |  REST /api  +  WebSocket /ws
   v
Node.js API (Express, TypeScript)
   |  JWT sign-in, roles, validation, audit log
   |  pipeline state machine, events
   |--> PostgreSQL (PGlite locally, RDS in AWS)
   '--> Python service (FastAPI)
          forecast, sort, predict energy
          rank plants, route trucks
          train (to registry), assistant`}</pre>
            <p className="mt-4 text-sm font-medium text-ink">{t("Event order")}</p>
            <p className="num mt-1 text-xs leading-relaxed text-ink-2">WastePickupRequested, CollectionOptimizationStarted, RouteOptimized, WasteCollected, WasteArrivedAtHub, WasteClassificationCompleted, EnergyPotentialCalculated, FacilitySelected, WasteDispatched, EnergyGenerationCompleted, ActualOutputRecorded, AITrainingDataCreated</p>
          </div>
          <table className="w-full self-start text-sm">
            <tbody>
              {AWS.map(([service, job]) => (
                <tr key={service} className="border-b border-line align-top">
                  <th scope="row" className="w-[40%] py-2.5 pr-3 text-left font-medium text-ink">{service}</th>
                  <td className="py-2.5 text-ink-2">{t(job)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-12"><Link href="/login" className="inline-flex h-10 items-center rounded-md bg-accent px-4 text-sm font-medium text-on-accent hover:opacity-90">{t("Open the demo")}</Link></div>
      </div>
      <PublicFooter />
    </div>
  );
}
