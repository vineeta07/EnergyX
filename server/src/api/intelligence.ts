import { Router } from "express";
import { z } from "zod";
import { query, one } from "../database/db.ts";
import { ah, parse, idParam, notFound, HttpError } from "../middleware/http.ts";
import { requireRole } from "../middleware/auth.ts";
import { audit } from "../services/audit.ts";
import { ai } from "../services/aiClient.ts";
import * as P from "../services/pipeline.ts";
import * as A from "../services/analytics.ts";
import { getSetting, setSetting } from "../services/settings.ts";
import { DEFAULT_WEIGHTS } from "../database/seed.ts";

export const aiRouter = Router();

// ------------------------------------------------------------------ AI actions (thin wrappers over the closed-loop pipeline)
aiRouter.post("/ai/classify", requireRole("hub", "admin"), ah(async (req, res) => {
  const b = parse(z.object({ shipment_id: z.number().int(), image_keys: z.array(z.string().max(200)).max(20).optional() }), req.body);
  const out = await P.classifyShipment(b.shipment_id, b.image_keys ?? []);
  await audit(req, "ai.classify", "shipment", b.shipment_id, { classification_id: out.classification.id });
  res.json(out);
}));

aiRouter.post("/ai/predict-energy", requireRole("hub", "admin", "facility"), ah(async (req, res) => {
  const b = parse(z.object({ shipment_id: z.number().int() }), req.body);
  res.json(await P.predictPathways(b.shipment_id));
}));

/** Stateless ranking preview (does not create a decision). */
aiRouter.post("/ai/rank-facilities", requireRole("hub", "admin"), ah(async (req, res) => {
  const b = parse(z.object({ shipment_id: z.number().int(), stream: z.enum(["organic", "plastic", "paper", "other"]).default("organic") }), req.body);
  const sh = await one<any>("SELECT s.*, h.lat, h.lng, h.name AS hub_name FROM shipments s JOIN processing_hubs h ON h.id=s.hub_id WHERE s.id=$1", [b.shipment_id]);
  if (!sh) throw notFound("Shipment");
  const eff = await P.effectiveComposition(sh.id);
  const kg = (sh.measured_kg ?? sh.total_kg) * (eff?.composition[b.stream as "organic"] ?? 1);
  res.json(await ai.rankFacilities({
    stream: b.stream, kg, moisture_pct: sh.moisture_pct ?? 70, month: new Date().getMonth() + 1,
    origin: { lat: sh.lat, lng: sh.lng, name: sh.hub_name }, facilities: await P.facilityCandidates(sh, b.stream),
    weights: await getSetting("optimizer_weights", DEFAULT_WEIGHTS),
  }));
}));

aiRouter.post("/ai/optimize-destination", requireRole("hub", "admin"), ah(async (req, res) => {
  const b = parse(z.object({ shipment_id: z.number().int() }), req.body);
  const out = await P.optimizeDestination(b.shipment_id);
  await audit(req, "ai.optimize_destination", "shipment", b.shipment_id, { decisions: out.decisions.map((d: any) => d.id) });
  res.json(out);
}));

aiRouter.get("/ai/forecast/:id", ah(async (req, res) => {
  const id = idParam(req);
  const s = await one<any>("SELECT * FROM waste_sources WHERE id=$1", [id]);
  if (!s) throw notFound("Waste source");
  const history = await query<any>("SELECT to_char(record_date,'YYYY-MM-DD') AS date, SUM(quantity_kg) AS kg FROM waste_records WHERE source_id=$1 AND record_date > now()::date - 90 GROUP BY record_date ORDER BY record_date", [id]);
  res.json(await ai.forecast({ source: { id: s.id, business_type: s.business_type, waste_type: s.waste_type, avg_daily_kg: s.avg_daily_kg }, history, horizon: 7 }));
}));

