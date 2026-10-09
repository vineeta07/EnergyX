/**
 * Seeds a realistic, fully SIMULATED Delhi-NCR network for demo mode:
 * 20 waste sources (~2,400 daily generation records), 8 vehicles, 3 hubs,
 * 6 energy facilities, ~220 historical shipments with lab-audited compositions
 * and ~500 facility meter readings. All rows carry is_simulated = true.
 */
import bcrypt from "bcryptjs";
import { initDb, insert, query, exec, one, closeDb } from "./db.ts";
import { offsetByRoadKm, roadKm, transportCost, round } from "../utils/geo.ts";
import {
  rng, gaussian, sampleComposition, sampleMoisture, simulateEnergy, STREAMS,
  type FacilitySimParams, type Stream, type Technology,
} from "./simulator.ts";

const DAY = 86_400_000;
export const DEMO_PASSWORD = "demo1234";

export const DEFAULT_WEIGHTS = {
  energy: 0.38, efficiency: 0.16, compatibility: 0.16, capacity: 0.1,
  transport_cost: 0.08, carbon: 0.06, distance: 0.06,
};

const HUBS = [
  { code: "H-01", name: "Okhla Processing Hub", lat: 28.5355, lng: 77.273, capacity_tpd: 40 },
  { code: "H-02", name: "Rohini Sorting Hub", lat: 28.7383, lng: 77.0822, capacity_tpd: 25 },
  { code: "H-03", name: "Gurugram Transfer Hub", lat: 28.4595, lng: 77.0266, capacity_tpd: 30 },
];

type FacSeed = {
  code: string; label: string; name: string; road_km: number; bearing: number; technology: Technology;
  capacity_tpd: number; utilization_pct: number; efficiency_pct: number; carbon_intensity: number; gate_fee: number;
  caps: { stream: Stream; compat: number; max_moisture?: number }[]; sim: FacilitySimParams;
};
// Positions are expressed as road distance + bearing from hub H-01 so the hero scenario
// (Facility A 20 km, B 35 km, C 12 km) is geometrically real.
const FACILITIES: FacSeed[] = [
  { code: "FAC-A", label: "Facility A", name: "Eastgate Biogas Works", road_km: 20, bearing: 62, technology: "anaerobic_digestion",
    capacity_tpd: 8, utilization_pct: 75, efficiency_pct: 71, carbon_intensity: 0.11, gate_fee: 650,
    caps: [{ stream: "organic", compat: 92, max_moisture: 88 }], sim: { trueFactor: 0.58, noise: 0.06, optimalMoisture: 0.74 } },
  { code: "FAC-B", label: "Facility B", name: "NorthGrid Advanced AD Plant", road_km: 35, bearing: 338, technology: "anaerobic_digestion",
    capacity_tpd: 10, utilization_pct: 42, efficiency_pct: 89, carbon_intensity: 0.07, gate_fee: 700,
    caps: [{ stream: "organic", compat: 98, max_moisture: 90 }], sim: { trueFactor: 0.855, noise: 0.045, optimalMoisture: 0.75 } },
  { code: "FAC-C", label: "Facility C", name: "Southline Digester", road_km: 12, bearing: 178, technology: "anaerobic_digestion",
    capacity_tpd: 6, utilization_pct: 89, efficiency_pct: 67, carbon_intensity: 0.13, gate_fee: 600,
    caps: [{ stream: "organic", compat: 80, max_moisture: 85 }], sim: { trueFactor: 0.535, noise: 0.07, optimalMoisture: 0.7 } },
  { code: "FAC-D", label: "Facility D", name: "Westfield RDF Co-processing", road_km: 28, bearing: 250, technology: "rdf_coprocessing",
    capacity_tpd: 15, utilization_pct: 58, efficiency_pct: 81, carbon_intensity: 0.42, gate_fee: 900,
    caps: [{ stream: "plastic", compat: 95, max_moisture: 25 }, { stream: "paper", compat: 62, max_moisture: 30 }, { stream: "other", compat: 55, max_moisture: 30 }],
    sim: { trueFactor: 0.55, noise: 0.08, optimalMoisture: 0.12 } },
  { code: "FAC-E", label: "Facility E", name: "Yamuna Material Recovery Facility", road_km: 9, bearing: 20, technology: "material_recovery",
    capacity_tpd: 20, utilization_pct: 51, efficiency_pct: 93, carbon_intensity: 0.02, gate_fee: 300,
    caps: [{ stream: "paper", compat: 97 }, { stream: "metal", compat: 99 }, { stream: "plastic", compat: 70 }],
    sim: { trueFactor: 1, noise: 0, optimalMoisture: 0.2 } },
  { code: "FAC-F", label: "Facility F", name: "Narela Biomass Power Station", road_km: 42, bearing: 330, technology: "combustion",
    capacity_tpd: 30, utilization_pct: 64, efficiency_pct: 76, carbon_intensity: 0.31, gate_fee: 450,
    caps: [{ stream: "organic", compat: 60, max_moisture: 55 }, { stream: "paper", compat: 85 }, { stream: "other", compat: 72 }, { stream: "plastic", compat: 65 }],
    sim: { trueFactor: 0.7, noise: 0.07, optimalMoisture: 0.3 } },
];

