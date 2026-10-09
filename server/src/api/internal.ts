/**
 * Service-to-service API consumed by the Python AI service (X-Service-Key auth).
 *  - /internal/datasets/*  : training-table exports (the ML pipeline's raw data)
 *  - /internal/training-runs/:id/complete : training callback (model registry update)
 *  - /internal/tools/*     : read-only data tools for the WattCycle Intelligence assistant
 */
import { Router } from "express";
import { query, one } from "../database/db.ts";
import { ah, idParam } from "../middleware/http.ts";
import * as P from "../services/pipeline.ts";
import * as A from "../services/analytics.ts";
import { round, roadKm } from "../utils/geo.ts";

export const internalRouter = Router();

internalRouter.get("/datasets/waste_records", ah(async (_req, res) => {
  res.json(await query(`SELECT r.id, r.source_id, s.business_type, s.waste_type, s.avg_daily_kg, to_char(r.record_date,'YYYY-MM-DD') AS date, r.quantity_kg AS kg
    FROM waste_records r JOIN waste_sources s ON s.id=r.source_id ORDER BY r.source_id, r.record_date`));
}));

/** Ground-truth compositions: lab audits + operator-labelled corrections (human feedback). */
internalRouter.get("/datasets/compositions", ah(async (_req, res) => {
  res.json(await query(`SELECT c.id, c.shipment_id, c.origin, c.organic, c.plastic, c.paper, c.metal, c.other, COALESCE(c.moisture_pct, s.moisture_pct) AS moisture_pct,
      EXTRACT(MONTH FROM COALESCE(s.arrived_at, s.created_at))::int AS month, COALESCE(s.measured_kg, s.total_kg) AS total_kg, s.source_mix,
      to_char(COALESCE(s.arrived_at, s.created_at),'YYYY-MM-DD') AS date
    FROM waste_compositions c JOIN shipments s ON s.id=c.shipment_id WHERE c.origin IN ('lab_audit','operator') ORDER BY s.arrived_at`));
}));

/** Energy conversion records with facility features at time of processing. */
internalRouter.get("/datasets/energy", ah(async (_req, res) => {
  res.json(await query(`SELECT o.id, o.facility_id, f.code AS facility_code, f.technology, f.efficiency_pct, f.utilization_pct, f.capacity_tpd,
      COALESCE(c.compatibility_pct, 50) AS compatibility_pct, o.stream, o.input_kg, o.moisture_pct, o.actual_kwh,
      EXTRACT(MONTH FROM o.recorded_at)::int AS month, o.recorded_at, (o.prediction_id IS NOT NULL AND p.model_version NOT LIKE '%backtest') AS is_live_feedback
    FROM energy_outputs o JOIN facilities f ON f.id=o.facility_id LEFT JOIN facility_capabilities c ON c.facility_id=f.id AND c.stream=o.stream
    LEFT JOIN energy_predictions p ON p.id=o.prediction_id ORDER BY o.recorded_at`));
}));

internalRouter.get("/datasets/feedback_max_id", ah(async (_req, res) => {
  res.json(await one("SELECT COALESCE(MAX(id),0)::int AS max_id FROM feedback_records"));
}));

internalRouter.post("/training-runs/:id/complete", ah(async (req, res) => {
  await P.completeTraining(idParam(req), req.body);
  res.json({ ok: true });
}));

// ------------------------------------------------------------------ assistant tools (read-only)
internalRouter.get("/tools/kpis", ah(async (_req, res) => res.json(await A.kpis())));

internalRouter.get("/tools/decisions", ah(async (req, res) => {
  const facility = (req.query.facility as string | undefined)?.toUpperCase();
  const rows = await query<any>(`SELECT d.id, d.code, d.subject, d.status, d.score, d.confidence, d.inputs, d.output, d.explanation, d.ranking, d.weights, d.created_at, f.label AS facility_label
    FROM ai_decisions d LEFT JOIN facilities f ON f.id=d.chosen_facility_id WHERE d.kind='facility_selection'
    ${facility ? "AND (upper(f.label) LIKE '%' || $1 || '%' OR upper(f.code) LIKE '%' || $1 || '%')" : ""} ORDER BY d.id DESC LIMIT 3`, facility ? [facility.replace(/^FACILITY\s*/, "")] : []);
  res.json(rows.map((d) => ({
    ...d,
    ranking: (d.ranking ?? []).map((r: any) => ({ label: r.label, score: r.score, predicted_kwh: r.predicted_kwh, distance_km: r.distance_km, efficiency_pct: r.efficiency_pct, compatibility_pct: r.compatibility_pct, utilization_pct: r.utilization_pct, transport_cost_inr: r.transport_cost_inr, eligible: r.eligible })),
  })));
}));

internalRouter.get("/tools/energy", ah(async (req, res) => {
  const days = Math.min(365, Number(req.query.days ?? 30));
  const stream = req.query.stream as string | undefined;
  const rows = await query(`SELECT o.stream, f.label, f.technology, SUM(o.actual_kwh) AS kwh, SUM(o.input_kg) AS kg, COUNT(*)::int AS batches
    FROM energy_outputs o JOIN facilities f ON f.id=o.facility_id WHERE o.recorded_at > now() - ($1 || ' days')::interval ${stream ? "AND o.stream=$2" : ""}
    GROUP BY o.stream, f.label, f.technology ORDER BY kwh DESC`, stream ? [days, stream] : [days]);
  res.json({ days, stream: stream ?? "all", rows, simulated: true });
}));

