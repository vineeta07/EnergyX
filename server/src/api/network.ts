import { Router } from "express";
import { z } from "zod";
import { query, one, insert, update } from "../database/db.ts";
import { ah, parse, idParam, notFound, HttpError } from "../middleware/http.ts";
import { requireRole } from "../middleware/auth.ts";
import { audit } from "../services/audit.ts";
import { publish } from "../services/events.ts";
import { cache } from "../services/cache.ts";
import { ai } from "../services/aiClient.ts";
import { round } from "../utils/geo.ts";
import { STREAMS } from "../database/simulator.ts";
import { nextCode } from "../services/settings.ts";

export const networkRouter = Router();

/** Data-derived priors: average lab-audited composition per business type + network yield per stream. */
async function energyPriors() {
  return cache.wrap("priors", 60_000, async () => {
    const rows = await query<any>(`SELECT s.source_mix, c.organic, c.plastic, c.paper, c.metal, c.other FROM shipments s
      JOIN waste_compositions c ON c.shipment_id=s.id AND c.origin IN ('lab_audit','operator')`);
    const acc: Record<string, { w: number; c: Record<string, number> }> = {};
    for (const r of rows) {
      const tot = r.source_mix.reduce((a: number, m: any) => a + m.kg, 0) || 1;
      for (const m of r.source_mix) {
        const a = (acc[m.business_type] ??= { w: 0, c: Object.fromEntries(STREAMS.map((s) => [s, 0])) });
        const w = m.kg / tot;
        a.w += w;
        for (const s of STREAMS) a.c[s] += w * r[s];
      }
    }
    const composition = Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, Object.fromEntries(STREAMS.map((s) => [s, v.c[s] / v.w]))]));
    const y = await query<any>(`SELECT o.stream, MAX(o.actual_kwh/NULLIF(o.input_kg,0)) AS best, SUM(o.actual_kwh)/NULLIF(SUM(o.input_kg),0) AS avg FROM energy_outputs o GROUP BY o.stream`);
    // Potential = what the best-performing facility class achieves on average (p50 of top facility).
    const top = await query<any>(`SELECT DISTINCT ON (o.stream) o.stream, SUM(o.actual_kwh)/SUM(o.input_kg) AS yield
      FROM energy_outputs o GROUP BY o.stream, o.facility_id ORDER BY o.stream, yield DESC`);
    const yieldBy = Object.fromEntries(top.map((t) => [t.stream, t.yield]));
    return { composition, yield: yieldBy, avg_yield: Object.fromEntries(y.map((r) => [r.stream, r.avg])) };
  });
}

async function potentialKwhPerDay(businessType: string, kgPerDay: number) {
  const p = await energyPriors();
  const comp = p.composition[businessType] ?? p.composition.municipal;
  if (!comp) return null;
  return round(kgPerDay * STREAMS.reduce((a, s) => a + (comp[s] ?? 0) * (p.yield[s] ?? 0), 0), 0);
}

// ------------------------------------------------------------------ waste sources
networkRouter.get("/waste-sources", ah(async (req, res) => {
  const { type, status, city, q, min_kg } = req.query as Record<string, string | undefined>;
  const params: unknown[] = [];
  const where: string[] = [];
  if (req.user!.role === "generator") { params.push(req.user!.id); where.push(`s.user_id=$${params.length}`); }
  if (type) { params.push(type); where.push(`(s.waste_type=$${params.length} OR s.business_type=$${params.length})`); }
  if (status) { params.push(status); where.push(`s.status=$${params.length}`); }
  if (city) { params.push(city); where.push(`s.city=$${params.length}`); }
  if (q) { params.push(`%${q}%`); where.push(`s.name ILIKE $${params.length}`); }
  if (min_kg) { params.push(Number(min_kg)); where.push(`s.avg_daily_kg >= $${params.length}`); }
  const rows = await query<any>(`
    SELECT s.*,
      (SELECT MIN(p.window_start) FROM pickup_requests p WHERE p.source_id=s.id AND p.status IN ('REQUESTED','ASSIGNED','EN_ROUTE')) AS next_pickup,
      (SELECT p.status FROM pickup_requests p WHERE p.source_id=s.id ORDER BY p.created_at DESC LIMIT 1) AS last_pickup_status,
      (SELECT AVG(quantity_kg) FROM waste_records r WHERE r.source_id=s.id AND r.record_date > now()::date - 14) AS recent_avg_kg
    FROM waste_sources s ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY s.avg_daily_kg DESC`, params);
  const out = [];
  for (const r of rows) out.push({ ...r, recent_avg_kg: r.recent_avg_kg != null ? round(r.recent_avg_kg, 0) : null, energy_potential_kwh_day: await potentialKwhPerDay(r.business_type, r.recent_avg_kg ?? r.avg_daily_kg) });
  res.json(out);
}));

