import { Router } from "express";
import { z } from "zod";
import { query, one, update } from "../database/db.ts";
import { ah, parse, idParam, notFound, HttpError } from "../middleware/http.ts";
import { requireRole } from "../middleware/auth.ts";
import { audit } from "../services/audit.ts";
import { publish } from "../services/events.ts";
import * as P from "../services/pipeline.ts";
import * as geo from "../utils/geo.ts";

export const opsRouter = Router();

// ------------------------------------------------------------------ pickups
opsRouter.get("/pickups", ah(async (req, res) => {
  const { status } = req.query as Record<string, string | undefined>;
  const params: unknown[] = [];
  const where: string[] = [];
  if (req.user!.role === "generator") { params.push(req.user!.id); where.push(`s.user_id=$${params.length}`); }
  if (status) { params.push(status.split(",")); where.push(`p.status = ANY($${params.length}::text[])`); }
  res.json(await query(`SELECT p.*, s.name AS source_name, s.lat, s.lng, s.address, v.code AS vehicle_code, r.code AS route_code
    FROM pickup_requests p JOIN waste_sources s ON s.id=p.source_id LEFT JOIN vehicles v ON v.id=p.vehicle_id LEFT JOIN routes r ON r.id=p.route_id
    ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY CASE p.status WHEN 'DELIVERED' THEN 1 WHEN 'CANCELLED' THEN 2 ELSE 0 END, p.created_at DESC LIMIT 200`, params));
}));

opsRouter.get("/pickups/:id", ah(async (req, res) => {
  const id = idParam(req);
  const p = await one<any>(`SELECT p.*, s.name AS source_name, s.lat, s.lng, s.address, s.user_id, v.code AS vehicle_code, v.lat AS vehicle_lat, v.lng AS vehicle_lng,
      sh.code AS shipment_code FROM pickup_requests p JOIN waste_sources s ON s.id=p.source_id LEFT JOIN vehicles v ON v.id=p.vehicle_id LEFT JOIN shipments sh ON sh.id=p.shipment_id WHERE p.id=$1`, [id]);
  if (!p) throw notFound("Pickup");
  if (req.user!.role === "generator" && p.user_id !== req.user!.id) throw new HttpError(403, "Not your pickup");
  const route = p.route_id ? await P.getRoute(p.route_id) : null;
  const timeline = await query(`SELECT * FROM events WHERE (payload->>'pickup_id')::int=$1 OR (payload->>'route_id')::int=$2 OR (payload->>'shipment_id')::int=$3 ORDER BY id`, [id, p.route_id ?? -1, p.shipment_id ?? -1]);
  res.json({ pickup: p, route, timeline });
}));

const PickupSchema = z.object({
  source_id: z.number().int().positive(),
  quantity_kg: z.number().positive().max(50_000),
  urgency: z.enum(["low", "normal", "high", "critical"]).default("normal"),
  window_start: z.string().datetime({ offset: true }).optional(),
  window_end: z.string().datetime({ offset: true }).optional(),
  notes: z.string().max(500).optional(),
});

/** Quote before confirming: suggested vehicle/route/cost/CO2 via a dry-run optimisation. */
opsRouter.post("/pickups/quote", requireRole("generator", "fleet", "admin"), ah(async (req, res) => {
  const b = parse(PickupSchema, req.body);
  const src = await one<any>("SELECT * FROM waste_sources WHERE id=$1", [b.source_id]);
  if (!src) throw notFound("Waste source");
  const hub = await P.nearestHub(src);
  const veh = await one<any>("SELECT * FROM vehicles WHERE hub_id=$1 AND capacity_kg >= $2 ORDER BY (status='idle') DESC, capacity_kg LIMIT 1", [hub.id, b.quantity_kg]);
  const open = await query<any>(`SELECT p.id, s.name, s.lat, s.lng FROM pickup_requests p JOIN waste_sources s ON s.id=p.source_id WHERE p.status='REQUESTED' AND p.source_id<>$1`, [src.id]);
  // Open requests within 6 km are consolidation candidates for the same truck.
  const nearby = open.filter((o: any) => o.lat != null && geo.roadKm(src, o) < 6).slice(0, 3);
  const km = geo.roadKm(src, hub) * 2;
  const share = Math.min(1, b.quantity_kg / 9000);
  res.json({
    source: { id: src.id, name: src.name, address: src.address, lat: src.lat, lng: src.lng, waste_type: src.waste_type },
    hub: { id: hub.id, code: hub.code, name: hub.name },
    suggested_vehicle: veh ? { id: veh.id, code: veh.code, type: veh.type, capacity_kg: veh.capacity_kg, status: veh.status } : null,
    suggested_route: [src.name, ...nearby.map((n) => n.name), hub.name],
    consolidation_candidates: nearby.length,
    estimated_cost_inr: geo.round(geo.transportCost(km) * share + 150, 0),
    estimated_co2_kg: geo.round(geo.transportCo2(km) * share, 1),
    standalone_cost_inr: geo.round(geo.transportCost(km), 0),
    round_trip_km: geo.round(km, 1),
    note: "Final route is decided by the OR-Tools VRP when the fleet operator runs optimisation; the quote assumes consolidation on a shared 2.5 t truck.",
  });
}));