// ------------------------------------------------------------------ decision center
aiRouter.get("/ai-decisions", ah(async (req, res) => {
  const { status, kind } = req.query as Record<string, string | undefined>;
  const params: unknown[] = [];
  const where: string[] = [];
  if (status) { params.push(status); where.push(`d.status=$${params.length}`); }
  if (kind) { params.push(kind); where.push(`d.kind=$${params.length}`); }
  res.json(await query(`SELECT d.*, s.code AS shipment_code, f.label AS facility_label, f.name AS facility_name, h.lat AS origin_lat, h.lng AS origin_lng,
      (SELECT row_to_json(x) FROM (SELECT fr.predicted_kwh, fr.actual_kwh, fr.error_pct FROM feedback_records fr WHERE fr.decision_id=d.id LIMIT 1) x) AS outcome
    FROM ai_decisions d LEFT JOIN shipments s ON s.id=d.shipment_id LEFT JOIN processing_hubs h ON h.id=s.hub_id LEFT JOIN facilities f ON f.id=d.chosen_facility_id
    ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY d.id DESC LIMIT 100`, params));
}));

aiRouter.get("/ai-decisions/:id", ah(async (req, res) => {
  const id = idParam(req);
  const d = await one<any>(`SELECT d.*, s.code AS shipment_code, s.source_label, f.label AS facility_label, f.name AS facility_name, u.name AS decided_by_name, h.lat AS origin_lat, h.lng AS origin_lng
    FROM ai_decisions d LEFT JOIN shipments s ON s.id=d.shipment_id LEFT JOIN processing_hubs h ON h.id=s.hub_id LEFT JOIN facilities f ON f.id=d.chosen_facility_id LEFT JOIN users u ON u.id=d.decided_by WHERE d.id=$1`, [id]);
  if (!d) throw notFound("Decision");
  const prediction = await one<any>(`SELECT p.*, o.actual_kwh, o.recorded_at FROM energy_predictions p LEFT JOIN energy_outputs o ON o.prediction_id=p.id
    WHERE p.shipment_id=$1 AND p.stream=$2 ORDER BY p.id DESC LIMIT 1`, [d.shipment_id, d.inputs?.stream]);
  const feedback = await one("SELECT * FROM feedback_records WHERE decision_id=$1", [id]);
  res.json({ decision: d, prediction, feedback });
}));

aiRouter.post("/ai-decisions/:id/approve", requireRole("hub", "admin"), ah(async (req, res) => {
  const id = idParam(req);
  const b = parse(z.object({ override_facility_id: z.number().int().optional(), reason: z.string().min(3).max(500).optional() }), req.body ?? {});
  const out = await P.approveDecision(id, req.user!, b.override_facility_id ? { facility_id: b.override_facility_id, reason: b.reason ?? "Operator override" } : undefined);
  await audit(req, b.override_facility_id ? "decision.override" : "decision.approve", "ai_decision", id, b);
  res.json(out);
}));

// ------------------------------------------------------------------ optimizer weights (configurable utility function)
aiRouter.get("/settings/optimizer", ah(async (_req, res) => {
  res.json({ weights: await getSetting("optimizer_weights", DEFAULT_WEIGHTS), defaults: DEFAULT_WEIGHTS, retrain_policy: await getSetting("retrain_policy", {}) });
}));
aiRouter.put("/settings/optimizer", requireRole("admin"), ah(async (req, res) => {
  const w = parse(z.object({ energy: z.number().min(0).max(1), efficiency: z.number().min(0).max(1), compatibility: z.number().min(0).max(1), capacity: z.number().min(0).max(1), transport_cost: z.number().min(0).max(1), carbon: z.number().min(0).max(1), distance: z.number().min(0).max(1) }), req.body);
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  const norm = Object.fromEntries(Object.entries(w).map(([k, v]) => [k, Math.round((v / sum) * 1000) / 1000]));
  await setSetting("optimizer_weights", norm);
  await audit(req, "settings.optimizer_weights", "system_settings", "optimizer_weights", norm);
  res.json({ weights: norm });
}));

// ------------------------------------------------------------------ energy
aiRouter.post("/energy/output", requireRole("facility", "admin"), ah(async (req, res) => {
  const b = parse(z.object({
    prediction_id: z.number().int().optional(), facility_id: z.number().int().optional(), shipment_id: z.number().int().optional(),
    stream: z.enum(["organic", "plastic", "paper", "other"]).optional(), input_kg: z.number().positive().max(200_000).optional(),
    actual_kwh: z.number().min(0).max(1_000_000).optional(), simulate: z.boolean().optional(),
  }), req.body);
  if (req.user!.role === "facility" && b.facility_id && b.facility_id !== req.user!.facility_id) throw new HttpError(403, "Not your facility");
  const out = await P.recordOutput(b);
  await audit(req, "energy.output", "energy_output", out.output.id, { actual_kwh: out.output.actual_kwh, simulated: out.output.is_simulated });
  res.status(201).json(out);
}));

