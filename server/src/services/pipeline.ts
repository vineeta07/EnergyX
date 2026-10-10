/**
 * The WattCycle closed loop, as explicit state transitions:
 *
 *  WASTE NETWORK → COLLECTION OPTIMIZATION → PROCESSING HUB → AI CHARACTERIZATION
 *  → ENERGY PREDICTION → FACILITY OPTIMIZATION → ROUTE → CONVERSION → ACTUAL OUTPUT
 *  → FEEDBACK → MODEL IMPROVEMENT
 *
 * Every function here is called by the REST API (real user actions) and by the
 * demo orchestrator — there is no separate "fake" code path for the demo.
 */
import { query, one, insert, update } from "../database/db.ts";
import { ai } from "./aiClient.ts";
import { publish } from "./events.ts";
import { raiseAlert } from "./alerts.ts";
import { getSetting, nextCode } from "./settings.ts";
import { HttpError, notFound } from "../middleware/http.ts";
import type { AuthUser } from "../middleware/auth.ts";
import { roadKm, transportCost, transportCo2, round, ROAD_FACTOR, AVG_SPEED_KMH, DIESEL_KG_CO2_PER_L, DIESEL_INR_PER_L } from "../utils/geo.ts";
import { simulateEnergy, rng, STREAMS, type Stream } from "../database/simulator.ts";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.ts";
import { DEFAULT_WEIGHTS } from "../database/seed.ts";

const STREAM_LABEL: Record<string, string> = { organic: "Organic", plastic: "Plastic", paper: "Paper", metal: "Metal", other: "Other / residual" };
const ENERGY_STREAMS: Stream[] = ["organic", "plastic"];

/** Per-stream moisture after hub sorting: wet organics concentrate moisture; dry fractions
 *  carry only surface moisture (~quarter of the load average, 5–30%). */
function streamMoisture(stream: string, loadMoisture: number | null | undefined) {
  if (stream === "organic") return Math.min(92, (loadMoisture ?? 72) + 6);
  return Math.min(30, Math.max(5, (loadMoisture ?? 40) * 0.25));
}

// ---------------------------------------------------------------- 1. DISCOVER / REQUEST
export async function createPickup(input: { source_id: number; quantity_kg: number; urgency?: string; window_start?: string; window_end?: string; notes?: string }, user?: AuthUser) {
  const src = await one<any>("SELECT * FROM waste_sources WHERE id=$1", [input.source_id]);
  if (!src) throw notFound("Waste source");
  if (user?.role === "generator" && src.user_id !== user.id) throw new HttpError(403, "You can only request pickups for your own sources");
  const hub = await nearestHub(src);
  const km = roadKm(src, hub) * 2;
  // Marginal cost when consolidated into a shared route (share of a 2.5 t truck)
  const share = Math.min(1, input.quantity_kg / 2500);
  const pickup = await insert<any>("pickup_requests", {
    code: await nextCode("pickup_requests", "PU", 2000),
    source_id: src.id, requested_by: user?.id ?? null, quantity_kg: input.quantity_kg, waste_type: src.waste_type,
    urgency: input.urgency ?? "normal", status: "REQUESTED",
    window_start: input.window_start ? new Date(input.window_start) : new Date(Date.now() + 3600_000),
    window_end: input.window_end ? new Date(input.window_end) : new Date(Date.now() + 6 * 3600_000),
    estimated_cost: round(transportCost(km) * share + 150, 0), estimated_co2: round(transportCo2(km) * share, 1), notes: input.notes ?? null,
  });
  await publish("WastePickupRequested", `${round(input.quantity_kg, 0)} kg pickup requested by ${src.name}`, { pickup_id: pickup.id, source_id: src.id });
  return { ...pickup, source_name: src.name, suggested_hub: hub.code, round_trip_km: round(km, 1) };
}

export async function nearestHub(p: { lat: number; lng: number }) {
  const hubs = await query<any>("SELECT * FROM processing_hubs WHERE status='online'");
  return hubs.sort((a, b) => roadKm(p, a) - roadKm(p, b))[0];
}

