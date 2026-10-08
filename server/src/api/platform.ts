import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { query, one, update } from "../database/db.ts";
import { ah, parse, idParam, notFound, HttpError } from "../middleware/http.ts";
import { requireRole, requireAuth } from "../middleware/auth.ts";
import { audit } from "../services/audit.ts";
import { ai } from "../services/aiClient.ts";
import * as A from "../services/analytics.ts";
import { config } from "../config.ts";
import { runDemo, demoState } from "../workers/demo.ts";

export const platformRouter = Router();

// ------------------------------------------------------------------ dashboard
platformRouter.get("/dashboard", ah(async (_req, res) => {
  const [kpis, flow, ts] = await Promise.all([A.kpis(), A.flow(30), A.timeseries(30)]);
  const decisions = await query(`SELECT d.*, f.label AS facility_label, s.code AS shipment_code,
      (SELECT row_to_json(x) FROM (SELECT fr.actual_kwh, fr.error_pct FROM feedback_records fr WHERE fr.decision_id=d.id LIMIT 1) x) AS outcome
    FROM ai_decisions d LEFT JOIN facilities f ON f.id=d.chosen_facility_id LEFT JOIN shipments s ON s.id=d.shipment_id
    WHERE d.kind='facility_selection' ORDER BY d.id DESC LIMIT 4`);
  const activity = await query("SELECT * FROM events ORDER BY id DESC LIMIT 25");
  res.json({ kpis, flow, timeseries: ts, decisions, activity });
}));

platformRouter.get("/map", ah(async (_req, res) => {
  const [sources, hubs, facilities, vehicles, routes] = await Promise.all([
    query("SELECT id, name, business_type, lat, lng, avg_daily_kg, status, (SELECT COUNT(*)::int FROM pickup_requests p WHERE p.source_id=s.id AND p.status='REQUESTED') AS open_requests FROM waste_sources s"),
    query("SELECT id, code, name, lat, lng, capacity_tpd, current_load_kg FROM processing_hubs"),
    query("SELECT id, code, label, name, lat, lng, technology, utilization_pct, efficiency_pct, status FROM facilities"),
    query("SELECT id, code, type, lat, lng, heading, status, capacity_kg, current_load_kg, active_route_id FROM vehicles"),
    query<any>("SELECT r.id, r.code, r.kind, r.status, r.progress, r.vehicle_id FROM routes r WHERE r.status IN ('planned','active')"),
  ]);
  const stops = routes.length ? await query<any>("SELECT route_id, seq, lat, lng, stop_type, name, status FROM route_stops WHERE route_id = ANY($1::int[]) ORDER BY route_id, seq", [routes.map((r) => r.id)]) : [];
  res.json({ sources, hubs, facilities, vehicles, routes: routes.map((r) => ({ ...r, stops: stops.filter((s) => s.route_id === r.id) })) });
}));

platformRouter.get("/analytics", ah(async (req, res) => {
  const days = Math.min(120, Math.max(7, Number(req.query.days ?? 60)));
  const [kpis, ts, facilities] = await Promise.all([A.kpis(), A.timeseries(days), A.facilityPerformance()]);
  const byType = await query(`SELECT business_type, SUM(r.quantity_kg) AS kg FROM waste_records r JOIN waste_sources s ON s.id=r.source_id WHERE r.record_date > now()::date - $1::int GROUP BY business_type ORDER BY kg DESC`, [days]);
  const transport = await one<any>(`SELECT COALESCE(SUM(cost_inr),0) AS cost, COALESCE(SUM(co2_kg),0) AS co2, COALESCE(SUM(total_km),0) AS km, COALESCE(SUM(baseline_km),0) AS baseline_km, AVG(opt_score) AS score FROM routes WHERE status<>'cancelled'`);
  const totals = await one<any>(`SELECT COALESCE(SUM(actual_kwh),0) AS kwh, COALESCE(SUM(input_kg),0) AS kg FROM energy_outputs WHERE recorded_at > now() - ($1 || ' days')::interval`, [days]);
  const generated = await one<any>(`SELECT COALESCE(SUM(quantity_kg),0) AS kg FROM waste_records WHERE record_date > now()::date - $1::int`, [days]);
  const collected = await one<any>(`SELECT COALESCE(SUM(measured_kg),0) AS kg FROM shipments WHERE arrived_at > now() - ($1 || ' days')::interval`, [days]);
  const accuracy = await query(`SELECT date_trunc('week', o.recorded_at)::date AS week, AVG(ABS(p.predicted_kwh-o.actual_kwh)/NULLIF(o.actual_kwh,0))*100 AS mape, COUNT(*)::int AS n
    FROM energy_outputs o JOIN energy_predictions p ON p.id=o.prediction_id GROUP BY 1 ORDER BY 1`);
  const gateFees = await one<any>(`SELECT COALESCE(SUM(o.input_kg/1000*f.gate_fee_inr_per_t),0) AS fees FROM energy_outputs o JOIN facilities f ON f.id=o.facility_id WHERE o.recorded_at > now() - ($1 || ' days')::interval`, [days]);
  res.json({
    days, kpis, timeseries: ts, facilities, waste_by_type: byType,
    summary: {
      waste_generated_kg: generated.kg, waste_collected_kg: collected.kg, energy_kwh: totals.kwh,
      energy_per_kg: totals.kg ? totals.kwh / totals.kg : null, transport_cost_inr: transport.cost, transport_co2_kg: transport.co2,
      route_km: transport.km, baseline_km: transport.baseline_km, route_efficiency: transport.score,
      cost_per_kwh_inr: totals.kwh ? (transport.cost + gateFees.fees) / totals.kwh : null,
      co2_avoided_kg: kpis.co2_avoided_kg_30d,
    },
    accuracy,
  });
}));

