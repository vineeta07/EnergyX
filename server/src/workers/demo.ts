/**
 * "Run Full Optimization" — drives the hero scenario through the REAL pipeline
 * (same functions the API buttons call), pacing each stage so judges can follow
 * it on screen. Only the physical world is simulated: truck motion and the
 * facility meter reading (both flagged SIMULATED).
 */
import { one, query, update } from "../database/db.ts";
import { publish } from "../services/events.ts";
import * as P from "../services/pipeline.ts";
import { ai } from "../services/aiClient.ts";
import { setRouteSpeed } from "./fleet.ts";
import type { AuthUser } from "../middleware/auth.ts";
import { HttpError } from "../middleware/http.ts";
import { round } from "../utils/geo.ts";

export const DEMO_STAGES = [
  { key: "discover", label: "Waste discovered" },
  { key: "request", label: "Pickups requested" },
  { key: "optimize", label: "Pickup route optimized" },
  { key: "collect", label: "Waste collected" },
  { key: "classify", label: "AI classification" },
  { key: "predict", label: "Energy prediction" },
  { key: "evaluate", label: "Facilities evaluated" },
  { key: "select", label: "Best destination selected" },
  { key: "dispatch", label: "Route generated" },
  { key: "energy", label: "Energy generated" },
  { key: "feedback", label: "Feedback recorded" },
] as const;

const HERO = [
  { name: "Restaurant ABC", kg: 500 },
  { name: "Hotel XYZ", kg: 400 },
  { name: "Food Market DEF", kg: 100 },
];

interface DemoRun { id: number; status: "running" | "completed" | "failed"; stage: number; started_at: string; results: Record<string, any>; error?: string }
let current: DemoRun | null = null;
let seq = 0;

export const demoState = () => current ?? { status: "idle", stages: DEMO_STAGES };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function stage(run: DemoRun, idx: number, message: string, data: any) {
  run.stage = idx;
  run.results[DEMO_STAGES[idx].key] = data;
  await publish("DemoStage", message, { run_id: run.id, stage: idx, key: DEMO_STAGES[idx].key, label: DEMO_STAGES[idx].label, data });
}

async function waitFor<T>(fn: () => Promise<T | null | undefined>, timeoutMs: number, everyMs = 400): Promise<T | null> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(everyMs);
  }
  return null;
}

export async function runDemo(user: AuthUser) {
  if (current?.status === "running") throw new HttpError(409, "A demo run is already in progress");
  try { await ai.health(); } catch { throw new HttpError(503, "AI service is not running — start ai-service first"); }
  const models = await one<{ n: number }>("SELECT COUNT(DISTINCT model_key)::int AS n FROM model_versions WHERE status='active'");
  if ((models?.n ?? 0) < 3) throw new HttpError(503, "Models are still training (bootstrap). Try again in a few seconds.");
  current = { id: ++seq, status: "running", stage: -1, started_at: new Date().toISOString(), results: {} };
  const run = current;
  execute(run, user).catch(async (e) => {
    run.status = "failed";
    run.error = e.message;
    await publish("DemoStage", `Demo failed: ${e.message}`, { run_id: run.id, stage: run.stage, failed: true, error: e.message });
  });
  return run;
}