networkRouter.get("/waste-sources/:id", ah(async (req, res) => {
  const id = idParam(req);
  const s = await one<any>("SELECT * FROM waste_sources WHERE id=$1", [id]);
  if (!s) throw notFound("Waste source");
  if (req.user!.role === "generator" && s.user_id !== req.user!.id) throw new HttpError(403, "Not your source");
  const history = await query<any>("SELECT to_char(record_date,'YYYY-MM-DD') AS date, SUM(quantity_kg) AS kg FROM waste_records WHERE source_id=$1 AND record_date > now()::date - 90 GROUP BY record_date ORDER BY record_date", [id]);
  const pickups = await query<any>("SELECT * FROM pickup_requests WHERE source_id=$1 ORDER BY created_at DESC LIMIT 20", [id]);
  let forecast: any = null;
  try {
    forecast = await ai.forecast({ source: { id: s.id, business_type: s.business_type, waste_type: s.waste_type, avg_daily_kg: s.avg_daily_kg }, history, horizon: 7 });
  } catch (e: any) {
    forecast = { error: e.message };
  }
  const kwh = await potentialKwhPerDay(s.business_type, s.avg_daily_kg);
  const delivered = await one<any>("SELECT COALESCE(SUM(quantity_kg),0) AS kg, COUNT(*)::int AS n FROM pickup_requests WHERE source_id=$1 AND status='DELIVERED'", [id]);
  const priors = await energyPriors();
  const comp = priors.composition[s.business_type];
  const organicKg = delivered.kg * (comp?.organic ?? 0.6);
  res.json({
    source: s, history: history.map((h) => ({ date: h.date, kg: round(h.kg, 0) })), pickups, forecast,
    energy_potential_kwh_day: kwh, typical_composition: comp,
    impact: {
      delivered_kg: round(delivered.kg, 0), pickups: delivered.n,
      est_energy_kwh: round(delivered.kg * (kwh ?? 0) / Math.max(1, s.avg_daily_kg), 0),
      est_co2_avoided_kg: round(organicKg * 0.45 + (delivered.kg * (kwh ?? 0) / Math.max(1, s.avg_daily_kg)) * 0.71, 0),
    },
  });
}));

const SourceSchema = z.object({
  name: z.string().min(2).max(120),
  business_type: z.enum(["restaurant", "hotel", "market", "food_processing", "agriculture", "manufacturing", "municipal"]),
  address: z.string().max(240).optional(),
  city: z.string().max(80).default("Delhi"),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  waste_type: z.string().max(60),
  quantity: z.number().positive().max(1_000_000),
  unit: z.enum(["kg", "tonnes"]).default("kg"),
  frequency: z.enum(["daily", "weekly", "twice_weekly", "monthly"]).default("daily"),
  operating_hours: z.string().max(60).optional(),
  storage_capacity_kg: z.number().positive().max(1_000_000).optional(),
  contamination_pct: z.number().min(0).max(100).default(10),
  image_key: z.string().max(200).optional(),
});

function sourceEstimates(b: z.infer<typeof SourceSchema>) {
  const kg = b.unit === "tonnes" ? b.quantity * 1000 : b.quantity;
  const perDay = b.frequency === "daily" ? kg : b.frequency === "twice_weekly" ? (kg * 2) / 7 : b.frequency === "weekly" ? kg / 7 : kg / 30;
  return { perDay, weekly: perDay * 7 };
}