aiRouter.get("/energy/analytics", ah(async (req, res) => {
  const days = Math.min(120, Math.max(7, Number(req.query.days ?? 30)));
  const totals = await one<any>(`SELECT
      COALESCE(SUM(actual_kwh) FILTER (WHERE recorded_at::date = now()::date),0) AS today,
      COALESCE(SUM(actual_kwh) FILTER (WHERE recorded_at > now() - interval '7 days'),0) AS week,
      COALESCE(SUM(actual_kwh) FILTER (WHERE recorded_at > now() - interval '30 days'),0) AS month,
      COALESCE(SUM(actual_kwh),0) AS all_time,
      COALESCE(SUM(input_kg) FILTER (WHERE recorded_at > now() - interval '30 days'),0) AS input_kg_30d,
      AVG(efficiency_pct) FILTER (WHERE recorded_at > now() - interval '30 days') AS efficiency
    FROM energy_outputs`);
  const byTech = await query(`SELECT f.technology, SUM(o.actual_kwh) AS kwh, SUM(o.input_kg) AS kg FROM energy_outputs o JOIN facilities f ON f.id=o.facility_id WHERE o.recorded_at > now() - ($1 || ' days')::interval GROUP BY f.technology`, [days]);
  const scatter = await query(`SELECT p.predicted_kwh, o.actual_kwh, o.stream, f.label, p.model_version FROM energy_outputs o JOIN energy_predictions p ON p.id=o.prediction_id JOIN facilities f ON f.id=o.facility_id ORDER BY o.recorded_at DESC LIMIT 300`);
  const k = await A.kpis();
  res.json({ totals, kpis: k, timeseries: await A.timeseries(days), by_technology: byTech, predicted_vs_actual: scatter, facilities: await A.facilityPerformance() });
}));

aiRouter.get("/energy/outputs", ah(async (_req, res) => {
  res.json(await query(`SELECT o.*, f.label, f.name, p.predicted_kwh, s.code AS shipment_code FROM energy_outputs o JOIN facilities f ON f.id=o.facility_id
    LEFT JOIN energy_predictions p ON p.id=o.prediction_id LEFT JOIN shipments s ON s.id=o.shipment_id ORDER BY o.recorded_at DESC LIMIT 100`));
}));

// ------------------------------------------------------------------ models
aiRouter.get("/models", ah(async (_req, res) => {
  const versions = await query("SELECT * FROM model_versions ORDER BY model_key, trained_at DESC");
  const runs = await query("SELECT * FROM training_runs ORDER BY started_at DESC LIMIT 30");
  const feedback = await query<any>(`SELECT kind, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE training_run_id IS NULL)::int AS pending,
      AVG(ABS(error_pct)) AS mape FROM feedback_records GROUP BY kind`);
  const recentFeedback = await query(`SELECT fr.*, f.label AS facility_label FROM feedback_records fr LEFT JOIN facilities f ON f.id=fr.facility_id ORDER BY fr.id DESC LIMIT 25`);
  let live: any = null;
  try { live = await ai.health(); } catch { live = { status: "unreachable" }; }
  res.json({ versions, runs, feedback, recent_feedback: recentFeedback, service: live, drift_mape: await P.checkDrift() });
}));

aiRouter.get("/models/:id", ah(async (req, res) => {
  const id = idParam(req);
  const mv = await one("SELECT * FROM model_versions WHERE id=$1", [id]);
  if (!mv) throw notFound("Model version");
  res.json({ version: mv, runs: await query("SELECT * FROM training_runs WHERE model_version_id=$1", [id]) });
}));

aiRouter.post("/models/:key/retrain", requireRole("admin"), ah(async (req, res) => {
  const key = String(req.params.key);
  const runs = await P.triggerTraining(key, "manual");
  await audit(req, "model.retrain", "model", key);
  res.status(202).json({ runs });
}));
