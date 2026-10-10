/**
 * Seeds the WattCycle network on REAL Delhi data (realdata/delhi.ts):
 *   - 12 MCD zones as waste sources: real wards, daily tonnage (TPD) and current disposal point (DPCC/MCD)
 *   - 13 real facilities: 4 WtE plants (published TPD + MW), 2 landfills, 1 commissioning biomethanation
 *     plant, 6 MRFs (published TPD), geocoded with OpenStreetMap
 *   - city composition centred on MCD's 40% biodegradable share
 * Generated (demo, flagged is_simulated): day-to-day tonnage around each zone's published average,
 * individual transfer loads, hubs and trucks, per-load composition noise, and meter readings
 * scattered around each plant's published MW ÷ TPD yield.
 */
import bcrypt from "bcryptjs";
import { initDb, insert, query, exec, one, closeDb } from "./db.ts";
import { roadKm, transportCost, round } from "../utils/geo.ts";
import {
  rng, gaussian, sampleComposition, sampleMoisture, simulateEnergy, STREAMS,
  type FacilitySimParams, type Stream, type Technology,
} from "./simulator.ts";
import { ZONES, FACILITIES, DELHI, LHV_KWH_PER_KG, SOURCES as DATA_SOURCES, electricalEfficiency, nameplateYield } from "./realdata/delhi.ts";

const DAY = 86_400_000;
export const DEMO_PASSWORD = "demo1234";

export const DEFAULT_WEIGHTS = {
  energy: 0.38, efficiency: 0.16, compatibility: 0.16, capacity: 0.1,
  transport_cost: 0.08, carbon: 0.06, distance: 0.06,
};

// Transfer & sorting hubs (demo: Delhi's FCTS network is not published with coordinates).
const HUBS = [
  { code: "H-01", name: "Okhla Transfer & Sorting Hub", lat: 28.5204, lng: 77.2776, capacity_tpd: 300 },
  { code: "H-02", name: "Rohini Transfer & Sorting Hub", lat: 28.7155, lng: 77.115, capacity_tpd: 300 },
  { code: "H-03", name: "Shahdara Transfer & Sorting Hub", lat: 28.665, lng: 77.295, capacity_tpd: 300 },
];

// Demo fleet using MCD's real vehicle classes (DPCC zone-wise vehicle table: hook loaders, RCVs, MTS).
const VEHICLES = [
  { code: "T-101", type: "Hook loader (container)", capacity_kg: 9000, hub: 0, driver: "R. Singh" },
  { code: "T-102", type: "Refuse compactor (RCV)", capacity_kg: 7000, hub: 0, driver: "M. Khan" },
  { code: "T-103", type: "Hook loader (container)", capacity_kg: 9000, hub: 1, driver: "S. Yadav" },
  { code: "T-104", type: "Mechanical transfer (MTS) truck", capacity_kg: 15000, hub: 0, driver: "A. Verma" },
  { code: "T-105", type: "Refuse compactor (RCV)", capacity_kg: 7000, hub: 1, driver: "P. Gupta" },
  { code: "T-106", type: "Hook loader (container)", capacity_kg: 9000, hub: 2, driver: "K. Sharma" },
  { code: "T-107", type: "Refuse compactor (RCV)", capacity_kg: 7000, hub: 2, driver: "D. Mehta" },
  { code: "T-108", type: "Mechanical transfer (MTS) truck", capacity_kg: 15000, hub: 1, driver: "V. Rawat" },
];

function nearestHubIdx(p: { lat: number; lng: number }) {
  let best = 0;
  HUBS.forEach((h, i) => { if (roadKm(p, h) < roadKm(p, HUBS[best])) best = i; });
  return best;
}