function recommendFrequency(perDay: number, storage: number | undefined, businessType: string) {
  const perishable = ["restaurant", "hotel", "market", "food_processing"].includes(businessType);
  const daysToFill = storage ? storage / perDay : 2;
  const interval = Math.max(1, Math.floor(daysToFill * 0.8));
  if (perishable) return { interval_days: 1, label: "Daily", reason: "Putrescible food waste — collect within 24 h to limit methane loss and odour; daily pickups also preserve biogas yield." };
  return { interval_days: interval, label: interval === 1 ? "Daily" : `Every ${interval} days`, reason: `Storage fills in ~${daysToFill.toFixed(1)} days at the reported rate; pickup scheduled at 80% fill.` };
}

networkRouter.post("/waste-sources/estimate", ah(async (req, res) => {
  const b = parse(SourceSchema.partial({ name: true, lat: true, lng: true, waste_type: true }), req.body) as any;
  const { perDay, weekly } = sourceEstimates(b);
  res.json({ daily_kg: round(perDay, 0), weekly_kg: round(weekly, 0), energy_potential_kwh_day: await potentialKwhPerDay(b.business_type, perDay), energy_potential_kwh_week: round(((await potentialKwhPerDay(b.business_type, perDay)) ?? 0) * 7, 0), pickup: recommendFrequency(perDay, b.storage_capacity_kg, b.business_type) });
}));

networkRouter.post("/waste-sources", requireRole("generator", "admin"), ah(async (req, res) => {
  const b = parse(SourceSchema, req.body);
  const { perDay } = sourceEstimates(b);
  const row = await insert<any>("waste_sources", {
    user_id: req.user!.id, name: b.name, business_type: b.business_type, address: b.address, city: b.city, lat: b.lat, lng: b.lng,
    waste_type: b.waste_type, avg_daily_kg: round(perDay, 1), frequency: b.frequency, operating_hours: b.operating_hours,
    storage_capacity_kg: b.storage_capacity_kg, contamination_pct: b.contamination_pct, image_key: b.image_key, status: "active",
  });
  // Seed generation history with the declared baseline (one record) so forecasting has an anchor.
  await insert("waste_records", { source_id: row.id, record_date: new Date().toISOString().slice(0, 10), quantity_kg: round(perDay, 1), waste_type: b.waste_type });
  cache.invalidate("priors");
  await audit(req, "waste_source.create", "waste_source", row.id);
  await publish("WasteSourceRegistered", `New waste source registered: ${row.name} (${round(perDay, 0)} kg/day)`, { source_id: row.id });
  res.status(201).json({ source: row, estimates: { weekly_kg: round(perDay * 7, 0), energy_potential_kwh_day: await potentialKwhPerDay(b.business_type, perDay), pickup: recommendFrequency(perDay, b.storage_capacity_kg, b.business_type) } });
}));

networkRouter.patch("/waste-sources/:id", requireRole("generator", "admin"), ah(async (req, res) => {
  const id = idParam(req);
  const s = await one<any>("SELECT * FROM waste_sources WHERE id=$1", [id]);
  if (!s) throw notFound("Waste source");
  if (req.user!.role === "generator" && s.user_id !== req.user!.id) throw new HttpError(403, "Not your source");
  const b = parse(z.object({ status: z.enum(["active", "paused"]).optional(), avg_daily_kg: z.number().positive().optional(), storage_capacity_kg: z.number().positive().optional() }), req.body);
  await audit(req, "waste_source.update", "waste_source", id, b);
  res.json(await update("waste_sources", id, b));
}));

networkRouter.post("/waste-records", requireRole("generator", "hub", "admin"), ah(async (req, res) => {
  const b = parse(z.object({ source_id: z.number().int(), quantity_kg: z.number().positive().max(100_000), record_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), moisture_pct: z.number().min(0).max(100).optional() }), req.body);
  const s = await one<any>("SELECT * FROM waste_sources WHERE id=$1", [b.source_id]);
  if (!s) throw notFound("Waste source");
  if (req.user!.role === "generator" && s.user_id !== req.user!.id) throw new HttpError(403, "Not your source");
  const row = await insert("waste_records", { source_id: s.id, quantity_kg: b.quantity_kg, record_date: b.record_date ?? new Date().toISOString().slice(0, 10), waste_type: s.waste_type, moisture_pct: b.moisture_pct });
  await audit(req, "waste_record.create", "waste_record", (row as any).id);
  res.status(201).json(row);
}));

