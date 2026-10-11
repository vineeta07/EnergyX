import { Router } from "express";
import { z } from "zod";
import { query, one } from "../database/db.ts";
import { ah, parse, idParam, notFound } from "../middleware/http.ts";
import { requireRole } from "../middleware/auth.ts";
import { audit } from "../services/audit.ts";
import * as C from "../services/circular.ts";

export const circularRouter = Router();
const operator = requireRole("hub", "admin");

circularRouter.get("/circular/summary", ah(async (_req, res) => { res.json(await C.circularSummary()); }));
circularRouter.get("/circular/partners", ah(async (_req, res) => {
  res.json(await query(`SELECT p.*, CASE WHEN p.received_kg > 0 THEN p.accepted_kg / p.received_kg END AS observed_acceptance FROM circular_partners p ORDER BY p.kind, p.id`));
}));

// ------------------------------------------------------------------ upcycling
const Category = z.enum(["textile", "glass_container", "pet_bottle", "hdpe_container", "cardboard"]);

circularRouter.get("/upcycling/lots", ah(async (_req, res) => { res.json(await C.listUpcycleLots()); }));
circularRouter.get("/upcycling/lots/:id", ah(async (req, res) => {
  const lot = await one("SELECT l.*, h.code AS hub_code, h.name AS hub_name, s.code AS shipment_code, p.name AS partner_name FROM upcycle_lots l JOIN processing_hubs h ON h.id=l.hub_id LEFT JOIN shipments s ON s.id=l.shipment_id LEFT JOIN circular_partners p ON p.id=l.partner_id WHERE l.id=$1", [idParam(req)]);
  if (!lot) throw notFound("Upcycle lot");
  res.json(lot);
}));
circularRouter.post("/upcycling/lots", operator, ah(async (req, res) => {
  const b = parse(z.object({ hub_id: z.number().int().optional(), shipment_id: z.number().int().optional(), category: Category, kg: z.number().positive().max(100_000), items: z.number().int().positive().optional(), notes: z.string().max(500).optional() }), req.body);
  const lot = await C.createUpcycleLot({ ...b, hub_id: b.hub_id ?? req.user!.hub_id ?? undefined }, req.user!);
  await audit(req, "upcycle.create", "upcycle_lot", lot.id, b);
  res.status(201).json(lot);
}));
circularRouter.post("/upcycling/lots/:id/match", operator, ah(async (req, res) => { res.json(await C.matchUpcycleLot(idParam(req))); }));
circularRouter.post("/upcycling/lots/:id/dispatch", operator, ah(async (req, res) => {
  const b = parse(z.object({ partner_id: z.number().int().nullable().optional(), fallback: z.boolean().optional() }), req.body ?? {});
  const out = await C.dispatchUpcycleLot(idParam(req), b);
  await audit(req, "upcycle.dispatch", "upcycle_lot", out.id, b);
  res.json(out);
}));
circularRouter.post("/upcycling/lots/:id/receive", operator, ah(async (req, res) => {
  const b = parse(z.object({ accepted_kg: z.number().min(0).max(100_000) }), req.body);
  const out = await C.receiveUpcycleLot(idParam(req), b.accepted_kg);
  await audit(req, "upcycle.receive", "upcycle_lot", out.id, b);
  res.json(out);
}));
circularRouter.post("/upcycling/lots/:id/complete", operator, ah(async (req, res) => {
  const b = parse(z.object({ products: z.string().min(1).max(200), units_made: z.number().int().min(0).max(1_000_000), revenue_inr: z.number().min(0).optional() }), req.body);
  res.json(await C.completeUpcycleLot(idParam(req), b));
}));

// ------------------------------------------------------------------ batteries
const Chemistry = z.enum(["li_nmc", "li_lfp", "lead_acid"]);
const Application = z.enum(["solar_storage_48v", "erickshaw_48v", "streetlight_12v", "telecom_48v"]);