type SrcSeed = { name: string; business_type: string; address: string; lat: number; lng: number; waste_type: string; avg: number; hours: string };
const SOURCES: SrcSeed[] = [
  { name: "Restaurant ABC", business_type: "restaurant", address: "Defence Colony Market, New Delhi", lat: 28.5733, lng: 77.2319, waste_type: "food_organic", avg: 500, hours: "11:00–23:30" },
  { name: "Hotel XYZ", business_type: "hotel", address: "Lodhi Road, New Delhi", lat: 28.5893, lng: 77.2276, waste_type: "mixed_organic", avg: 400, hours: "24h" },
  { name: "Food Market DEF", business_type: "market", address: "INA Market, New Delhi", lat: 28.5753, lng: 77.2094, waste_type: "food_organic", avg: 100, hours: "06:00–21:00" },
  { name: "Saket Food Court", business_type: "restaurant", address: "Select Citywalk, Saket", lat: 28.5286, lng: 77.2193, waste_type: "food_organic", avg: 340, hours: "10:00–23:00" },
  { name: "Grand Aravali Hotel", business_type: "hotel", address: "Vasant Kunj, New Delhi", lat: 28.5245, lng: 77.1551, waste_type: "mixed_organic", avg: 620, hours: "24h" },
  { name: "Azadpur Mandi Block C", business_type: "market", address: "Azadpur, Delhi", lat: 28.7095, lng: 77.1757, waste_type: "food_organic", avg: 2400, hours: "04:00–14:00" },
  { name: "Okhla Fresh Foods Pvt Ltd", business_type: "food_processing", address: "Okhla Phase II", lat: 28.5304, lng: 77.2818, waste_type: "food_organic", avg: 1100, hours: "07:00–19:00" },
  { name: "Najafgarh Agri Cooperative", business_type: "agriculture", address: "Najafgarh, Delhi", lat: 28.6092, lng: 76.9798, waste_type: "agricultural", avg: 1800, hours: "06:00–18:00" },
  { name: "Lajpat Nagar Eateries Cluster", business_type: "restaurant", address: "Lajpat Nagar II", lat: 28.5677, lng: 77.2433, waste_type: "food_organic", avg: 450, hours: "11:00–23:00" },
  { name: "Hauz Khas Village Restaurants", business_type: "restaurant", address: "Hauz Khas Village", lat: 28.5535, lng: 77.1946, waste_type: "food_organic", avg: 380, hours: "12:00–01:00" },
  { name: "Connaught Place Hotel Group", business_type: "hotel", address: "Connaught Place", lat: 28.6315, lng: 77.2167, waste_type: "mixed_organic", avg: 720, hours: "24h" },
  { name: "Ghazipur Wholesale Market", business_type: "market", address: "Ghazipur, Delhi", lat: 28.6247, lng: 77.3207, waste_type: "food_organic", avg: 1500, hours: "05:00–15:00" },
  { name: "Mayapuri Packaging Works", business_type: "manufacturing", address: "Mayapuri Industrial Area", lat: 28.6377, lng: 77.1291, waste_type: "packaging_mixed", avg: 900, hours: "08:00–20:00" },
  { name: "Bawana Dairy Processing", business_type: "food_processing", address: "Bawana Industrial Area", lat: 28.7962, lng: 77.0375, waste_type: "food_organic", avg: 1300, hours: "05:00–17:00" },
  { name: "Rohini Sector 7 RWA", business_type: "municipal", address: "Rohini Sector 7", lat: 28.7041, lng: 77.1025, waste_type: "municipal_mixed", avg: 1600, hours: "06:00–10:00" },
  { name: "Dwarka Sector 10 RWA", business_type: "municipal", address: "Dwarka Sector 10", lat: 28.5823, lng: 77.0587, waste_type: "municipal_mixed", avg: 1400, hours: "06:00–10:00" },
  { name: "Cyber Hub Food Court", business_type: "restaurant", address: "DLF Cyber City, Gurugram", lat: 28.4951, lng: 77.0895, waste_type: "food_organic", avg: 820, hours: "10:00–00:00" },
  { name: "Gurugram Leela Hotel", business_type: "hotel", address: "Golf Course Road, Gurugram", lat: 28.4672, lng: 77.0983, waste_type: "mixed_organic", avg: 560, hours: "24h" },
  { name: "Manesar Auto Components", business_type: "manufacturing", address: "IMT Manesar", lat: 28.3515, lng: 76.9428, waste_type: "packaging_mixed", avg: 750, hours: "08:00–20:00" },
  { name: "Sohna Farm Collective", business_type: "agriculture", address: "Sohna Road", lat: 28.2479, lng: 77.0657, waste_type: "agricultural", avg: 1200, hours: "06:00–18:00" },
];