// ------------------------------------------------------------------ facilities
networkRouter.get("/facilities", ah(async (_req, res) => {
  const rows = await query<any>(`SELECT f.*, (SELECT json_agg(json_build_object('stream',c.stream,'compatibility_pct',c.compatibility_pct,'max_moisture_pct',c.max_moisture_pct)) FROM facility_capabilities c WHERE c.facility_id=f.id) AS capabilities,
      (SELECT SUM(actual_kwh)/NULLIF(SUM(input_kg),0) FROM energy_outputs o WHERE o.facility_id=f.id) AS hist_yield,
      (SELECT COALESCE(SUM(actual_kwh),0) FROM energy_outputs o WHERE o.facility_id=f.id AND o.recorded_at > now() - interval '30 days') AS kwh_30d,
      (SELECT COUNT(*)::int FROM routes r JOIN route_stops rs ON rs.route_id=r.id AND rs.stop_type='facility' AND rs.ref_id=f.id WHERE r.status IN ('planned','active')) AS incoming
    FROM facilities f ORDER BY f.code`);
  res.json(rows.map(({ sim_params, ...f }) => ({ ...f, hist_yield: f.hist_yield != null ? round(f.hist_yield, 3) : null, kwh_30d: round(f.kwh_30d, 0) })));
}));

networkRouter.get("/facilities/:id", ah(async (req, res) => {
  const id = idParam(req);
  const f = await one<any>("SELECT * FROM facilities WHERE id=$1", [id]);
  if (!f) throw notFound("Facility");
  const { sim_params, ...facility } = f;
  const caps = await query("SELECT stream, compatibility_pct, max_moisture_pct FROM facility_capabilities WHERE facility_id=$1", [id]);
  const daily = await query<any>(`SELECT to_char(recorded_at::date,'YYYY-MM-DD') AS date, SUM(input_kg) AS kg, SUM(actual_kwh) AS kwh, AVG(efficiency_pct) AS efficiency,
      SUM(p.predicted_kwh) AS predicted, SUM(CASE WHEN p.id IS NOT NULL THEN o.actual_kwh END) AS matched_actual
    FROM energy_outputs o LEFT JOIN energy_predictions p ON p.id=o.prediction_id WHERE o.facility_id=$1 AND o.recorded_at > now() - interval '60 days'
    GROUP BY recorded_at::date ORDER BY recorded_at::date`, [id]);
  const stats = await one<any>(`SELECT SUM(actual_kwh)/NULLIF(SUM(input_kg),0) AS yield, AVG(efficiency_pct) AS eff, AVG(actual_kwh) AS avg_kwh, COUNT(*)::int AS n FROM energy_outputs WHERE facility_id=$1`, [id]);
  const incoming = await query<any>(`SELECT r.*, v.code AS vehicle_code, rs.load_kg FROM routes r JOIN route_stops rs ON rs.route_id=r.id AND rs.stop_type='facility' AND rs.ref_id=$1
      JOIN vehicles v ON v.id=r.vehicle_id WHERE r.status IN ('planned','active','completed') ORDER BY r.created_at DESC LIMIT 15`, [id]);
  const pending = await query<any>(`SELECT p.*, s.code AS shipment_code, d.code AS decision_code, d.status AS decision_status FROM energy_predictions p
      JOIN shipments s ON s.id=p.shipment_id LEFT JOIN ai_decisions d ON d.shipment_id=p.shipment_id AND d.inputs->>'stream'=p.stream
      WHERE p.facility_id=$1 AND p.model_version NOT LIKE '%backtest' AND NOT EXISTS (SELECT 1 FROM energy_outputs o WHERE o.prediction_id=p.id) ORDER BY p.created_at DESC`, [id]);
  const recent = await query<any>(`SELECT o.*, p.predicted_kwh FROM energy_outputs o LEFT JOIN energy_predictions p ON p.id=o.prediction_id WHERE o.facility_id=$1 ORDER BY o.recorded_at DESC LIMIT 15`, [id]);
  res.json({
    facility: { ...facility, simulated_meter: !!sim_params }, capabilities: caps,
    stats: { historical_yield_kwh_per_kg: stats.yield != null ? round(stats.yield, 3) : null, avg_efficiency_pct: stats.eff != null ? round(stats.eff, 1) : null, avg_output_kwh: stats.avg_kwh != null ? round(stats.avg_kwh, 0) : null, readings: stats.n },
    daily: daily.map((d) => ({ date: d.date, kg: round(d.kg, 0), kwh: round(d.kwh, 0), efficiency: d.efficiency != null ? round(d.efficiency, 1) : null, predicted: d.predicted != null ? round(d.predicted, 0) : null, matched_actual: d.matched_actual != null ? round(d.matched_actual, 0) : null })),
    incoming, awaiting_output: pending, recent_outputs: recent,
  });
}));