// ---------------------------------------------------------------- 2. COLLECTION OPTIMIZATION (OR-Tools in AI service)
export async function optimizeCollection(opts: { hub_id?: number; pickup_ids?: number[]; vehicle_ids?: number[]; dry_run?: boolean }) {
  let pickups = await query<any>(
    `SELECT p.*, s.name AS source_name, s.lat, s.lng FROM pickup_requests p JOIN waste_sources s ON s.id=p.source_id
     WHERE p.status='REQUESTED' ${opts.pickup_ids?.length ? `AND p.id = ANY($1::int[])` : ""} ORDER BY p.created_at`,
    opts.pickup_ids?.length ? [opts.pickup_ids] : [],
  );
  if (!pickups.length) throw new HttpError(409, "No open pickup requests to optimize");
  const hub = opts.hub_id
    ? await one<any>("SELECT * FROM processing_hubs WHERE id=$1", [opts.hub_id])
    : await nearestHub(pickups[0]);
  if (!hub) throw notFound("Hub");
  if (!opts.pickup_ids?.length) {
    // Only pickups whose nearest hub is this one
    const hubs = await query<any>("SELECT * FROM processing_hubs WHERE status='online'");
    pickups = pickups.filter((p) => hubs.sort((a, b) => roadKm(p, a) - roadKm(p, b))[0].id === hub.id);
  }
  if (!pickups.length) throw new HttpError(409, `No open pickups near ${hub.name}`);
  const vehicles = await query<any>(
    `SELECT * FROM vehicles WHERE status='idle' ${opts.vehicle_ids?.length ? "AND id = ANY($1::int[])" : "AND hub_id=$1"} ORDER BY capacity_kg`,
    [opts.vehicle_ids?.length ? opts.vehicle_ids : hub.id],
  );
  if (!vehicles.length) throw new HttpError(409, "No idle vehicles available at this hub");

  if (!opts.dry_run) await publish("CollectionOptimizationStarted", `Optimizing ${pickups.length} pickups across ${vehicles.length} vehicles at ${hub.code}`, { hub_id: hub.id });
  const now = Date.now();
  const result = await ai.optimizeRoutes({
    depot: { id: hub.id, name: hub.name, lat: hub.lat, lng: hub.lng },
    vehicles: vehicles.map((v) => ({ id: v.id, code: v.code, capacity_kg: v.capacity_kg, current_load_kg: v.current_load_kg, fuel_l_per_km: v.fuel_l_per_km })),
    stops: pickups.map((p) => ({
      id: p.id, name: p.source_name, lat: p.lat, lng: p.lng, demand_kg: p.quantity_kg, urgency: p.urgency,
      window_start_min: p.window_start ? Math.max(0, (new Date(p.window_start).getTime() - now) / 60_000) : 0,
      window_end_min: p.window_end ? Math.max(30, (new Date(p.window_end).getTime() - now) / 60_000) : 600,
    })),
    road_factor: ROAD_FACTOR, speed_kmh: AVG_SPEED_KMH,
  });
  if (opts.dry_run) return { hub, ...result };

  const created: any[] = [];
  for (const r of result.routes) {
    if (!r.stop_ids.length) continue;
    const v = vehicles.find((x) => x.id === r.vehicle_id);
    const fuel = r.total_km * (v.fuel_l_per_km || 0);
    const route = await insert<any>("routes", {
      code: await nextCode("routes", "R", 5000), vehicle_id: v.id, kind: "collection", status: "planned",
      total_km: round(r.total_km, 2), baseline_km: round(r.baseline_km, 2), duration_min: round(r.duration_min, 0),
      fuel_l: round(fuel, 2), co2_kg: round(v.fuel_l_per_km ? fuel * DIESEL_KG_CO2_PER_L : r.total_km * 0.09, 2),
      cost_inr: round(fuel * DIESEL_INR_PER_L + r.duration_min * 6, 0), opt_score: r.opt_score, solver: result.solver, explanation: r.explanation,
    });
    let seq = 0;
    await insert("route_stops", { route_id: route.id, seq: seq++, stop_type: "depot", ref_id: hub.id, name: hub.name, lat: hub.lat, lng: hub.lng, eta_min: 0 });
    let load = 0;
    for (const [i, pid] of r.stop_ids.entries()) {
      const p = pickups.find((x) => x.id === pid);
      load += p.quantity_kg;
      await insert("route_stops", { route_id: route.id, seq: seq++, stop_type: "pickup", ref_id: p.id, name: p.source_name, lat: p.lat, lng: p.lng, load_kg: load, eta_min: r.etas_min?.[i] ?? null });
      await update("pickup_requests", p.id, { status: "ASSIGNED", vehicle_id: v.id, route_id: route.id, updated_at: new Date() });
    }
    await insert("route_stops", { route_id: route.id, seq: seq++, stop_type: "hub", ref_id: hub.id, name: hub.name, lat: hub.lat, lng: hub.lng, load_kg: load, eta_min: r.duration_min });
    await update("vehicles", v.id, { status: "assigned", active_route_id: route.id });
    created.push(route);
    await publish("RouteOptimized", `${v.code}: ${r.stop_ids.length} pickups consolidated, ${round(r.total_km, 1)} km (${r.savings_pct}% shorter than individual trips)`, { route_id: route.id, vehicle_id: v.id });
    await publish("PickupAssigned", `${r.stop_ids.length} pickups assigned to ${v.code}`, { route_id: route.id });
  }
  return { hub, solver: result.solver, routes: await Promise.all(created.map((c) => getRoute(c.id))), unassigned: result.unassigned };
}

export async function getRoute(id: number) {
  const route = await one<any>(
    `SELECT r.*, v.code AS vehicle_code, v.capacity_kg, v.current_load_kg, v.type AS vehicle_type, v.lat AS vehicle_lat, v.lng AS vehicle_lng
     FROM routes r LEFT JOIN vehicles v ON v.id=r.vehicle_id WHERE r.id=$1`, [id]);
  if (!route) throw notFound("Route");
  const stops = await query<any>("SELECT * FROM route_stops WHERE route_id=$1 ORDER BY seq", [id]);
  return { ...route, stops };
}

export async function startRoute(routeId: number) {
  const route = await getRoute(routeId);
  if (route.status !== "planned") throw new HttpError(409, `Route is ${route.status}`);
  await update("routes", routeId, { status: "active", progress: 0 });
  await update("vehicles", route.vehicle_id, { status: "en_route" });
  if (route.kind === "collection") {
    await query("UPDATE pickup_requests SET status='EN_ROUTE', updated_at=now() WHERE route_id=$1 AND status='ASSIGNED'", [routeId]);
  }
  await publish("VehicleEnRoute", `${route.vehicle_code} departed on ${route.code} (${route.kind})`, { route_id: routeId });
  return getRoute(routeId);
}