circularRouter.get("/batteries/reference", ah(async (_req, res) => { res.json({ ...(await C.batteryReference()), presets: C.LOT_PRESETS }); }));
circularRouter.get("/batteries/lots", ah(async (_req, res) => {
  res.json(await query(`SELECT l.*, h.code AS hub_code,
      (SELECT json_object_agg(k, n) FROM (SELECT COALESCE(grade, 'untested') AS k, COUNT(*)::int AS n FROM battery_units u WHERE u.lot_id=l.id GROUP BY 1) g) AS grades,
      (SELECT json_object_agg(status, n) FROM (SELECT status, COUNT(*)::int AS n FROM battery_units u WHERE u.lot_id=l.id GROUP BY 1) s) AS statuses
    FROM battery_lots l LEFT JOIN processing_hubs h ON h.id=l.hub_id ORDER BY l.id DESC`));
}));
circularRouter.get("/batteries/lots/:id", ah(async (req, res) => {
  const id = idParam(req);
  const lot = await one("SELECT l.*, h.code AS hub_code, h.name AS hub_name FROM battery_lots l LEFT JOIN processing_hubs h ON h.id=l.hub_id WHERE l.id=$1", [id]);
  if (!lot) throw notFound("Battery lot");
  const units = await query("SELECT u.*, p.code AS pack_code FROM battery_units u LEFT JOIN battery_packs p ON p.id=u.pack_id WHERE u.lot_id=$1 ORDER BY u.id", [id]);
  const recycling = await query("SELECT r.*, p.name AS partner_name FROM battery_recycling r LEFT JOIN circular_partners p ON p.id=r.partner_id WHERE r.lot_id=$1 ORDER BY r.id", [id]);
  res.json({ lot, units, recycling });
}));
circularRouter.post("/batteries/lots", operator, ah(async (req, res) => {
  const b = parse(z.object({
    hub_id: z.number().int().optional(), source_label: z.string().min(2).max(200), chemistry: Chemistry, unit_type: z.enum(["cell", "module", "block"]),
    nominal_v: z.number().positive().max(1000), nominal_ah: z.number().positive().max(2000), unit_kg: z.number().positive().max(1000),
    unit_count: z.number().int().positive().max(2000), ir_ref_mohm: z.number().positive().optional(),
  }), req.body);
  const lot = await C.createBatteryLot({ ...b, hub_id: b.hub_id ?? req.user!.hub_id ?? undefined });
  await audit(req, "battery.lot_create", "battery_lot", lot.id, b);
  res.status(201).json(lot);
}));
circularRouter.post("/batteries/lots/:id/test", operator, ah(async (req, res) => {
  const b = parse(z.object({
    simulate: z.boolean().optional(),
    readings: z.array(z.object({ serial: z.string().max(40), measured_ah: z.number().min(0).max(2000), ir_mohm: z.number().positive().max(100_000), voltage: z.number().min(0).max(1000).optional(), swelling: z.boolean().optional(), leakage: z.boolean().optional() })).max(2000).optional(),
  }), req.body);
  const out = await C.testBatteryLot(idParam(req), b);
  await audit(req, "battery.test", "battery_lot", idParam(req), { simulate: b.simulate, readings: b.readings?.length });
  res.json(out);
}));
circularRouter.post("/batteries/lots/:id/recycle", operator, ah(async (req, res) => { res.json(await C.recycleRejects(idParam(req))); }));

circularRouter.get("/batteries/packs", ah(async (_req, res) => { res.json(await query("SELECT id, code, chemistry, application, config, units_used, nominal_v, capacity_ah, usable_kwh, imbalance_pct, pack_soh, soh_now, fade_pred, fade_observed, predicted_cycles, cycles, delivered_kwh, status, site_name, created_at, deployed_at FROM battery_packs ORDER BY id DESC")); }));
circularRouter.get("/batteries/packs/:id", ah(async (req, res) => {
  const id = idParam(req);
  const pack = await one("SELECT * FROM battery_packs WHERE id=$1", [id]);
  if (!pack) throw notFound("Pack");
  const telemetry = await query("SELECT to_char(day,'YYYY-MM-DD') AS day, discharged_kwh, cycles_cum, soh, is_simulated FROM pack_telemetry WHERE pack_id=$1 ORDER BY day", [id]);
  res.json({ pack, telemetry });
}));
circularRouter.post("/batteries/packs/design", operator, ah(async (req, res) => {
  const b = parse(z.object({ lot_ids: z.array(z.number().int()).min(1).max(20), application: Application, target_kwh: z.number().positive().max(1000).optional() }), req.body);
  const pack = await C.designPack(b);
  await audit(req, "battery.pack_design", "battery_pack", pack.id, b);
  res.status(201).json(pack);
}));
circularRouter.post("/batteries/packs/:id/assemble", operator, ah(async (req, res) => { res.json(await C.assemblePack(idParam(req))); }));
circularRouter.post("/batteries/packs/:id/deploy", operator, ah(async (req, res) => {
  const b = parse(z.object({ site_name: z.string().min(2).max(200), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }), req.body);
  res.json(await C.deployPack(idParam(req), b));
}));
circularRouter.post("/batteries/packs/:id/simulate", operator, ah(async (req, res) => {
  const b = parse(z.object({ days: z.number().int().min(1).max(730) }), req.body);
  res.json(await C.simulatePackDays(idParam(req), b.days));
}));
circularRouter.post("/batteries/learn", operator, ah(async (req, res) => {
  const b = parse(z.object({ chemistry: Chemistry }), req.body);
  res.json(await C.learnFade(b.chemistry));
}));