const FacilitySchema = z.object({
  name: z.string().min(2).max(120), lat: z.number(), lng: z.number(),
  technology: z.enum(["anaerobic_digestion", "combustion", "landfill_gas", "rdf_coprocessing", "pyrolysis", "material_recovery"]),
  capacity_tpd: z.number().positive().max(10_000), utilization_pct: z.number().min(0).max(100).default(0),
  efficiency_pct: z.number().min(1).max(100), carbon_intensity: z.number().min(0).max(2).default(0.1), gate_fee_inr_per_t: z.number().min(0).default(0),
  capabilities: z.array(z.object({ stream: z.enum(["organic", "plastic", "paper", "metal", "other"]), compatibility_pct: z.number().min(0).max(100), max_moisture_pct: z.number().min(0).max(100).optional() })).min(1),
});

networkRouter.post("/facilities", requireRole("facility", "admin"), ah(async (req, res) => {
  const b = parse(FacilitySchema, req.body);
  const code = await nextCode("facilities", "FAC", 100);
  const count = await one<any>("SELECT COUNT(*)::int AS n FROM facilities");
  const f = await insert<any>("facilities", { code, label: `Facility ${String.fromCharCode(65 + count.n)}`, name: b.name, lat: b.lat, lng: b.lng, technology: b.technology, capacity_tpd: b.capacity_tpd, utilization_pct: b.utilization_pct, efficiency_pct: b.efficiency_pct, carbon_intensity: b.carbon_intensity, gate_fee_inr_per_t: b.gate_fee_inr_per_t });
  for (const c of b.capabilities) await insert("facility_capabilities", { facility_id: f.id, ...c });
  await audit(req, "facility.create", "facility", f.id);
  await publish("FacilityRegistered", `Facility registered: ${f.name} (${b.technology.replace(/_/g, " ")})`, { facility_id: f.id });
  res.status(201).json(f);
}));

networkRouter.patch("/facilities/:id", requireRole("facility", "admin"), ah(async (req, res) => {
  const id = idParam(req);
  if (req.user!.role === "facility" && req.user!.facility_id !== id) throw new HttpError(403, "You can only update your own facility");
  const b = parse(z.object({ status: z.enum(["online", "maintenance", "offline"]).optional(), utilization_pct: z.number().min(0).max(100).optional(), efficiency_pct: z.number().min(1).max(100).optional() }), req.body);
  await audit(req, "facility.update", "facility", id, b);
  res.json(await update("facilities", id, b));
}));

// ------------------------------------------------------------------ hubs + vehicles
networkRouter.get("/hubs", ah(async (_req, res) => {
  res.json(await query(`SELECT h.*, (SELECT COUNT(*)::int FROM shipments s WHERE s.hub_id=h.id AND s.status IN ('awaiting_classification','classified')) AS queued FROM processing_hubs h ORDER BY code`));
}));

networkRouter.get("/vehicles", ah(async (_req, res) => {
  res.json(await query(`SELECT v.*, h.code AS hub_code, r.code AS route_code, r.progress, r.kind AS route_kind FROM vehicles v LEFT JOIN processing_hubs h ON h.id=v.hub_id LEFT JOIN routes r ON r.id=v.active_route_id ORDER BY v.code`));
}));