async function execute(run: DemoRun, user: AuthUser) {
  const sources = await query<any>("SELECT * FROM waste_sources WHERE name = ANY($1::text[])", [HERO.map((h) => h.name)]);
  const abc = sources.find((s) => s.name === "Restaurant ABC");

  // 1. DISCOVER — forecast for the restaurant cluster
  const history = await query<any>("SELECT to_char(record_date,'YYYY-MM-DD') AS date, SUM(quantity_kg) AS kg FROM waste_records WHERE source_id=$1 AND record_date > now()::date - 90 GROUP BY record_date ORDER BY record_date", [abc.id]);
  const forecast = await ai.forecast({ source: { id: abc.id, business_type: abc.business_type, waste_type: abc.waste_type, avg_daily_kg: abc.avg_daily_kg }, history, horizon: 7 });
  await stage(run, 0, `Restaurant cluster discovered — Restaurant ABC forecast ${round(forecast.forecast[0].kg, 0)} kg today, ${round(forecast.total_kg / 1000, 2)} t next 7 days`, { forecast, sources: sources.map((s) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng })) });
  await sleep(2200);

  // 2. REQUEST — three pickups
  const pickups = [];
  for (const h of HERO) {
    const s = sources.find((x) => x.name === h.name);
    pickups.push(await P.createPickup({ source_id: s.id, quantity_kg: h.kg, urgency: "high", notes: "Demo hero scenario" }, user));
  }
  await stage(run, 1, `3 pickups requested: ${HERO.map((h) => `${h.name} ${h.kg} kg`).join(", ")}`, { pickups: pickups.map((p) => ({ id: p.id, code: p.code, source: p.source_name, kg: p.quantity_kg })) });
  await sleep(2000);

  // 3. OPTIMIZE — OR-Tools VRP on T-104 (or any idle truck at the hub)
  const hub = await P.nearestHub(abc);
  let truck = await one<any>("SELECT * FROM vehicles WHERE code='T-104' AND status='idle'");
  truck ??= await one<any>("SELECT * FROM vehicles WHERE status='idle' AND capacity_kg >= 1000 ORDER BY (hub_id=$1) DESC LIMIT 1", [hub.id]);
  if (!truck) throw new Error("No idle vehicle available");
  const opt = await P.optimizeCollection({ hub_id: hub.id, pickup_ids: pickups.map((p) => p.id), vehicle_ids: [truck.id] });
  const route = opt.routes[0];
  await stage(run, 2, `${route.vehicle_code}: ${route.stops.map((s: any) => s.name).join(" → ")} (${round(route.total_km, 1)} km, score ${route.opt_score}/100)`, { route });
  await sleep(2200);

  // 4. COLLECT — simulated truck drives the route (fast-forwarded)
  setRouteSpeed(route.id, 600);
  await P.startRoute(route.id);
  const shipment = await waitFor(() => one<any>("SELECT * FROM shipments WHERE route_id=$1", [route.id]), 9000);
  let sh = shipment;
  if (!sh) { sh = (await P.completeRoute(route.id, { exact_weight: true })).shipment; }
  // Hero demo uses the exact declared weight for reproducibility.
  await update("shipments", sh.id, { measured_kg: 1000 });
  sh = await one<any>("SELECT * FROM shipments WHERE id=$1", [sh.id]);
  await stage(run, 3, `${sh.code} arrived at ${hub.name}: 1,000 kg on weighbridge`, { shipment: sh });
  await sleep(1800);

  // 5. CLASSIFY + operator confirmation
  const cls = await P.classifyShipment(sh.id);
  await P.reviewClassification(cls.classification.id, "confirm", undefined, user);
  await stage(run, 4, `AI classification: ${Object.entries(cls.composition).map(([k, v]) => `${k} ${Math.round((v as number) * 1000)} kg`).join(", ")} — confidence ${(cls.confidence * 100).toFixed(1)}%`, { classification: cls });
  await sleep(2400);

  // 6. PREDICT pathways
  const pathways = await P.predictPathways(sh.id);
  const organic = pathways.streams.find((s: any) => s.stream === "organic");
  await stage(run, 5, `Organic ${round(organic.kg, 0)} kg → ${organic.recommended.replace(/_/g, " ")}: ${round(organic.options[0].expected_kwh, 0)} kWh expected`, { pathways });
  await sleep(2400);

  // 7+8. EVALUATE facilities, SELECT destination
  const dest = await P.optimizeDestination(sh.id);
  const orgDecision = dest.decisions.find((d: any) => d.kind === "facility_selection" && d.inputs.stream === "organic");
  await stage(run, 6, `${orgDecision.ranking.length} facilities evaluated for organic stream`, { ranking: orgDecision.ranking });
  await sleep(2600);
  await stage(run, 7, orgDecision.explanation.headline, { decision: orgDecision, decisions: dest.decisions });
  await sleep(2800);

  // 9. DISPATCH — approve all decisions, drive the organic load to the chosen facility
  let dispatchRoute: any = null;
  for (const d of dest.decisions) {
    const r = await P.approveDecision(d.id, user);
    if (d.id === orgDecision.id) dispatchRoute = r.route;
  }
  if (dispatchRoute) {
    setRouteSpeed(dispatchRoute.id, 900);
    await P.startRoute(dispatchRoute.id);
  }
  await stage(run, 8, dispatchRoute ? `${dispatchRoute.vehicle_code} dispatched: ${dispatchRoute.stops.map((s: any) => s.name).join(" → ")} (${round(dispatchRoute.total_km, 1)} km)` : "Dispatch planned", { route: dispatchRoute });
  if (dispatchRoute) await waitFor(() => one<any>("SELECT id FROM routes WHERE id=$1 AND status='completed'", [dispatchRoute.id]), 7000);
  await sleep(1200);

  // 10. ENERGY — simulated facility meter for every energy prediction of this shipment
  const preds = await query<any>("SELECT * FROM energy_predictions WHERE shipment_id=$1 ORDER BY id", [sh.id]);
  const results = [];
  for (const p of preds) results.push(await P.recordOutput({ prediction_id: p.id, simulate: true, seed: 1042 + p.stream.length }));
  const orgPred = preds.find((p) => p.stream === "organic");
  const orgOut = results.find((r) => r.output.stream === "organic");
  await stage(run, 9, `${round(orgOut!.output.actual_kwh, 0)} kWh generated at destination (simulated meter); predicted ${round(orgPred.predicted_kwh, 0)} kWh`, { outputs: results.map((r) => r.output) });
  await sleep(2200);

  // 11. FEEDBACK
  const fb = orgOut!.feedback;
  await stage(run, 10, `Model feedback recorded — prediction error ${Math.abs(fb.error_pct).toFixed(1)}%. Added to next retraining set.`, { feedback: results.map((r) => r.feedback), shipment_id: sh.id, decision_id: orgDecision.id });
  run.status = "completed";
  await publish("DemoStage", "Demo complete", { run_id: run.id, stage: 10, done: true, shipment_id: sh.id, decision_id: orgDecision.id });
}