/** Public impact numbers for the landing / impact pages (no auth). */
platformRouter.get("/public/impact", ah(async (_req, res) => {
  const k = await A.kpis();
  const total = await one<any>(`SELECT COALESCE(SUM(measured_kg),0) AS kg FROM shipments`);
  const kwh = await one<any>(`SELECT COALESCE(SUM(actual_kwh),0) AS kwh, COALESCE(SUM(input_kg) FILTER (WHERE stream='organic'),0) AS organic FROM energy_outputs`);
  res.json({
    waste_processed_kg: Math.round(total.kg), energy_kwh: Math.round(kwh.kwh),
    co2_avoided_kg: Math.round(kwh.kwh * A.GRID_KG_CO2_PER_KWH + kwh.organic * A.LANDFILL_KG_CO2E_PER_KG_ORGANIC),
    routing_efficiency: k.routing_efficiency, prediction_accuracy: k.prediction_accuracy, factors: k.factors, simulated: true,
  });
}));

// ------------------------------------------------------------------ alerts + notifications + activity
platformRouter.get("/alerts", ah(async (req, res) => {
  const status = (req.query.status as string | undefined) ?? "open,acknowledged";
  res.json(await query("SELECT * FROM alerts WHERE status = ANY($1::text[]) ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, created_at DESC LIMIT 100", [status.split(",")]));
}));
platformRouter.post("/alerts/:id/:action", requireRole("admin", "fleet", "hub", "facility"), ah(async (req, res) => {
  const id = idParam(req);
  const action = req.params.action;
  if (!["acknowledge", "resolve"].includes(String(action))) throw new HttpError(400, "Unknown action");
  const out = await update("alerts", id, { status: action === "acknowledge" ? "acknowledged" : "resolved" });
  if (!out) throw notFound("Alert");
  await audit(req, `alert.${action}`, "alert", id);
  res.json(out);
}));
platformRouter.get("/events", ah(async (req, res) => {
  const limit = Math.min(200, Number(req.query.limit ?? 50));
  res.json(await query("SELECT * FROM events ORDER BY id DESC LIMIT $1", [limit]));
}));

// ------------------------------------------------------------------ uploads (images for classification / source registration)
fs.mkdirSync(config.uploadDir, { recursive: true });
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
});
const MAGIC: [string, number[]][] = [["jpg", [0xff, 0xd8, 0xff]], ["png", [0x89, 0x50, 0x4e, 0x47]], ["webp", [0x52, 0x49, 0x46, 0x46]]];