/** Called by the fleet simulator (or a driver app) when a vehicle reaches a pickup stop. */
export async function markStopReached(routeId: number, stopSeq: number) {
  const stop = await one<any>("UPDATE route_stops SET status='done' WHERE route_id=$1 AND seq=$2 AND status<>'done' RETURNING *", [routeId, stopSeq]);
  if (!stop || stop.stop_type !== "pickup") return;
  const p = await one<any>("UPDATE pickup_requests SET status='COLLECTED', updated_at=now() WHERE id=$1 RETURNING *", [stop.ref_id]);
  const route = await one<any>("SELECT vehicle_id, code FROM routes WHERE id=$1", [routeId]);
  if (route) await query("UPDATE vehicles SET current_load_kg = current_load_kg + $2 WHERE id=$1", [route.vehicle_id, p?.quantity_kg ?? 0]);
  if (p) await publish("WasteCollected", `${round(p.quantity_kg, 0)} kg collected from ${stop.name}`, { pickup_id: p.id, route_id: routeId });
}

/** Vehicle reached the hub (collection) or the facility (dispatch). */
export async function completeRoute(routeId: number, opts: { exact_weight?: boolean } = {}) {
  const route = await getRoute(routeId);
  if (route.status === "completed") return { route };
  for (const s of route.stops) if (s.stop_type === "pickup" && s.status !== "done") await markStopReached(routeId, s.seq);
  await update("routes", routeId, { status: "completed", progress: 1, completed_at: new Date() });
  const end = route.stops[route.stops.length - 1];
  await update("vehicles", route.vehicle_id, { status: "idle", active_route_id: null, current_load_kg: 0, lat: end.lat, lng: end.lng });

  if (route.kind === "dispatch") {
    await publish("WasteDispatched", `${route.vehicle_code} delivered load to ${end.name}`, { route_id: routeId });
    return { route: await getRoute(routeId) };
  }
  // Collection → consolidate into a hub shipment, weigh it, record generation data.
  const pickups = await query<any>(
    `SELECT p.*, s.name AS source_name, s.business_type FROM pickup_requests p JOIN waste_sources s ON s.id=p.source_id WHERE p.route_id=$1`, [routeId]);
  const mix = pickups.map((p) => ({ source_id: p.source_id, name: p.source_name, business_type: p.business_type, kg: p.quantity_kg }));
  const total = mix.reduce((a, m) => a + m.kg, 0);
  const r = rng(routeId * 7919);
  const measured = opts.exact_weight ? total : round(total * (1 + (r() - 0.5) * 0.04), 0); // weighbridge reading (simulated)
  const shipment = await insert<any>("shipments", {
    code: await nextCode("shipments", "WC", 1040), hub_id: end.ref_id, route_id: routeId,
    source_label: mix.map((m) => m.name).join(" + "), total_kg: total, measured_kg: measured,
    category: "Mixed organic", status: "awaiting_classification", source_mix: mix, arrived_at: new Date(), is_simulated: true,
  });
  for (const p of pickups) {
    await update("pickup_requests", p.id, { status: "DELIVERED", shipment_id: shipment.id, updated_at: new Date() });
    await insert("waste_records", { source_id: p.source_id, pickup_id: p.id, record_date: new Date().toISOString().slice(0, 10), quantity_kg: p.quantity_kg, waste_type: p.waste_type, is_simulated: true });
  }
  await query("UPDATE processing_hubs SET current_load_kg = current_load_kg + $2 WHERE id=$1", [end.ref_id, measured]);
  await publish("WasteArrivedAtHub", `${shipment.code} arrived at ${end.name}: ${round(measured, 0)} kg on weighbridge`, { shipment_id: shipment.id, hub_id: end.ref_id });
  return { route: await getRoute(routeId), shipment };
}