export async function seed(reset = false) {
  await initDb();
  if (reset) {
    await exec(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`);
    await closeDb();
    await initDb();
  }
  const existing = await one<{ n: number }>("SELECT count(*)::int AS n FROM users");
  if (existing && existing.n > 0) return false;

  const r = rng(20261009);
  const now = Date.now();
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime();

  await insert("system_settings", { key: "optimizer_weights", value: DEFAULT_WEIGHTS });
  await insert("system_settings", { key: "retrain_policy", value: { schedule: "daily 02:00 IST", min_new_feedback: 25, drift_mape_threshold: 0.12 } });

  // ---- hubs
  const hubIds: number[] = [];
  for (const h of HUBS) hubIds.push((await insert<any>("processing_hubs", { ...h, current_load_kg: 0 })).id);

  // ---- facilities (real)
  const facRows: any[] = [];
  for (const f of FACILITIES) {
    const eff = electricalEfficiency(f);
    const sim: FacilitySimParams | null =
      f.technology === "combustion" ? { trueFactor: eff, noise: 0.07, optimalMoisture: 0.55 }
      : f.technology === "anaerobic_digestion" ? { trueFactor: 1, noise: 0.08, optimalMoisture: 0.8 }
      : null;
    const row = await insert<any>("facilities", {
      code: f.code, label: f.label, name: f.name, lat: f.lat, lng: f.lng, technology: f.technology,
      capacity_tpd: f.capacity_tpd, utilization_pct: f.utilization_pct, efficiency_pct: round(eff * 100, 1),
      carbon_intensity: 0, gate_fee_inr_per_t: 0, status: f.status, is_simulated: false, sim_params: sim,
      mw: f.mw ?? null, notes: f.notes + (f.mw ? ` Nameplate yield ${nameplateYield(f).toFixed(3)} kWh/kg.` : ""),
      data_source: DATA_SOURCES[f.source].url,
    });
    for (const c of f.caps) await insert("facility_capabilities", { facility_id: row.id, stream: c.stream, compatibility_pct: c.compat, max_moisture_pct: c.max_moisture ?? null });
    facRows.push({ ...row, seed: f });
  }
  const facByLabel = (l: string) => facRows.find((x) => x.label === l);

  // ---- users (demo accounts; passwords bcrypt-hashed)
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const facUser = facRows.find((f) => f.code === "WTE-TKD");
  const users = {
    admin: await insert<any>("users", { email: "admin@wattcycle.demo", password_hash: hash, name: "Ananya Rao", role: "admin", organization: "WattCycle Ops" }),
    generator: await insert<any>("users", { email: "generator@wattcycle.demo", password_hash: hash, name: "Rahul Kapoor", role: "generator", organization: "Central Zone sanitation office (demo account)" }),
    fleet: await insert<any>("users", { email: "fleet@wattcycle.demo", password_hash: hash, name: "Imran Sheikh", role: "fleet", organization: "Collection & transport concessionaire (demo account)" }),
    hub: await insert<any>("users", { email: "hub@wattcycle.demo", password_hash: hash, name: "Priya Nair", role: "hub", organization: "Okhla Transfer & Sorting Hub", hub_id: hubIds[0] }),
    facility: await insert<any>("users", { email: "facility@wattcycle.demo", password_hash: hash, name: "Vikram Joshi", role: "facility", organization: facUser.name, facility_id: facUser.id }),
  };

  // ---- sources = 12 real MCD zones; daily history = demo variation around each zone's published TPD
  const srcRows: any[] = [];
  for (const [i, z] of ZONES.entries()) {
    const row = await insert<any>("waste_sources", {
      user_id: i < 2 ? users.generator.id : users.admin.id, name: `MCD ${z.name}`, business_type: "municipal",
      address: `${z.ref}, Delhi (zone reference locality)`, city: "Delhi", lat: z.lat, lng: z.lng, waste_type: "municipal_mixed",
      avg_daily_kg: z.tpd * 1000, frequency: "daily", operating_hours: "24h", storage_capacity_kg: z.tpd * 1000,
      contamination_pct: 43, // MCD average source segregation is 57% (DPCC)
      status: "active", is_simulated: false, wards: z.wards, current_disposal: z.disposal, data_source: DATA_SOURCES.dpcc_mcd.url,
    });
    srcRows.push({ ...row, seed: z });
  }
  const DAYS = 120;
  const recordValues: string[] = [];
  const params: unknown[] = [];
  for (const s of srcRows) {
    const trend = 1 + (r() - 0.45) * 0.06;
    for (let d = DAYS; d >= 1; d--) {
      if (r() < 0.025) continue; // missing reports — handled by the cleaning stage
      const date = new Date(today - d * DAY);
      const dow = date.getUTCDay();
      const month = date.getUTCMonth();
      let q = s.avg_daily_kg * (dow === 0 ? 0.93 : dow === 1 ? 1.06 : 1); // Sunday dip / Monday backlog (demo assumption)
      q *= 1 + (trend - 1) * ((DAYS - d) / DAYS);
      if (month >= 9 && month <= 10) q *= 1.07; // festive season (demo assumption)
      if (month >= 6 && month <= 8) q *= 1.03; // monsoon: wetter, heavier waste (demo assumption)
      q *= 1 + gaussian(r) * 0.05;
      if (r() < 0.006) q *= 2.6; // occasional data-entry outliers (the outlier stage removes these)
      const moisture = sampleMoisture([{ business_type: s.business_type, kg: 1 }], month, r);
      params.push(s.id, date.toISOString().slice(0, 10), round(q, 0), s.waste_type, round(moisture * 100, 1));
      const k = params.length;
      recordValues.push(`($${k - 4},$${k - 3},$${k - 2},$${k - 1},$${k},true)`);
      if (recordValues.length >= 400) {
        await query(`INSERT INTO waste_records (source_id,record_date,quantity_kg,waste_type,moisture_pct,is_simulated) VALUES ${recordValues.join(",")}`, params.splice(0));
        recordValues.length = 0;
      }
    }
  }
  if (recordValues.length) await query(`INSERT INTO waste_records (source_id,record_date,quantity_kg,waste_type,moisture_pct,is_simulated) VALUES ${recordValues.join(",")}`, params);

  // ---- vehicles
  const vehRows: any[] = [];
  for (const v of VEHICLES) {
    const hub = HUBS[v.hub];
    vehRows.push(await insert<any>("vehicles", {
      code: v.code, type: v.type, capacity_kg: v.capacity_kg, lat: hub.lat + (r() - 0.5) * 0.02, lng: hub.lng + (r() - 0.5) * 0.02,
      status: "idle", fuel_l_per_km: v.capacity_kg >= 12000 ? 0.38 : 0.3, hub_id: hubIds[v.hub], driver: v.driver,
    }));
  }

  // ---- historical transfer loads → lab-audit compositions → disposal per MCD's REAL zone→plant assignment → meter readings
  let shipNo = 800;
  for (let i = 0; i < 220; i++) {
    const daysAgo = DAYS - Math.floor((i / 220) * (DAYS - 2)) - 1;
    const arrived = new Date(today - daysAgo * DAY + (6 + r() * 12) * 3600_000);
    const z = srcRows[Math.floor(r() * srcRows.length)];
    const hubIdx = nearestHubIdx(z);
    const others = srcRows.filter((x) => x.id !== z.id && nearestHubIdx(x) === hubIdx);
    const picks = r() < 0.5 && others.length ? [z, others[Math.floor(r() * others.length)]] : [z];
    const mix = picks.map((p) => ({ source_id: p.id, name: p.name, business_type: p.business_type, kg: round(3000 + r() * 5000, 0) }));
    const total = mix.reduce((a, m) => a + m.kg, 0);
    const month = arrived.getUTCMonth();
    const comp = sampleComposition(mix, month, r);
    const moisture = sampleMoisture(mix, month, r);
    const ship = await insert<any>("shipments", {
      code: `WC-${shipNo++}`, hub_id: hubIds[hubIdx], source_label: mix.map((m) => m.name).join(" + "), total_kg: total, measured_kg: total,
      moisture_pct: round(moisture * 100, 1), category: "Mixed MSW", status: "processed",
      source_mix: mix, arrived_at: arrived, is_simulated: true, created_at: arrived,
    });
    await insert("waste_compositions", { shipment_id: ship.id, ...Object.fromEntries(STREAMS.map((s) => [s, round(comp[s], 4)])), moisture_pct: round(moisture * 100, 1), origin: "lab_audit", created_at: arrived });

    // Where this zone's waste actually goes today (DPCC table), e.g. "Tehkhand WtE + Okhla WtE".
    const dests = (z.seed.disposal as string).split(" + ").map((l) => facByLabel(l)).filter(Boolean);
    const dest = dests[Math.floor(r() * dests.length)];
    if (!dest || dest.technology !== "combustion") continue; // landfilled: no energy recovered
    for (const stream of ["organic", "plastic", "paper", "other"] as Stream[]) {
      const kg = total * comp[stream];
      if (kg < 20) continue;
      const util = (dest.utilization_pct + gaussian(r) * 3) / 100;
      const streamMoisture = stream === "organic" ? Math.min(0.92, moisture + 0.06) : Math.min(0.3, Math.max(0.05, moisture * 0.25));
      const kwh = simulateEnergy({ stream, technology: dest.technology as Technology, kg, moisture: streamMoisture, sim: dest.sim_params, utilization: util, r });
      await insert("energy_outputs", {
        facility_id: dest.id, shipment_id: ship.id, stream, input_kg: round(kg, 1), moisture_pct: round(streamMoisture * 100, 1),
        actual_kwh: round(kwh, 1), efficiency_pct: round((100 * kwh) / (kg * LHV_KWH_PER_KG[stream]), 1), source: "meter-sim", is_simulated: true,
        recorded_at: new Date(arrived.getTime() + (6 + r() * 18) * 3600_000),
      });
    }
  }

  // ---- currently incoming transfer loads at the hubs
  const incoming = [
    { hub: 0, mix: [[0, 5200], [1, 3800]], status: "awaiting_classification", minsAgo: 38 },
    { hub: 2, mix: [[11, 6000], [10, 3500]], status: "awaiting_classification", minsAgo: 95 },
    { hub: 0, mix: [[2, 4100]], status: "in_transit", minsAgo: -25 },
  ];
  for (const inc of incoming) {
    const mix = inc.mix.map(([idx, kg]) => ({ source_id: srcRows[idx].id, name: srcRows[idx].name, business_type: srcRows[idx].business_type, kg }));
    const total = mix.reduce((a, m) => a + m.kg, 0);
    await insert("shipments", {
      code: `WC-${shipNo++}`, hub_id: hubIds[inc.hub], source_label: mix.map((m) => m.name).join(" + "), total_kg: total,
      measured_kg: inc.status === "in_transit" ? null : total, moisture_pct: null, category: "Mixed MSW", status: inc.status,
      source_mix: mix, arrived_at: inc.minsAgo > 0 ? new Date(now - inc.minsAgo * 60_000) : null, is_simulated: true,
    });
  }

  // ---- open transfer-load requests (fleet board)
  let pk = 2000;
  const openPickups: [number, number, string, string][] = [
    [0, 4500, "high", "REQUESTED"], [1, 3800, "normal", "REQUESTED"], [3, 4200, "normal", "REQUESTED"],
    [4, 5000, "normal", "REQUESTED"], [6, 3600, "low", "REQUESTED"], [7, 4800, "normal", "REQUESTED"],
    [10, 5200, "high", "REQUESTED"], [11, 6000, "critical", "REQUESTED"],
  ];
  for (const [idx, kg, urgency, status] of openPickups) {
    const s = srcRows[idx];
    const hub = HUBS[nearestHubIdx(s)];
    const km = roadKm(s, hub);
    await insert("pickup_requests", {
      code: `PU-${pk++}`, source_id: s.id, requested_by: users.generator.id, quantity_kg: kg, waste_type: s.waste_type, urgency, status,
      window_start: new Date(now + (1 + r() * 3) * 3600_000), window_end: new Date(now + (5 + r() * 4) * 3600_000),
      estimated_cost: round(transportCost(km * 2) * (kg / 9000) + 150, 0), estimated_co2: round((km * 2 * 0.85 * kg) / 9000 + 1.5, 1),
      created_at: new Date(now - r() * 5 * 3600_000),
    });
  }
  // delivered history for the zone office's activity tab
  for (let i = 0; i < 12; i++) {
    const s = srcRows[i % 2];
    await insert("pickup_requests", {
      code: `PU-${pk++}`, source_id: s.id, requested_by: users.generator.id, quantity_kg: round(3500 + r() * 3000, 0),
      waste_type: s.waste_type, urgency: "normal", status: "DELIVERED", vehicle_id: vehRows[3].id,
      created_at: new Date(today - (i + 1) * DAY + 9 * 3600_000), updated_at: new Date(today - (i + 1) * DAY + 13 * 3600_000),
    });
  }

  // ---- alerts grounded in the real DPCC/MCD figures
  const bawana = facByLabel("Bawana WtE"), ghogha = facByLabel("Ghogha Biomethanation"), bhalswa = facByLabel("Bhalswa SLF");
  await insert("alerts", { severity: "critical", type: "processing_gap", title: "City processing gap", message: `Delhi (MCD) generates ${DELHI.generation_tpd.toLocaleString("en-IN")} TPD but processing capacity is ${DELHI.processing_capacity_tpd.toLocaleString("en-IN")} TPD; about ${(DELHI.generation_tpd - DELHI.processing_capacity_tpd).toLocaleString("en-IN")} TPD is dumped at Ghazipur & Bhalswa (DPCC/MCD).`, causes: ["WtE capacity below generation", "Biomethanation plants not yet commissioned"], created_at: new Date(now - 2 * 3600_000) });
  await insert("alerts", { severity: "warning", type: "facility_capacity", title: "Facility over assigned capacity", message: "Bawana WtE is assigned Rohini, Civil Lines and Keshavpuram zones (2,550 TPD) against 2,400 TPD capacity (DPCC).", causes: ["Zone assignment exceeds plant capacity"], entity_type: "facility", entity_id: bawana.id, created_at: new Date(now - 50 * 60_000) });
  await insert("alerts", { severity: "warning", type: "landfill_dependency", title: "Zones sent to landfill", message: "Karol Bagh, City-SP and Narela zones (2,300 TPD) currently go to Bhalswa SLF with no energy recovery (DPCC).", entity_type: "facility", entity_id: bhalswa.id, created_at: new Date(now - 40 * 60_000) });
  await insert("alerts", { severity: "info", type: "facility_unavailable", title: "Biomethanation plant commissioning", message: `${ghogha.name} is commissioning (MCD's first of 3 plants, 750 MT/day wet waste in total). It becomes an eligible destination for segregated organics once online.`, entity_type: "facility", entity_id: ghogha.id, created_at: new Date(now - 3 * 3600_000) });

  await insert("events", { type: "SystemSeeded", message: `Delhi network seeded from DPCC/MCD data: 12 zones (${DELHI.generation_tpd.toLocaleString("en-IN")} TPD), ${FACILITIES.length} real facilities; daily records and loads simulated around published averages`, payload: {} });

  return true;
}

// Run as a script only when invoked directly (`tsx src/database/seed.ts`), not when imported.
if (process.argv[1] && /[\\/]database[\\/]seed\.ts$/.test(process.argv[1])) {
  const reset = process.argv.includes("--reset");
  seed(reset).then(async (did) => {
    console.log(did ? "Seed complete." : "Database already seeded (use --reset).");
    await closeDb();
  }).catch((e) => { console.error(e); process.exit(1); });
}