opsRouter.post("/pickups", requireRole("generator", "fleet", "admin"), ah(async (req, res) => {
  const b = parse(PickupSchema, req.body);
  const p = await P.createPickup(b, req.user!);
  await audit(req, "pickup.create", "pickup", p.id);
  res.status(201).json(p);
}));

opsRouter.post("/pickups/:id/assign", requireRole("fleet", "admin"), ah(async (req, res) => {
  const id = idParam(req);
  const b = parse(z.object({ vehicle_id: z.number().int().optional() }), req.body ?? {});
  const p = await one<any>("SELECT * FROM pickup_requests WHERE id=$1", [id]);
  if (!p) throw notFound("Pickup");
  if (p.status !== "REQUESTED") throw new HttpError(409, `Pickup is ${p.status}`);
  const result = await P.optimizeCollection({ pickup_ids: [id], vehicle_ids: b.vehicle_id ? [b.vehicle_id] : undefined });
  await audit(req, "pickup.assign", "pickup", id, { vehicle_id: b.vehicle_id });
  res.json(result);
}));

opsRouter.post("/pickups/:id/status", requireRole("fleet", "admin"), ah(async (req, res) => {
  const id = idParam(req);
  const b = parse(z.object({ status: z.enum(["EN_ROUTE", "COLLECTED", "CANCELLED"]) }), req.body);
  const p = await one<any>("SELECT * FROM pickup_requests WHERE id=$1", [id]);
  if (!p) throw notFound("Pickup");
  if (b.status === "COLLECTED" && p.route_id) {
    const stop = await one<any>("SELECT seq FROM route_stops WHERE route_id=$1 AND stop_type='pickup' AND ref_id=$2", [p.route_id, id]);
    if (stop) await P.markStopReached(p.route_id, stop.seq);
  } else {
    await update("pickup_requests", id, { status: b.status, updated_at: new Date() });
  }
  await audit(req, "pickup.status", "pickup", id, b);
  res.json(await one("SELECT * FROM pickup_requests WHERE id=$1", [id]));
}));

opsRouter.post("/pickups/:id/complete", requireRole("fleet", "admin"), ah(async (req, res) => {
  const id = idParam(req);
  const p = await one<any>("SELECT * FROM pickup_requests WHERE id=$1", [id]);
  if (!p) throw notFound("Pickup");
  if (!p.route_id) throw new HttpError(409, "Pickup is not on a route yet");
  const out = await P.completeRoute(p.route_id);
  await audit(req, "pickup.complete", "pickup", id);
  res.json(out);
}));

// ------------------------------------------------------------------ routes
opsRouter.get("/routes", ah(async (req, res) => {
  const { status } = req.query as Record<string, string | undefined>;
  const rows = await query<any>(`SELECT r.*, v.code AS vehicle_code, v.capacity_kg, v.current_load_kg,
      (SELECT COUNT(*)::int FROM route_stops s WHERE s.route_id=r.id AND s.stop_type='pickup') AS pickups
    FROM routes r LEFT JOIN vehicles v ON v.id=r.vehicle_id ${status ? "WHERE r.status = ANY($1::text[])" : ""} ORDER BY r.created_at DESC LIMIT 100`, status ? [status.split(",")] : []);
  const stops = rows.length ? await query<any>("SELECT * FROM route_stops WHERE route_id = ANY($1::int[]) ORDER BY route_id, seq", [rows.map((r) => r.id)]) : [];
  res.json(rows.map((r) => ({ ...r, stops: stops.filter((s) => s.route_id === r.id) })));
}));

opsRouter.get("/routes/:id", ah(async (req, res) => res.json(await P.getRoute(idParam(req)))));

opsRouter.post("/routes/optimize", requireRole("fleet", "admin"), ah(async (req, res) => {
  const b = parse(z.object({ hub_id: z.number().int().optional(), pickup_ids: z.array(z.number().int()).max(100).optional(), vehicle_ids: z.array(z.number().int()).max(20).optional(), dry_run: z.boolean().optional() }), req.body ?? {});
  const out = await P.optimizeCollection(b);
  if (!b.dry_run) await audit(req, "routes.optimize", "hub", b.hub_id ?? null as any, { pickups: b.pickup_ids });
  res.json(out);
}));

opsRouter.post("/routes/:id/start", requireRole("fleet", "admin"), ah(async (req, res) => {
  const id = idParam(req);
  await audit(req, "route.start", "route", id);
  res.json(await P.startRoute(id));
}));

opsRouter.post("/routes/:id/complete", requireRole("fleet", "hub", "admin"), ah(async (req, res) => {
  const id = idParam(req);
  await audit(req, "route.complete", "route", id);
  res.json(await P.completeRoute(id));
}));

