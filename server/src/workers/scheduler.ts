/**
 * Background scheduler. Locally these are timers; in AWS they are EventBridge
 * Scheduler rules targeting SQS queues consumed by ECS worker tasks:
 *   - model bootstrap / scheduled retraining   (rate: 1 day, plus feedback-volume trigger)
 *   - overdue pickup sweep                      (rate: 1 minute)
 *   - fill-level pickup discovery               (rate: 10 minutes)
 */
import { query, one } from "../database/db.ts";
import { ai } from "../services/aiClient.ts";
import { raiseAlert } from "../services/alerts.ts";
import { getSetting, setSetting } from "../services/settings.ts";
import * as P from "../services/pipeline.ts";
import { publish } from "../services/events.ts";

let aiUp = false;

async function ensureModels() {
  try {
    const h = await ai.health();
    if (!aiUp) console.log(`[scheduler] AI service reachable (${h.status})`);
    aiUp = true;
  } catch {
    if (aiUp) console.warn("[scheduler] AI service unreachable");
    aiUp = false;
    return;
  }
  const active = await one<{ n: number }>("SELECT COUNT(DISTINCT model_key)::int AS n FROM model_versions WHERE status='active'");
  if ((active?.n ?? 0) < P.MODEL_KEYS.length) {
    const running = await one("SELECT id FROM training_runs WHERE status='running' AND started_at > now() - interval '10 minutes'");
    if (!running) {
      console.log("[scheduler] No trained models — starting bootstrap training");
      await P.triggerTraining("all", "bootstrap").catch((e) => console.error("[scheduler] bootstrap training failed:", e.message));
    }
    return;
  }
  await bootstrapOperations();
}

/** Once models exist: put some live operations on the map so the network is not static. */
async function bootstrapOperations() {
  if (await getSetting("ops_bootstrapped", false)) return;
  await setSetting("ops_bootstrapped", true);
  try {
    const hubs = await query<any>("SELECT * FROM processing_hubs WHERE code IN ('H-02','H-03')");
    for (const h of hubs) {
      const out = await P.optimizeCollection({ hub_id: h.id }).catch(() => null);
      for (const r of out?.routes ?? []) await P.startRoute(r.id);
    }
    // Process one queued shipment end-to-end up to dispatch so the decision center has a live decision.
    const sh = await one<any>("SELECT s.* FROM shipments s JOIN processing_hubs h ON h.id=s.hub_id WHERE s.status='awaiting_classification' AND h.code='H-02' LIMIT 1");
    if (sh) {
      await P.classifyShipment(sh.id);
      await P.optimizeDestination(sh.id);
    }
    console.log("[scheduler] Live operations bootstrapped");
  } catch (e: any) {
    console.error("[scheduler] ops bootstrap failed:", e.message);
  }
}

async function overdueSweep() {
  const overdue = await query<any>(`SELECT p.*, s.name FROM pickup_requests p JOIN waste_sources s ON s.id=p.source_id
    WHERE p.status='REQUESTED' AND p.window_end < now() AND NOT EXISTS (SELECT 1 FROM alerts a WHERE a.type='pickup_overdue' AND a.entity_type='pickup' AND a.entity_id=p.id)`);
  for (const p of overdue) {
    await raiseAlert({ severity: p.urgency === "critical" ? "critical" : "warning", type: "pickup_overdue", title: "Pickup overdue", message: `${p.code} at ${p.name} (${Math.round(p.quantity_kg)} kg) is past its collection window.`, entity_type: "pickup", entity_id: p.id });
  }
}

async function capacitySweep() {
  const hot = await query<any>(`SELECT f.* FROM facilities f WHERE f.utilization_pct >= 85 AND NOT EXISTS (SELECT 1 FROM alerts a WHERE a.type='facility_capacity' AND a.entity_id=f.id AND a.status<>'resolved')`);
  for (const f of hot) await raiseAlert({ severity: "warning", type: "facility_capacity", title: "Facility nearing capacity", message: `${f.label} is at ${f.utilization_pct}% utilization.`, entity_type: "facility", entity_id: f.id });
}

/** Discover: auto-request pickups for sources whose storage is estimated ≥ 85% full. */
async function fillLevelDiscovery() {
  const rows = await query<any>(`SELECT s.*, GREATEST((SELECT MAX(updated_at) FROM pickup_requests p WHERE p.source_id=s.id AND p.status='DELIVERED'),
      (SELECT MAX(sh.arrived_at) FROM shipments sh WHERE sh.source_mix @> jsonb_build_array(jsonb_build_object('source_id', s.id)))) AS last
    FROM waste_sources s WHERE s.status='active' AND NOT EXISTS (SELECT 1 FROM pickup_requests p WHERE p.source_id=s.id AND p.status IN ('REQUESTED','ASSIGNED','EN_ROUTE'))`);
  for (const s of rows) {
    const days = s.last ? (Date.now() - new Date(s.last).getTime()) / 86_400_000 : 1;
    const est = s.avg_daily_kg * days;
    if (est >= 0.85 * (s.storage_capacity_kg ?? s.avg_daily_kg * 1.6)) {
      await P.createPickup({ source_id: s.id, quantity_kg: Math.round(Math.min(est, s.storage_capacity_kg ?? est)), urgency: "normal", notes: "Auto-requested: storage estimated ≥85% full" });
      break; // one per sweep keeps the board readable
    }
  }
}

async function retrainPolicy() {
  const policy = await getSetting("retrain_policy", { min_new_feedback: 25 } as any);
  const pending = await one<{ n: number }>("SELECT COUNT(*)::int AS n FROM feedback_records WHERE kind='energy' AND training_run_id IS NULL");
  const last = await one<any>("SELECT MAX(trained_at) AS t FROM model_versions WHERE model_key='energy'");
  const stale = !last?.t || Date.now() - new Date(last.t).getTime() > 24 * 3600_000;
  if ((pending?.n ?? 0) >= policy.min_new_feedback || (stale && (pending?.n ?? 0) > 0)) {
    await publish("ModelRetrainingStarted", `Retrain policy triggered (${pending?.n} new feedback rows)`, {});
    await P.triggerTraining("energy", "scheduled").catch(() => undefined);
  }
}

function every(ms: number, fn: () => Promise<unknown>) {
  const run = () => fn().catch((e) => console.error("[scheduler]", e.message));
  setTimeout(run, 2000);
  setInterval(run, ms);
}

export function startScheduler() {
  every(15_000, ensureModels);
  every(60_000, overdueSweep);
  every(120_000, capacitySweep);
  every(10 * 60_000, fillLevelDiscovery);
  every(30 * 60_000, retrainPolicy);
}