internalRouter.get("/tools/co2", ah(async (req, res) => {
  const days = Math.min(365, Number(req.query.days ?? 7));
  const r = await one<any>(`SELECT COALESCE(SUM(actual_kwh),0) AS kwh, COALESCE(SUM(input_kg) FILTER (WHERE stream='organic'),0) AS organic_kg FROM energy_outputs WHERE recorded_at > now() - ($1 || ' days')::interval`, [days]);
  const t = await one<any>(`SELECT COALESCE(SUM(co2_kg),0) AS transport FROM routes WHERE created_at > now() - ($1 || ' days')::interval AND status<>'cancelled'`, [days]);
  const grid = r.kwh * A.GRID_KG_CO2_PER_KWH;
  const landfill = r.organic_kg * A.LANDFILL_KG_CO2E_PER_KG_ORGANIC;
  res.json({ days, energy_kwh: round(r.kwh, 0), grid_displacement_kg: round(grid, 0), landfill_methane_avoided_kg: round(landfill, 0), transport_emissions_kg: round(t.transport, 0), net_avoided_kg: round(grid + landfill - t.transport, 0), factors: { grid_kg_per_kwh: A.GRID_KG_CO2_PER_KWH, landfill_kg_per_kg_organic: A.LANDFILL_KG_CO2E_PER_KG_ORGANIC } });
}));

internalRouter.get("/tools/facilities", ah(async (_req, res) => {
  const rows = await query<any>(`SELECT f.label, f.name, f.technology, f.capacity_tpd, f.utilization_pct, f.efficiency_pct, f.status,
      (SELECT string_agg(c.stream || ' ' || c.compatibility_pct || '%', ', ') FROM facility_capabilities c WHERE c.facility_id=f.id) AS accepts FROM facilities f ORDER BY f.code`);
  res.json(rows.map((f) => ({ ...f, available_tpd: round(f.capacity_tpd * (1 - f.utilization_pct / 100), 2) })));
}));

/** Which sources to prioritise: estimated storage fill since last delivered pickup × energy value × urgency. */
internalRouter.get("/tools/source-priority", ah(async (_req, res) => {
  const rows = await query<any>(`SELECT s.id, s.name, s.business_type, s.avg_daily_kg, s.storage_capacity_kg, s.lat, s.lng,
      GREATEST(
        (SELECT MAX(updated_at) FROM pickup_requests p WHERE p.source_id=s.id AND p.status='DELIVERED'),
        (SELECT MAX(sh.arrived_at) FROM shipments sh WHERE sh.source_mix @> jsonb_build_array(jsonb_build_object('source_id', s.id)))
      ) AS last_pickup,
      (SELECT string_agg(p.urgency || ':' || p.status, ',') FROM pickup_requests p WHERE p.source_id=s.id AND p.status IN ('REQUESTED','ASSIGNED')) AS open
    FROM waste_sources s WHERE s.status='active'`);
  const hubs = await query<any>("SELECT * FROM processing_hubs");
  const now = Date.now();
  const scored = rows.map((s) => {
    const days = s.last_pickup ? (now - new Date(s.last_pickup).getTime()) / 86_400_000 : 1.5;
    const fill = Math.min(1.5, (s.avg_daily_kg * days) / (s.storage_capacity_kg || s.avg_daily_kg * 1.6));
    const urgency = s.open?.includes("critical") ? 1.4 : s.open?.includes("high") ? 1.2 : 1;
    const hubKm = Math.min(...hubs.map((h) => roadKm(s, h)));
    const organic = ["restaurant", "hotel", "market", "food_processing", "agriculture"].includes(s.business_type);
    const score = fill * urgency * (organic ? 1.25 : 1) * Math.log10(10 + s.avg_daily_kg) / (1 + hubKm / 40);
    return { name: s.name, business_type: s.business_type, est_fill_pct: round(Math.min(fill, 1) * 100, 0), days_since_collection: round(days, 1), open_request: s.open ?? null, km_to_hub: round(hubKm, 1), avg_daily_kg: s.avg_daily_kg, priority_score: round(score, 3) };
  });
  res.json(scored.sort((a, b) => b.priority_score - a.priority_score).slice(0, 8));
}));

internalRouter.get("/tools/routes", ah(async (_req, res) => {
  const rows = await query<any>(`SELECT r.id, r.code, r.kind, r.status, r.total_km, r.baseline_km, r.duration_min, r.co2_kg, r.cost_inr, r.opt_score, r.explanation, v.code AS vehicle, v.capacity_kg,
      (SELECT MAX(load_kg) FROM route_stops s WHERE s.route_id=r.id) AS peak_load_kg, (SELECT COUNT(*)::int FROM route_stops s WHERE s.route_id=r.id AND s.stop_type='pickup') AS pickups
    FROM routes r JOIN vehicles v ON v.id=r.vehicle_id WHERE r.status<>'cancelled' ORDER BY r.id DESC LIMIT 12`);
  res.json(rows.map((r) => ({ ...r, utilization_pct: r.peak_load_kg ? round((100 * r.peak_load_kg) / r.capacity_kg, 0) : null, km_per_pickup: r.pickups ? round(r.total_km / r.pickups, 1) : null })));
}));

internalRouter.get("/tools/models", ah(async (_req, res) => {
  res.json(await query("SELECT model_key, version, algorithm, trained_at, dataset_size, metrics FROM model_versions WHERE status='active'"));
}));