const VEHICLES = [
  { code: "T-101", type: "Compactor 3T", capacity_kg: 3000, hub: 0, driver: "R. Singh" },
  { code: "T-102", type: "Tipper 5T", capacity_kg: 5000, hub: 0, driver: "M. Khan" },
  { code: "T-103", type: "Compactor 3T", capacity_kg: 3000, hub: 1, driver: "S. Yadav" },
  { code: "T-104", type: "Food-waste tanker 2.5T", capacity_kg: 2500, hub: 0, driver: "A. Verma" },
  { code: "T-105", type: "Tipper 5T", capacity_kg: 5000, hub: 1, driver: "P. Gupta" },
  { code: "T-106", type: "Compactor 3T", capacity_kg: 3000, hub: 2, driver: "K. Sharma" },
  { code: "T-107", type: "Light EV 1.5T", capacity_kg: 1500, hub: 2, driver: "D. Mehta" },
  { code: "T-108", type: "Hook-loader 8T", capacity_kg: 8000, hub: 1, driver: "V. Rawat" },
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

  // ---- facilities
  const facRows: any[] = [];
  for (const f of FACILITIES) {
    const pos = offsetByRoadKm(HUBS[0], f.road_km, f.bearing);
    const row = await insert<any>("facilities", {
      code: f.code, label: f.label, name: f.name, lat: pos.lat, lng: pos.lng, technology: f.technology,
      capacity_tpd: f.capacity_tpd, utilization_pct: f.utilization_pct, efficiency_pct: f.efficiency_pct,
      carbon_intensity: f.carbon_intensity, gate_fee_inr_per_t: f.gate_fee, is_simulated: true, sim_params: f.sim,
    });
    for (const c of f.caps) await insert("facility_capabilities", { facility_id: row.id, stream: c.stream, compatibility_pct: c.compat, max_moisture_pct: c.max_moisture ?? null });
    facRows.push({ ...row, seed: f });
  }

  // ---- users (demo accounts; passwords bcrypt-hashed)
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const facB = facRows.find((f) => f.code === "FAC-B");
  const users = {
    admin: await insert<any>("users", { email: "admin@wattcycle.demo", password_hash: hash, name: "Ananya Rao", role: "admin", organization: "WattCycle Ops" }),
    generator: await insert<any>("users", { email: "generator@wattcycle.demo", password_hash: hash, name: "Rahul Kapoor", role: "generator", organization: "Restaurant ABC" }),
    fleet: await insert<any>("users", { email: "fleet@wattcycle.demo", password_hash: hash, name: "Imran Sheikh", role: "fleet", organization: "GreenHaul Logistics" }),
    hub: await insert<any>("users", { email: "hub@wattcycle.demo", password_hash: hash, name: "Priya Nair", role: "hub", organization: "Okhla Processing Hub", hub_id: hubIds[0] }),
    facility: await insert<any>("users", { email: "facility@wattcycle.demo", password_hash: hash, name: "Vikram Joshi", role: "facility", organization: facB.name, facility_id: facB.id }),
  };

  // ---- sources + daily history (120 days)
  const srcRows: any[] = [];
  for (const [i, s] of SOURCES.entries()) {
    const row = await insert<any>("waste_sources", {
      user_id: i < 3 ? users.generator.id : users.admin.id, name: s.name, business_type: s.business_type, address: s.address,
      city: s.address.includes("Gurugram") || s.address.includes("Manesar") || s.address.includes("Sohna") ? "Gurugram" : "Delhi",
      lat: s.lat, lng: s.lng, waste_type: s.waste_type, avg_daily_kg: s.avg, frequency: "daily", operating_hours: s.hours,
      storage_capacity_kg: Math.round(s.avg * 1.6), contamination_pct: round(6 + r() * 14, 0), status: i === 19 ? "paused" : "active", is_simulated: true,
    });
    srcRows.push({ ...row, seed: s });
  }
  const DAYS = 120;
  const recordValues: string[] = [];
  const params: unknown[] = [];
  for (const s of srcRows) {
    const weekendBoost = ["restaurant", "hotel", "market"].includes(s.business_type) ? 1.16 : s.business_type === "manufacturing" ? 0.55 : 1.0;
    const trend = 1 + (r() - 0.4) * 0.15;
    for (let d = DAYS; d >= 1; d--) {
      if (r() < 0.025) continue; // missing reports — handled by the cleaning stage
      const date = new Date(today - d * DAY);
      const dow = date.getUTCDay();
      const month = date.getUTCMonth();
      let q = s.avg_daily_kg * (dow === 0 || dow === 6 ? weekendBoost : 1);
      q *= 1 + 0.06 * Math.sin((2 * Math.PI * (date.getTime() / DAY)) / 30);
      q *= 1 + (trend - 1) * ((DAYS - d) / DAYS);
      if (month >= 9) q *= ["restaurant", "hotel", "market"].includes(s.business_type) ? 1.08 : 1; // festive season
      q *= 1 + gaussian(r) * 0.07;
      if (r() < 0.006) q *= 3.2; // occasional data-entry outliers (outlier stage removes these)
      const moisture = sampleMoisture([{ business_type: s.business_type, kg: 1 }], month, r);
      params.push(s.id, date.toISOString().slice(0, 10), round(q, 1), s.waste_type, round(moisture * 100, 1));
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
      code: v.code, type: v.type, capacity_kg: v.capacity_kg, lat: hub.lat + (r() - 0.5) * 0.03, lng: hub.lng + (r() - 0.5) * 0.03,
      status: "idle", fuel_l_per_km: v.capacity_kg >= 5000 ? 0.32 : v.capacity_kg <= 1500 ? 0.0 : 0.24, hub_id: hubIds[v.hub], driver: v.driver,
    }));
  }

  // ---- historical shipments → lab audit compositions → dispatch → meter readings
  // Historical dispatch used the legacy "nearest compatible facility, random tie-break" rule,
  // which gives the energy model coverage across every facility.
  const organicFacs = facRows.filter((f) => f.seed.caps.some((c: any) => c.stream === "organic"));
  const facFor = (stream: Stream) => facRows.filter((f) => f.seed.caps.some((c: any) => c.stream === stream));
  let shipNo = 800;
  for (let i = 0; i < 220; i++) {
    const daysAgo = DAYS - Math.floor((i / 220) * (DAYS - 2)) - 1;
    const arrived = new Date(today - daysAgo * DAY + (7 + r() * 9) * 3600_000);
    const hubIdx = r() < 0.55 ? 0 : r() < 0.5 ? 1 : 2;
    const near = srcRows.filter((s) => nearestHubIdx(s) === hubIdx);
    const pool = near.length >= 2 ? near : srcRows;
    const n = 1 + Math.floor(r() * 3);
    const picks = Array.from({ length: n }, () => pool[Math.floor(r() * pool.length)]);
    const mix = picks.map((p) => ({ source_id: p.id, name: p.name, business_type: p.business_type, kg: round(p.avg_daily_kg * (0.5 + r() * 0.9), 0) }));
    const total = mix.reduce((a, m) => a + m.kg, 0);
    const month = arrived.getUTCMonth();
    const comp = sampleComposition(mix, month, r);
    const moisture = sampleMoisture(mix, month, r);
    const ship = await insert<any>("shipments", {
      code: `WC-${shipNo++}`, hub_id: hubIds[hubIdx], source_label: mix.map((m) => m.name).join(" + "), total_kg: total, measured_kg: total,
      moisture_pct: round(moisture * 100, 1), category: comp.organic > 0.5 ? "Mixed organic" : "Mixed dry", status: "processed",
      source_mix: mix, arrived_at: arrived, is_simulated: true, created_at: arrived,
    });
    await insert("waste_compositions", { shipment_id: ship.id, ...Object.fromEntries(STREAMS.map((s) => [s, round(comp[s], 4)])), moisture_pct: round(moisture * 100, 1), origin: "lab_audit", created_at: arrived });

    for (const stream of ["organic", "plastic", "paper"] as Stream[]) {
      const kg = total * comp[stream];
      if (kg < 20) continue;
      const cands = stream === "organic" ? organicFacs : facFor(stream).filter((f) => f.technology !== "material_recovery");
      if (!cands.length) continue;
      if (stream === "paper" && r() < 0.6) continue; // most paper went to recycling (no energy reading)
      const fac = cands[Math.floor(r() * cands.length)];
      const util = (fac.utilization_pct + gaussian(r) * 8) / 100;
      const streamMoisture = stream === "organic" ? Math.min(0.92, moisture + 0.06) : Math.min(0.3, Math.max(0.05, moisture * 0.25));
      const kwh = simulateEnergy({ stream, technology: fac.technology, kg, moisture: streamMoisture, sim: fac.sim_params, utilization: util, r });
      const potential = kg * ({ organic: 0.5, plastic: 1.9, paper: 0.9 } as any)[stream];
      await insert("energy_outputs", {
        facility_id: fac.id, shipment_id: ship.id, stream, input_kg: round(kg, 1), moisture_pct: round(streamMoisture * 100, 1),
        actual_kwh: round(kwh, 1), efficiency_pct: round((100 * kwh) / potential, 1), source: "meter-sim", is_simulated: true,
        recorded_at: new Date(arrived.getTime() + (20 + r() * 20) * 3600_000),
      });
    }
  }

  // ---- currently incoming shipments at the hubs
  const incoming = [
    { hub: 0, mix: [[6, 900], [8, 260]], status: "awaiting_classification", minsAgo: 38 },
    { hub: 1, mix: [[14, 1600], [5, 1200]], status: "awaiting_classification", minsAgo: 95 },
    { hub: 0, mix: [[3, 300], [9, 380]], status: "in_transit", minsAgo: -25 },
  ];
  for (const inc of incoming) {
    const mix = inc.mix.map(([idx, kg]) => ({ source_id: srcRows[idx].id, name: srcRows[idx].name, business_type: srcRows[idx].business_type, kg }));
    const total = mix.reduce((a, m) => a + m.kg, 0);
    await insert("shipments", {
      code: `WC-${shipNo++}`, hub_id: hubIds[inc.hub], source_label: mix.map((m) => m.name).join(" + "), total_kg: total,
      measured_kg: inc.status === "in_transit" ? null : total, moisture_pct: null, category: "Mixed organic", status: inc.status,
      source_mix: mix, arrived_at: inc.minsAgo > 0 ? new Date(now - inc.minsAgo * 60_000) : null, is_simulated: true,
    });
  }

  // ---- open pickup requests (fleet board)
  let pk = 2000;
  const openPickups: [number, number, string, string][] = [
    [0, 480, "high", "REQUESTED"], [1, 410, "normal", "REQUESTED"], [2, 95, "normal", "REQUESTED"],
    [3, 330, "normal", "REQUESTED"], [9, 360, "low", "REQUESTED"], [12, 880, "normal", "REQUESTED"],
    [10, 700, "high", "REQUESTED"], [16, 790, "critical", "REQUESTED"],
  ];
  for (const [idx, kg, urgency, status] of openPickups) {
    const s = srcRows[idx];
    const hub = HUBS[nearestHubIdx(s)];
    const km = roadKm(s, hub);
    await insert("pickup_requests", {
      code: `PU-${pk++}`, source_id: s.id, requested_by: users.generator.id, quantity_kg: kg, waste_type: s.waste_type, urgency, status,
      window_start: new Date(now + (1 + r() * 3) * 3600_000), window_end: new Date(now + (5 + r() * 4) * 3600_000),
      estimated_cost: round(transportCost(km * 2) * (kg / 2500) + 150, 0), estimated_co2: round((km * 2 * 0.85 * kg) / 2500 + 1.5, 1),
      created_at: new Date(now - r() * 5 * 3600_000),
    });
  }
  // delivered history for the generator's activity tab
  for (let i = 0; i < 12; i++) {
    const s = srcRows[i % 3];
    await insert("pickup_requests", {
      code: `PU-${pk++}`, source_id: s.id, requested_by: users.generator.id, quantity_kg: round(s.avg_daily_kg * (0.9 + r() * 0.2), 0),
      waste_type: s.waste_type, urgency: "normal", status: "DELIVERED", vehicle_id: vehRows[3].id,
      created_at: new Date(today - (i + 1) * DAY + 9 * 3600_000), updated_at: new Date(today - (i + 1) * DAY + 13 * 3600_000),
    });
  }

  // ---- seeded alerts (operational state that exists before the demo starts)
  const facC = facRows.find((f) => f.code === "FAC-C");
  const facA = facRows.find((f) => f.code === "FAC-A");
  await insert("alerts", { severity: "warning", type: "facility_capacity", title: "Facility nearing capacity", message: `${facC.label} (${facC.name}) is at 89% utilization. New organic loads will be de-prioritised by the optimizer.`, causes: ["Seasonal festive surge", "Digester 2 maintenance window"], entity_type: "facility", entity_id: facC.id, created_at: new Date(now - 50 * 60_000) });
  await insert("alerts", { severity: "warning", type: "pickup_overdue", title: "Pickup overdue", message: "Cyber Hub Food Court pickup is past its window by 40 min (critical urgency).", entity_type: "source", entity_id: srcRows[16].id, created_at: new Date(now - 40 * 60_000) });
  await insert("alerts", { severity: "info", type: "route_disruption", title: "Route disruption", message: "Ring Road congestion near Ashram: +14 min on routes via Mathura Road (simulated traffic feed).", created_at: new Date(now - 22 * 60_000) });
  await insert("alerts", { severity: "warning", type: "vehicle_delayed", title: "Vehicle delayed", message: "T-106 is 18 min behind schedule on the Gurugram loop.", entity_type: "vehicle", entity_id: vehRows[5].id, created_at: new Date(now - 12 * 60_000) });
  await insert("alerts", { severity: "info", type: "facility_unavailable", title: "Planned downtime", message: `${facA.label} digester 1 offline 02:00–06:00 tomorrow for scheduled maintenance.`, entity_type: "facility", entity_id: facA.id, created_at: new Date(now - 3 * 3600_000) });

  for (const [type, message] of [
    ["SystemSeeded", "Demo network seeded: 20 sources, 8 vehicles, 3 hubs, 6 facilities (SIMULATED)"],
  ]) await insert("events", { type, message, payload: {} });

  return true;
}

if (process.argv[1]?.includes("seed")) {
  const reset = process.argv.includes("--reset");
  seed(reset).then(async (did) => {
    console.log(did ? "Seed complete." : "Database already seeded (use --reset).");
    await closeDb();
  }).catch((e) => { console.error(e); process.exit(1); });
}
