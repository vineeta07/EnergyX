/**
 * Simulated vehicle telemetry (DEMO MODE). In production this is replaced by
 * AWS IoT Core → Lambda position updates from in-cab GPS units; the rest of
 * the pipeline (stop reached → collected → arrived at hub) is identical.
 */
import { query, update } from "../database/db.ts";
import { broadcast } from "../services/events.ts";
import { completeRoute, markStopReached } from "../services/pipeline.ts";
import { haversineKm, AVG_SPEED_KMH } from "../utils/geo.ts";

const TICK_MS = 1500;
/** Simulation time multiplier for normal operation (real-time trucks would look frozen on a demo map). */
const SPEEDUP = Number(process.env.FLEET_SPEEDUP ?? 25);
/** Per-route overrides, used by the demo to fast-forward its hero route. */
const routeSpeed = new Map<number, number>();
export function setRouteSpeed(routeId: number, mult: number) { routeSpeed.set(routeId, mult); }

let busy = false;

export async function tick() {
  if (busy) return;
  busy = true;
  try {
    const routes = await query<any>("SELECT * FROM routes WHERE status='active'");
    const positions: any[] = [];
    for (const r of routes) {
      const stops = await query<any>("SELECT * FROM route_stops WHERE route_id=$1 ORDER BY seq", [r.id]);
      if (stops.length < 2) continue;
      const seg: number[] = [];
      for (let i = 1; i < stops.length; i++) seg.push(haversineKm(stops[i - 1], stops[i]));
      const total = seg.reduce((a, b) => a + b, 0) || 0.001;
      const mult = routeSpeed.get(r.id) ?? SPEEDUP;
      const stepKm = (AVG_SPEED_KMH * mult * TICK_MS) / 3_600_000 / 1.25; // straight-line equivalent of road speed
      const progress = Math.min(1, r.progress + stepKm / total);
      // position along polyline
      let d = progress * total;
      let i = 0;
      while (i < seg.length - 1 && d > seg[i]) { d -= seg[i]; i++; }
      const a = stops[i], b = stops[i + 1];
      const t = seg[i] ? Math.min(1, d / seg[i]) : 1;
      const lat = a.lat + (b.lat - a.lat) * t;
      const lng = a.lng + (b.lng - a.lng) * t;
      const heading = (Math.atan2(b.lng - a.lng, b.lat - a.lat) * 180) / Math.PI;
      await update("routes", r.id, { progress });
      await update("vehicles", r.vehicle_id, { lat, lng, heading });
      positions.push({ vehicle_id: r.vehicle_id, route_id: r.id, lat, lng, heading, progress });
      // stops passed
      let cum = 0;
      for (let k = 1; k < stops.length; k++) {
        cum += seg[k - 1];
        if (stops[k].stop_type === "pickup" && stops[k].status !== "done" && progress * total >= cum - 1e-6) await markStopReached(r.id, stops[k].seq);
      }
      if (progress >= 1) {
        routeSpeed.delete(r.id);
        await completeRoute(r.id);
      }
    }
    if (positions.length) broadcast({ kind: "positions", positions });
  } catch (e) {
    console.error("[fleet] tick failed", e);
  } finally {
    busy = false;
  }
}

export function startFleetSimulator() {
  setInterval(tick, TICK_MS);
}
