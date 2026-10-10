/**
 * Real road distances & travel times between every fixed network point
 * (MCD zones, hubs, facilities) from OSRM on OpenStreetMap roads.
 * Fetched once, stored in `road_distances`, and served from memory via
 * utils/geo.roadLookup. In AWS mode this is Amazon Location Service
 * CalculateRouteMatrix with the same table.
 */
import { query } from "../database/db.ts";
import { pointKey, setRoadDistance } from "../utils/geo.ts";

const OSRM_URL = process.env.OSRM_URL ?? "https://router.project-osrm.org";
const known = new Set<string>();

export async function loadRoadMatrix() {
  const rows = await query<any>("SELECT a_key, b_key, km, minutes FROM road_distances");
  for (const r of rows) {
    setRoadDistance(r.a_key, r.b_key, r.km, r.minutes);
    known.add(`${r.a_key}|${r.b_key}`);
  }
  return rows.length;
}

async function fixedPoints() {
  const rows = await query<{ lat: number; lng: number }>(
    `SELECT lat, lng FROM waste_sources UNION SELECT lat, lng FROM processing_hubs UNION SELECT lat, lng FROM facilities`);
  const seen = new Map<string, { lat: number; lng: number }>();
  for (const p of rows) seen.set(pointKey(p), p);
  return [...seen.values()];
}

/** Fetch the OSRM table for all fixed points that are not yet cached. Safe to call at every startup. */
export async function ensureRoadMatrix() {
  const pts = await fixedPoints();
  const missing = pts.some((a) => pts.some((b) => pointKey(a) !== pointKey(b) && !known.has(`${pointKey(a)}|${pointKey(b)}`)));
  if (!missing) return { points: pts.length, fetched: 0 };
  if (pts.length > 100) throw new Error("OSRM table limited to 100 points per request");
  const coords = pts.map((p) => `${p.lng},${p.lat}`).join(";");
  const res = await fetch(`${OSRM_URL}/table/v1/driving/${coords}?annotations=distance,duration`, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const j: any = await res.json();
  if (j.code !== "Ok") throw new Error(`OSRM ${j.code}`);
  const rows: [string, string, number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    for (let k = 0; k < pts.length; k++) {
      if (i === k || j.distances[i][k] == null) continue;
      const a = pointKey(pts[i]), b = pointKey(pts[k]);
      const km = j.distances[i][k] / 1000, minutes = j.durations[i][k] / 60;
      rows.push([a, b, km, minutes]);
      setRoadDistance(a, b, km, minutes);
      known.add(`${a}|${b}`);
    }
  }
  for (let i = 0; i < rows.length; i += 250) {
    const batch = rows.slice(i, i + 250);
    const ph = batch.map((_, n) => `($${n * 4 + 1},$${n * 4 + 2},$${n * 4 + 3},$${n * 4 + 4},'osrm')`).join(",");
    await query(`INSERT INTO road_distances (a_key,b_key,km,minutes,source) VALUES ${ph}
      ON CONFLICT (a_key,b_key) DO UPDATE SET km=EXCLUDED.km, minutes=EXCLUDED.minutes`, batch.flat());
  }
  return { points: pts.length, fetched: rows.length };
}


export async function initRoads() {
  const n = await loadRoadMatrix();
  try {
    const r = await ensureRoadMatrix();
    if (r.fetched) console.log(`[roads] Fetched ${r.fetched} OSRM road distances for ${r.points} network points`);
    else console.log(`[roads] ${n} cached road distances (OSRM)`);
  } catch (e: any) {
    console.warn(`[roads] OSRM unavailable (${e.message}); using great-circle x 1.25 estimates for uncached pairs`);
  }
}