// ---------------------------------------------------------------- 3. AI CHARACTERIZATION
/** Read uploaded sample-audit photos (local disk; S3 GetObject in AWS mode) as base64 for the AI service. */
function loadImages(keys: string[]) {
  return keys.map((k) => {
    if (!/^uploads\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(k)) throw new HttpError(400, `Bad image key ${k}`);
    const file = path.join(config.uploadDir, k.replace(/\//g, path.sep));
    if (!fs.existsSync(file)) throw new HttpError(404, `Image not found: ${k}`);
    return fs.readFileSync(file).toString("base64");
  });
}

export async function classifyShipment(shipmentId: number, imageKeys: string[] = []) {
  const sh = await one<any>("SELECT * FROM shipments WHERE id=$1", [shipmentId]);
  if (!sh) throw notFound("Shipment");
  if (sh.status === "in_transit") throw new HttpError(409, "Shipment has not arrived at the hub yet");
  const kg = sh.measured_kg ?? sh.total_kg;
  const res = await ai.classify({
    total_kg: kg, month: new Date(sh.arrived_at ?? Date.now()).getMonth() + 1, moisture_pct: sh.moisture_pct,
    source_mix: sh.source_mix, images: loadImages(imageKeys),
  });
  const cls = await insert<any>("waste_classifications", {
    shipment_id: sh.id, model_version: res.model_version, method: res.method, composition: res.composition,
    uncertainty: res.uncertainty, confidence: res.confidence, status: "pending_review", image_key: imageKeys.join(",") || null,
    vision: res.vision ?? null,
  });
  const moisture = res.moisture_pct ?? sh.moisture_pct;
  await update("shipments", sh.id, { status: "classified", moisture_pct: moisture, category: res.composition.organic > 0.5 ? "Mixed organic" : "Mixed dry" });
  await insert("waste_compositions", { shipment_id: sh.id, ...res.composition, moisture_pct: moisture, origin: "ai" });
  const top = Object.entries(res.composition as Record<string, number>).sort((a, b) => b[1] - a[1])[0];
  await publish("WasteClassificationCompleted", `${sh.code} classified: ${Math.round(top[1] * 100)}% ${top[0]} (confidence ${(res.confidence * 100).toFixed(1)}%)`, { shipment_id: sh.id, classification_id: cls.id });
  if (res.confidence < 0.8) {
    await raiseAlert({ severity: "warning", type: "low_classification_confidence", title: "Low classification confidence", message: `${sh.code} classified at ${(res.confidence * 100).toFixed(0)}% confidence — operator review required before dispatch.`, entity_type: "shipment", entity_id: sh.id });
  }
  return { classification: cls, ...res, shipment: { ...sh, moisture_pct: moisture } };
}

export async function reviewClassification(id: number, action: "confirm" | "edit" | "reject", corrected: Record<string, number> | undefined, user: AuthUser) {
  const cls = await one<any>("SELECT * FROM waste_classifications WHERE id=$1", [id]);
  if (!cls) throw notFound("Classification");
  if (action === "edit") {
    if (!corrected) throw new HttpError(400, "Corrected composition required");
    const sum = STREAMS.reduce((a, s) => a + (corrected[s] ?? 0), 0);
    if (Math.abs(sum - 1) > 0.02) throw new HttpError(400, `Composition must sum to 100% (got ${(sum * 100).toFixed(1)}%)`);
    const norm = Object.fromEntries(STREAMS.map((s) => [s, round((corrected[s] ?? 0) / sum, 4)]));
    await update("waste_classifications", id, { status: "corrected", corrected: norm, operator_id: user.id, reviewed_at: new Date() });
    await insert("waste_compositions", { shipment_id: cls.shipment_id, ...norm, origin: "operator" });
    await insert("feedback_records", { kind: "classification", classification_id: id, shipment_id: cls.shipment_id, ai_label: cls.composition, human_label: norm });
    await publish("ClassificationReviewed", `Operator corrected classification #${id} — stored as labeled training data`, { classification_id: id });
    await publish("AITrainingDataCreated", `Human correction added to classifier training set`, { classification_id: id, kind: "classification" });
  } else if (action === "confirm") {
    await update("waste_classifications", id, { status: "confirmed", operator_id: user.id, reviewed_at: new Date() });
    await insert("feedback_records", { kind: "classification", classification_id: id, shipment_id: cls.shipment_id, ai_label: cls.composition, human_label: cls.composition });
    await publish("ClassificationReviewed", `Operator confirmed classification #${id}`, { classification_id: id });
  } else {
    await update("waste_classifications", id, { status: "rejected", operator_id: user.id, reviewed_at: new Date() });
    await update("shipments", cls.shipment_id, { status: "awaiting_classification" });
    await publish("ClassificationReviewed", `Operator rejected classification #${id}; shipment returned to queue`, { classification_id: id });
  }
  return one("SELECT * FROM waste_classifications WHERE id=$1", [id]);
}

export async function effectiveComposition(shipmentId: number) {
  const cls = await one<any>("SELECT * FROM waste_classifications WHERE shipment_id=$1 AND status<>'rejected' ORDER BY id DESC LIMIT 1", [shipmentId]);
  if (!cls) return null;
  return { classification: cls, composition: (cls.corrected ?? cls.composition) as Record<Stream, number> };
}

// ---------------------------------------------------------------- 4/5. ENERGY PREDICTION + FACILITY OPTIMIZATION
export async function facilityCandidates(origin: { lat: number; lng: number }, stream: string) {
  const rows = await query<any>(
    `SELECT f.*, c.compatibility_pct, c.max_moisture_pct,
       (SELECT COUNT(*)::int FROM energy_outputs e WHERE e.facility_id=f.id AND e.stream=c.stream) AS n_history,
       (SELECT SUM(e.actual_kwh)/NULLIF(SUM(e.input_kg),0) FROM energy_outputs e WHERE e.facility_id=f.id AND e.stream=c.stream) AS hist_yield
     FROM facilities f JOIN facility_capabilities c ON c.facility_id=f.id AND c.stream=$1 ORDER BY f.code`, [stream]);
  return rows.map((f) => {
    const km = roadKm(origin, f);
    return {
      id: f.id, code: f.code, label: f.label, name: f.name, technology: f.technology, lat: f.lat, lng: f.lng,
      efficiency_pct: f.efficiency_pct, utilization_pct: f.utilization_pct, capacity_tpd: f.capacity_tpd,
      compatibility_pct: f.compatibility_pct, max_moisture_pct: f.max_moisture_pct, carbon_intensity: f.carbon_intensity,
      gate_fee_inr_per_t: f.gate_fee_inr_per_t, status: f.status, n_history: f.n_history,
      historical_yield_kwh_per_kg: f.hist_yield != null ? round(f.hist_yield, 4) : null,
      distance_km: round(km, 1), transport_cost_inr: round(transportCost(km), 0), transport_co2_kg: round(transportCo2(km), 1),
    };
  });
}

export async function predictPathways(shipmentId: number) {
  const sh = await one<any>("SELECT s.*, h.lat, h.lng, h.name AS hub_name FROM shipments s JOIN processing_hubs h ON h.id=s.hub_id WHERE s.id=$1", [shipmentId]);
  if (!sh) throw notFound("Shipment");
  const eff = await effectiveComposition(shipmentId);
  if (!eff) throw new HttpError(409, "Shipment must be classified first");
  const kg = sh.measured_kg ?? sh.total_kg;
  const facilities = await query<any>("SELECT technology, COUNT(*)::int AS n FROM facilities WHERE status='online' GROUP BY technology");
  const out: any[] = [];
  for (const stream of STREAMS) {
    const skg = kg * (eff.composition[stream] ?? 0);
    if (skg < 1) continue;
    const res = await ai.predictEnergy({
      stream, kg: round(skg, 1), moisture_pct: sh.moisture_pct, month: new Date().getMonth() + 1,
      available_technologies: facilities.map((f) => f.technology),
    });
    out.push(res);
  }
  await publish("EnergyPotentialCalculated", `${sh.code}: energy pathways evaluated for ${out.length} streams`, { shipment_id: sh.id });
  return { shipment: sh, composition: eff.composition, classification_id: eff.classification.id, streams: out };
}

/** Rank every eligible facility for each energy stream and record an explainable AI decision. */
export async function optimizeDestination(shipmentId: number) {
  const sh = await one<any>("SELECT s.*, h.lat, h.lng, h.name AS hub_name, h.code AS hub_code FROM shipments s JOIN processing_hubs h ON h.id=s.hub_id WHERE s.id=$1", [shipmentId]);
  if (!sh) throw notFound("Shipment");
  const eff = await effectiveComposition(shipmentId);
  if (!eff) throw new HttpError(409, "Shipment must be classified first");
  const existing = await query<any>("SELECT * FROM ai_decisions WHERE shipment_id=$1 ORDER BY id", [shipmentId]);
  if (existing.length) return { shipment: sh, decisions: existing };

  const weights = await getSetting("optimizer_weights", DEFAULT_WEIGHTS);
  const kg = sh.measured_kg ?? sh.total_kg;
  const decisions: any[] = [];
  for (const stream of STREAMS) {
    const skg = round(kg * (eff.composition[stream] ?? 0), 1);
    if (skg < 5) continue;
    if (!ENERGY_STREAMS.includes(stream)) {
      // Material streams: pathway decision (recycling / material recovery / residual), no energy model involved.
      const mrf = (await facilityCandidates(sh, stream)).filter((f) => f.status === "online").sort((a, b) => b.compatibility_pct - a.compatibility_pct)[0];
      const pathway = stream === "paper" ? "Recycling" : stream === "metal" ? "Material recovery" : "Residual → RDF / sanitary landfill";
      const d = await insert<any>("ai_decisions", {
        code: await nextCode("ai_decisions", "AI", 7000), kind: "pathway", shipment_id: sh.id,
        subject: `${round(skg, 0)} kg ${stream} — ${pathway}`, chosen_facility_id: mrf?.id ?? null,
        inputs: { stream, quantity_kg: skg }, output: { pathway, facility: mrf?.label ?? null, energy_kwh: 0 },
        explanation: {
          headline: `${STREAM_LABEL[stream]} routed to ${pathway.toLowerCase()}${mrf ? ` at ${mrf.label}` : ""}`,
          bullets: stream === "other"
            ? ["Low calorific value and high contamination — no positive-energy pathway", "Combined with RDF reject stream where accepted"]
            : ["Material recovery preserves more embodied energy than combustion", `${mrf?.compatibility_pct ?? "—"}% stream compatibility`, "Rule-based pathway (no ML model involved)"],
        },
        confidence: 1, score: null, status: "proposed", model_version: "rules-v1",
      });
      decisions.push(d);
      continue;
    }
    const cands = await facilityCandidates(sh, stream);
    if (!cands.length) continue;
    const moisture = streamMoisture(stream, sh.moisture_pct);
    const res = await ai.rankFacilities({
      stream, kg: skg, moisture_pct: moisture, month: new Date().getMonth() + 1,
      origin: { lat: sh.lat, lng: sh.lng, name: sh.hub_name }, facilities: cands, weights,
    });
    const chosen = res.ranking.find((x: any) => x.facility_id === res.chosen_facility_id);
    const decision = await insert<any>("ai_decisions", {
      code: await nextCode("ai_decisions", "AI", 7000), kind: "facility_selection", shipment_id: sh.id,
      subject: `${round(skg, 0)} kg ${stream} → ${chosen?.label ?? "none"}`, chosen_facility_id: res.chosen_facility_id,
      inputs: {
        stream, quantity_kg: skg, moisture_pct: moisture, origin: sh.hub_code,
        distance_km: chosen?.distance_km, facility_efficiency_pct: chosen?.efficiency_pct, capacity_utilization_pct: chosen?.utilization_pct,
        historical_yield_kwh_per_kg: chosen?.historical_yield_kwh_per_kg, transport_cost_inr: chosen?.transport_cost_inr, carbon_kg: chosen?.transport_co2_kg,
      },
      output: { facility_id: res.chosen_facility_id, facility: chosen?.label, expected_kwh: chosen?.predicted_kwh, interval: chosen?.interval, technology: chosen?.technology },
      ranking: res.ranking, explanation: res.explanation, feature_importance: { decision_drivers: res.decision_drivers, model: res.model_feature_importance },
      weights, confidence: chosen?.confidence, score: chosen?.score, status: "proposed", model_version: res.model_version,
    });
    await insert("energy_predictions", {
      shipment_id: sh.id, classification_id: eff.classification.id, facility_id: res.chosen_facility_id, stream, quantity_kg: skg,
      technology: chosen.technology, predicted_kwh: chosen.predicted_kwh, biogas_m3: chosen.biogas_m3 ?? null, heat_kwh: chosen.heat_kwh ?? null,
      interval_low: chosen.interval?.[0], interval_high: chosen.interval?.[1], confidence: chosen.confidence, model_version: res.model_version,
    });
    decisions.push(decision);
    await publish("FacilitySelected", `${chosen.label} selected for ${round(skg, 0)} kg ${stream}: ${round(chosen.predicted_kwh, 0)} kWh expected, score ${round(chosen.score, 0)}/100`, { decision_id: decision.id, shipment_id: sh.id });
  }
  return { shipment: sh, decisions };
}

/** Human approval / override of an AI destination, then dispatch. */
export async function approveDecision(decisionId: number, user: AuthUser, override?: { facility_id: number; reason: string }) {
  const d = await one<any>("SELECT * FROM ai_decisions WHERE id=$1", [decisionId]);
  if (!d) throw notFound("Decision");
  if (d.status !== "proposed") throw new HttpError(409, `Decision already ${d.status}`);
  let facilityId = d.chosen_facility_id;
  if (override && override.facility_id !== d.chosen_facility_id) {
    const alt = (d.ranking ?? []).find((x: any) => x.facility_id === override.facility_id);
    if (!alt) throw new HttpError(400, "Override facility was not among evaluated candidates");
    if (!alt.eligible) throw new HttpError(400, `Facility ineligible: ${alt.exclusion_reason}`);
    facilityId = override.facility_id;
    await update("ai_decisions", d.id, { status: "overridden", override_reason: override.reason, decided_by: user.id });
    await query("UPDATE energy_predictions SET facility_id=$1, predicted_kwh=$2, interval_low=$3, interval_high=$4, confidence=$5, technology=$6 WHERE shipment_id=$7 AND stream=$8",
      [facilityId, alt.predicted_kwh, alt.interval?.[0], alt.interval?.[1], alt.confidence, alt.technology, d.shipment_id, d.inputs.stream]);
  } else {
    await update("ai_decisions", d.id, { status: "approved", decided_by: user.id });
  }
  const fac = facilityId ? await one<any>("SELECT * FROM facilities WHERE id=$1", [facilityId]) : null;
  await publish("DestinationApproved", `${d.code} ${override ? "overridden by operator →" : "approved →"} ${fac?.label ?? "n/a"}`, { decision_id: d.id });

  let route = null;
  if (fac && d.kind === "facility_selection") route = await createDispatchRoute(d.shipment_id, fac, d.inputs.quantity_kg);
  const pending = await one<{ n: number }>("SELECT COUNT(*)::int AS n FROM ai_decisions WHERE shipment_id=$1 AND status='proposed'", [d.shipment_id]);
  if (pending?.n === 0) await update("shipments", d.shipment_id, { status: "dispatched" });
  return { decision: await one("SELECT * FROM ai_decisions WHERE id=$1", [d.id]), route };
}

async function createDispatchRoute(shipmentId: number, fac: any, kg: number) {
  const sh = await one<any>("SELECT s.*, h.lat, h.lng, h.name AS hub_name FROM shipments s JOIN processing_hubs h ON h.id=s.hub_id WHERE s.id=$1", [shipmentId]);
  const veh = (await query<any>("SELECT * FROM vehicles WHERE status='idle' AND capacity_kg >= $1 ORDER BY (hub_id = $2) DESC, capacity_kg LIMIT 1", [kg, sh.hub_id]))[0]
    ?? (await query<any>("SELECT * FROM vehicles WHERE status='idle' ORDER BY capacity_kg DESC LIMIT 1"))[0];
  if (!veh) return null;
  const km = roadKm(sh, fac);
  const fuel = km * (veh.fuel_l_per_km || 0);
  const route = await insert<any>("routes", {
    code: await nextCode("routes", "R", 5000), vehicle_id: veh.id, kind: "dispatch", status: "planned",
    total_km: round(km, 2), baseline_km: round(km, 2), duration_min: round((km / AVG_SPEED_KMH) * 60, 0), fuel_l: round(fuel, 2),
    co2_kg: round(transportCo2(km), 1), cost_inr: round(transportCost(km), 0), opt_score: null, solver: "direct",
    explanation: `Dispatch of ${round(kg, 0)} kg from ${sh.hub_name} to ${fac.label} (${fac.name}) as selected by the destination optimizer.`,
  });
  await insert("route_stops", { route_id: route.id, seq: 0, stop_type: "hub", ref_id: sh.hub_id, name: sh.hub_name, lat: sh.lat, lng: sh.lng, load_kg: kg, eta_min: 0 });
  await insert("route_stops", { route_id: route.id, seq: 1, stop_type: "facility", ref_id: fac.id, name: `${fac.label} — ${fac.name}`, lat: fac.lat, lng: fac.lng, load_kg: kg, eta_min: route.duration_min });
  await update("vehicles", veh.id, { status: "assigned", active_route_id: route.id, current_load_kg: kg, lat: sh.lat, lng: sh.lng });
  await query("UPDATE processing_hubs SET current_load_kg = GREATEST(0, current_load_kg - $2) WHERE id=$1", [sh.hub_id, kg]);
  return getRoute(route.id);
}

// ---------------------------------------------------------------- 6/7. ENERGY CONVERSION → ACTUAL OUTPUT → FEEDBACK
export async function recordOutput(input: { prediction_id?: number; facility_id?: number; shipment_id?: number; stream?: string; input_kg?: number; actual_kwh?: number; simulate?: boolean; seed?: number }) {
  let pred: any = null;
  if (input.prediction_id) {
    pred = await one<any>("SELECT * FROM energy_predictions WHERE id=$1", [input.prediction_id]);
    if (!pred) throw notFound("Prediction");
    const done = await one("SELECT id FROM energy_outputs WHERE prediction_id=$1", [pred.id]);
    if (done) throw new HttpError(409, "Output already recorded for this prediction");
  }
  const facilityId = pred?.facility_id ?? input.facility_id;
  const fac = await one<any>("SELECT * FROM facilities WHERE id=$1", [facilityId]);
  if (!fac) throw notFound("Facility");
  const stream = (pred?.stream ?? input.stream) as Stream;
  const kg = pred?.quantity_kg ?? input.input_kg;
  if (!stream || !kg) throw new HttpError(400, "stream and input_kg required when no prediction_id is given");
  const sh = pred?.shipment_id || input.shipment_id ? await one<any>("SELECT * FROM shipments WHERE id=$1", [pred?.shipment_id ?? input.shipment_id]) : null;
  const moisture = streamMoisture(stream, sh?.moisture_pct);

  let actual = input.actual_kwh;
  let source = "manual";
  if (actual == null) {
    if (!input.simulate) throw new HttpError(400, "actual_kwh required (or simulate=true in demo mode)");
    if (!fac.sim_params) throw new HttpError(400, "Facility has no simulator (real facility — report the meter reading)");
    actual = simulateEnergy({ stream, technology: fac.technology, kg, moisture: moisture / 100, sim: fac.sim_params, utilization: fac.utilization_pct / 100, r: rng(input.seed ?? Date.now()) });
    source = "meter-sim";
  }
  const potential = kg * ({ organic: 0.5, plastic: 1.9, paper: 0.9, other: 0.35, metal: 0 } as Record<string, number>)[stream];
  const out = await insert<any>("energy_outputs", {
    facility_id: fac.id, prediction_id: pred?.id ?? null, shipment_id: sh?.id ?? null, stream, input_kg: kg, moisture_pct: moisture,
    actual_kwh: round(actual, 1), efficiency_pct: potential ? round((100 * actual) / potential, 1) : null, source, is_simulated: source === "meter-sim",
  });
  await publish("EnergyGenerationCompleted", `${fac.label} processed ${round(kg, 0)} kg ${stream}`, { output_id: out.id });
  await publish("ActualOutputRecorded", `${round(actual, 0)} kWh recorded at ${fac.label}${pred ? ` (predicted ${round(pred.predicted_kwh, 0)} kWh)` : ""}`, { output_id: out.id });

  let feedback = null;
  if (pred) {
    const errPct = ((actual - pred.predicted_kwh) / pred.predicted_kwh) * 100;
    const decision = await one<any>("SELECT * FROM ai_decisions WHERE shipment_id=$1 AND inputs->>'stream'=$2 ORDER BY id DESC LIMIT 1", [pred.shipment_id, stream]);
    const chosen = decision?.ranking?.find((x: any) => x.facility_id === fac.id);
    feedback = await insert<any>("feedback_records", {
      kind: "energy", prediction_id: pred.id, decision_id: decision?.id ?? null, shipment_id: pred.shipment_id, facility_id: fac.id,
      technology: pred.technology, stream, waste_quantity_kg: kg, predicted_kwh: pred.predicted_kwh, actual_kwh: round(actual, 1),
      error_pct: round(errPct, 2), distance_km: chosen?.distance_km ?? null, transport_cost: chosen?.transport_cost_inr ?? null,
    });
    await publish("AITrainingDataCreated", `Feedback recorded: predicted ${round(pred.predicted_kwh, 0)} kWh vs actual ${round(actual, 0)} kWh (error ${errPct.toFixed(1)}%)`, { feedback_id: feedback.id });
    if (Math.abs(errPct) > 15) {
      await raiseAlert({
        severity: errPct < -25 ? "critical" : "warning", type: "energy_deviation", title: "Energy output deviation",
        message: `${fac.label} generated ${Math.abs(errPct).toFixed(0)}% ${errPct < 0 ? "less" : "more"} energy than predicted for ${round(kg, 0)} kg ${stream}.`,
        causes: errPct < 0 ? ["Lower organic content than classified", "Higher moisture", "Reduced processing efficiency"] : ["Higher volatile-solids content", "Model under-estimates this facility"],
        entity_type: "facility", entity_id: fac.id,
      });
    }
    // Is the shipment fully processed?
    const left = await one<{ n: number }>(
      "SELECT COUNT(*)::int AS n FROM energy_predictions p WHERE p.shipment_id=$1 AND NOT EXISTS (SELECT 1 FROM energy_outputs o WHERE o.prediction_id=p.id)", [pred.shipment_id]);
    if (left?.n === 0) await update("shipments", pred.shipment_id, { status: "processed" });
    await checkDrift();
  }
  return { output: out, feedback };
}

/** Model drift monitor: rolling MAPE over the last 20 live feedback records. */
export async function checkDrift() {
  const rows = await query<any>("SELECT error_pct FROM feedback_records WHERE kind='energy' ORDER BY id DESC LIMIT 20");
  if (rows.length < 8) return null;
  const mape = rows.reduce((a, r) => a + Math.abs(r.error_pct), 0) / rows.length / 100;
  const policy = await getSetting("retrain_policy", { drift_mape_threshold: 0.12 } as any);
  if (mape > policy.drift_mape_threshold) {
    await raiseAlert({ severity: "warning", type: "model_drift", title: "Model drift detected", message: `Rolling MAPE of the energy model is ${(mape * 100).toFixed(1)}% over the last ${rows.length} conversions (threshold ${(policy.drift_mape_threshold * 100).toFixed(0)}%). Retraining recommended.`, entity_type: "model", entity_id: null as any }, true);
  }
  return mape;
}

// ---------------------------------------------------------------- 8. LEARN — retraining (runs in the AI service)
export const MODEL_KEYS = ["forecast", "classifier", "energy"] as const;

export async function triggerTraining(modelKey: string, trigger: "manual" | "scheduled" | "bootstrap" | "drift") {
  const keys = modelKey === "all" ? [...MODEL_KEYS] : [modelKey];
  for (const k of keys) if (!(MODEL_KEYS as readonly string[]).includes(k)) throw new HttpError(400, `Unknown model ${k}`);
  const running = await one("SELECT id FROM training_runs WHERE status='running' AND started_at > now() - interval '10 minutes'");
  if (running) throw new HttpError(409, "A training run is already in progress");
  const runs = [];
  for (const k of keys) {
    const fb = await one<{ n: number }>("SELECT COUNT(*)::int AS n FROM feedback_records WHERE training_run_id IS NULL AND kind=$1", [k === "classifier" ? "classification" : "energy"]);
    runs.push(await insert<any>("training_runs", { model_key: k, trigger, status: "running", feedback_rows: k === "forecast" ? 0 : fb?.n ?? 0 }));
  }
  await publish("ModelRetrainingStarted", `Retraining started: ${keys.join(", ")} (${trigger})`, { runs: runs.map((r) => r.id) });
  try {
    await ai.train({ runs: runs.map((r) => ({ run_id: r.id, model_key: r.model_key })) });
  } catch (e) {
    for (const r of runs) await update("training_runs", r.id, { status: "failed", finished_at: new Date(), log: { error: String((e as Error).message) } });
    throw e;
  }
  return runs;
}

/** Callback from the AI service when a training run finishes. */
export async function completeTraining(runId: number, body: any) {
  const run = await one<any>("SELECT * FROM training_runs WHERE id=$1", [runId]);
  if (!run) throw notFound("Training run");
  if (body.status === "failed") {
    await update("training_runs", runId, { status: "failed", finished_at: new Date(), log: body.log ?? null });
    return;
  }
  await query("UPDATE model_versions SET status='archived' WHERE model_key=$1 AND status='active'", [run.model_key]);
  const mv = await insert<any>("model_versions", {
    model_key: run.model_key, version: body.version, algorithm: body.algorithm, dataset_size: body.dataset_size,
    metrics: body.metrics, params: body.params ?? null, status: "active", artifact_uri: body.artifact_uri,
  });
  await update("training_runs", runId, { status: "completed", model_version_id: mv.id, dataset_size: body.dataset_size, metrics: body.metrics, log: body.log ?? null, finished_at: new Date() });
  const kind = run.model_key === "classifier" ? "classification" : run.model_key === "energy" ? "energy" : null;
  if (kind) await query("UPDATE feedback_records SET training_run_id=$1 WHERE training_run_id IS NULL AND kind=$2 AND id <= $3", [runId, kind, body.max_feedback_id ?? 2147483647]);

  // Time-based holdout backtest → historical predicted-vs-actual, clearly labelled as backtest.
  if (run.model_key === "energy" && Array.isArray(body.backtest) && body.backtest.length) {
    for (const b of body.backtest) {
      const o = await one<any>("SELECT * FROM energy_outputs WHERE id=$1 AND prediction_id IS NULL", [b.output_id]);
      if (!o) continue;
      const p = await insert<any>("energy_predictions", {
        shipment_id: o.shipment_id, facility_id: o.facility_id, stream: o.stream, quantity_kg: o.input_kg, technology: b.technology,
        predicted_kwh: b.predicted_kwh, interval_low: b.interval?.[0], interval_high: b.interval?.[1], confidence: b.confidence,
        model_version: `${body.version}-backtest`, created_at: o.recorded_at,
      });
      await update("energy_outputs", o.id, { prediction_id: p.id });
    }
  }
  await publish("ModelRetrained", `${run.model_key} model ${body.version} deployed (${body.algorithm}; ${summariseMetrics(body.metrics)})`, { model_key: run.model_key, version: body.version });
}

function summariseMetrics(m: any) {
  if (m.mape != null) return `MAPE ${(m.mape * 100).toFixed(1)}%, R² ${m.r2?.toFixed(3)}`;
  if (m.f1 != null) return `F1 ${m.f1.toFixed(3)}, MAE ${(m.mae * 100).toFixed(1)} pp`;
  return "";
}