/** Re-solve a planned route's pickups (e.g. after a new request or traffic change). */
opsRouter.post("/routes/:id/recalculate", requireRole("fleet", "admin"), ah(async (req, res) => {
  const id = idParam(req);
  const route = await P.getRoute(id);
  if (route.status !== "planned") throw new HttpError(409, "Only planned routes can be recalculated");
  const pickupIds = route.stops.filter((s: any) => s.stop_type === "pickup").map((s: any) => s.ref_id);
  const hubStop = route.stops.find((s: any) => s.stop_type === "depot");
  await query("UPDATE pickup_requests SET status='REQUESTED', route_id=NULL, vehicle_id=NULL WHERE route_id=$1", [id]);
  await query("UPDATE vehicles SET status='idle', active_route_id=NULL WHERE id=$1", [route.vehicle_id]);
  await query("UPDATE routes SET status='cancelled' WHERE id=$1", [id]);
  // Include any new open requests near the same hub.
  const out = await P.optimizeCollection({ hub_id: hubStop?.ref_id });
  await audit(req, "route.recalculate", "route", id, { previous_pickups: pickupIds });
  res.json(out);
}));

// ------------------------------------------------------------------ processing hub
opsRouter.get("/hub/shipments", ah(async (req, res) => {
  const { status, hub_id } = req.query as Record<string, string | undefined>;
  const params: unknown[] = [];
  const where: string[] = [];
  const hubId = hub_id ? Number(hub_id) : req.user!.role === "hub" ? req.user!.hub_id : null;
  if (hubId) { params.push(hubId); where.push(`s.hub_id=$${params.length}`); }
  if (status) { params.push(status.split(",")); where.push(`s.status = ANY($${params.length}::text[])`); }
  else where.push(`(s.status <> 'processed' OR s.arrived_at > now() - interval '2 days')`);
  res.json(await query(`SELECT s.*, h.code AS hub_code, h.name AS hub_name,
      (SELECT row_to_json(c) FROM (SELECT id, confidence, status, composition, corrected FROM waste_classifications WHERE shipment_id=s.id ORDER BY id DESC LIMIT 1) c) AS classification,
      (SELECT COUNT(*)::int FROM ai_decisions d WHERE d.shipment_id=s.id) AS decisions
    FROM shipments s JOIN processing_hubs h ON h.id=s.hub_id ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY CASE s.status WHEN 'awaiting_classification' THEN 0 WHEN 'classified' THEN 1 WHEN 'in_transit' THEN 2 WHEN 'dispatched' THEN 3 ELSE 4 END, s.arrived_at DESC NULLS LAST LIMIT 100`, params));
}));

opsRouter.get("/hub/shipments/:id", ah(async (req, res) => {
  const id = idParam(req);
  const sh = await one<any>("SELECT s.*, h.code AS hub_code, h.name AS hub_name, h.lat, h.lng FROM shipments s JOIN processing_hubs h ON h.id=s.hub_id WHERE s.id=$1", [id]);
  if (!sh) throw notFound("Shipment");
  const classifications = await query("SELECT * FROM waste_classifications WHERE shipment_id=$1 ORDER BY id DESC", [id]);
  const compositions = await query("SELECT * FROM waste_compositions WHERE shipment_id=$1 ORDER BY id", [id]);
  const decisions = await query("SELECT * FROM ai_decisions WHERE shipment_id=$1 ORDER BY id", [id]);
  const predictions = await query(`SELECT p.*, f.label AS facility_label, f.name AS facility_name, o.actual_kwh, o.id AS output_id FROM energy_predictions p
      LEFT JOIN facilities f ON f.id=p.facility_id LEFT JOIN energy_outputs o ON o.prediction_id=p.id WHERE p.shipment_id=$1 ORDER BY p.id`, [id]);
  const feedback = await query("SELECT * FROM feedback_records WHERE shipment_id=$1 ORDER BY id", [id]);
  res.json({ shipment: sh, classifications, compositions, decisions, predictions, feedback });
}));

opsRouter.post("/hub/shipments/:id/weigh", requireRole("hub", "admin"), ah(async (req, res) => {
  const id = idParam(req);
  const b = parse(z.object({ measured_kg: z.number().positive().max(100_000), moisture_pct: z.number().min(0).max(100).optional() }), req.body);
  const sh = await one<any>("SELECT * FROM shipments WHERE id=$1", [id]);
  if (!sh) throw notFound("Shipment");
  const patch: any = { measured_kg: b.measured_kg, moisture_pct: b.moisture_pct };
  if (sh.status === "in_transit") { patch.status = "awaiting_classification"; patch.arrived_at = new Date(); }
  const out = await update("shipments", id, patch);
  await audit(req, "shipment.weigh", "shipment", id, b);
  if (sh.status === "in_transit") await publish("WasteArrivedAtHub", `${sh.code} received: ${b.measured_kg} kg recorded on weighbridge`, { shipment_id: id });
  res.json(out);
}));

opsRouter.post("/hub/classifications/:id/review", requireRole("hub", "admin"), ah(async (req, res) => {
  const id = idParam(req);
  const b = parse(z.object({ action: z.enum(["confirm", "edit", "reject"]), corrected: z.record(z.string(), z.number().min(0).max(1)).optional() }), req.body);
  const out = await P.reviewClassification(id, b.action, b.corrected, req.user!);
  await audit(req, `classification.${b.action}`, "classification", id, b.corrected);
  res.json(out);
}));