platformRouter.post("/uploads", requireRole("generator", "hub", "admin"), upload.single("file"), ah(async (req, res) => {
  const f = req.file;
  if (!f) throw new HttpError(400, "file is required");
  // Validate by magic bytes, never by client-supplied MIME/extension.
  const kind = MAGIC.find(([, sig]) => sig.every((b, i) => f.buffer[i] === b))?.[0];
  if (!kind) throw new HttpError(415, "Only JPEG, PNG or WebP images are accepted");
  const key = `uploads/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${kind}`;
  // Local mode writes to disk; AWS mode PUTs to S3 (SSE-KMS) and serves via short-lived presigned GET URLs.
  const dest = path.join(config.uploadDir, key.replace(/\//g, path.sep));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, f.buffer);
  await audit(req, "upload.create", "upload", key, { bytes: f.size });
  res.status(201).json({ key, url: `/api/uploads/${encodeURIComponent(key)}`, bytes: f.size });
}));

platformRouter.get("/uploads/:key", ah(async (req, res) => {
  const key = decodeURIComponent(String(req.params.key));
  if (!/^uploads\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(key)) throw new HttpError(400, "Bad key");
  const file = path.join(config.uploadDir, key.replace(/\//g, path.sep));
  if (!fs.existsSync(file)) throw notFound("Upload");
  res.sendFile(file);
}));

// ------------------------------------------------------------------ assistant (runs in the Python AI service, tools hit /internal)
platformRouter.post("/assistant/chat", ah(async (req, res) => {
  const b = parse(z.object({ messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).min(1).max(30) }), req.body);
  res.json(await ai.assistant({ messages: b.messages, user: { name: req.user!.name, role: req.user!.role } }));
}));

// ------------------------------------------------------------------ demo mode
platformRouter.post("/demo/run", requireRole("admin", "hub", "fleet"), ah(async (req, res) => {
  const run = await runDemo(req.user!);
  await audit(req, "demo.run", "demo", run.id);
  res.status(202).json(run);
}));
platformRouter.get("/demo/status", ah(async (_req, res) => res.json(demoState())));

// ------------------------------------------------------------------ admin
platformRouter.get("/admin/users", requireRole("admin"), ah(async (_req, res) => {
  res.json(await query("SELECT id, email, name, role, organization, facility_id, hub_id, created_at FROM users ORDER BY id"));
}));
platformRouter.patch("/admin/users/:id", requireRole("admin"), ah(async (req, res) => {
  const id = idParam(req);
  const b = parse(z.object({ role: z.enum(["generator", "fleet", "hub", "facility", "admin"]).optional(), organization: z.string().max(200).optional() }), req.body);
  if (id === req.user!.id && b.role && b.role !== "admin") throw new HttpError(400, "You cannot demote yourself");
  await audit(req, "admin.user_update", "user", id, b);
  const u = await update<any>("users", id, b);
  if (!u) throw notFound("User");
  const { password_hash, ...safe } = u;
  res.json(safe);
}));
platformRouter.get("/admin/audit", requireRole("admin"), ah(async (_req, res) => {
  res.json(await query("SELECT a.*, u.email FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 200"));
}));
platformRouter.get("/admin/overview", requireRole("admin"), ah(async (_req, res) => {
  const counts = await one(`SELECT (SELECT COUNT(*)::int FROM users) AS users, (SELECT COUNT(*)::int FROM waste_sources) AS sources, (SELECT COUNT(*)::int FROM facilities) AS facilities,
    (SELECT COUNT(*)::int FROM vehicles) AS vehicles, (SELECT COUNT(*)::int FROM processing_hubs) AS hubs, (SELECT COUNT(*)::int FROM waste_records) AS waste_records,
    (SELECT COUNT(*)::int FROM energy_outputs) AS energy_outputs, (SELECT COUNT(*)::int FROM ai_decisions) AS decisions, (SELECT COUNT(*)::int FROM feedback_records) AS feedback,
    (SELECT COUNT(*)::int FROM events) AS events, (SELECT COUNT(*)::int FROM audit_logs) AS audit_logs`);
  let aiHealth: any;
  try { aiHealth = await ai.health(); } catch { aiHealth = { status: "unreachable" }; }
  res.json({ counts, services: { api: "ok", database: config.databaseUrl ? "postgresql" : "pglite (embedded postgres)", ai: aiHealth.status, ai_models: aiHealth.models } });
}));

platformRouter.get("/system/status", requireAuth, ah(async (_req, res) => {
  let aiHealth: any;
  try { aiHealth = await ai.health(); } catch { aiHealth = { status: "unreachable" }; }
  const crit = await one<any>("SELECT COUNT(*)::int AS n FROM alerts WHERE status='open' AND severity='critical'");
  res.json({ api: "ok", ai: aiHealth.status, models_ready: aiHealth.models ? Object.values(aiHealth.models).every((m: any) => m?.loaded) : false, critical_alerts: crit.n });
}));
