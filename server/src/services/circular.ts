/**
 * Circular-economy loops that run beside the energy loop:
 *
 *  UPCYCLING   hub sets aside upcycle-grade items → AI matches a partner → dispatch →
 *              partner reports accepted kg (feedback → learned acceptance rate) → products made
 *
 *  BATTERIES   e-waste battery lot received → every unit tested → AI grades (A/B/R + remaining
 *              cycles) → AI designs a balanced second-life pack (CP-SAT) → assemble → deploy →
 *              telemetry → observed fade updates the fade prior (feedback) → rejects recycled
 *
 * The AI runs in the Python service; this module owns data, state transitions and the
 * physical-world simulator for demo mode (tester readings, partner receipts, pack telemetry —
 * all flagged is_simulated).
 */
import { query, one, insert, update, exec } from "../database/db.ts";
import { ai } from "./aiClient.ts";
import { publish } from "./events.ts";
import { getSetting, setSetting, nextCode } from "./settings.ts";
import { HttpError, notFound } from "../middleware/http.ts";
import type { AuthUser } from "../middleware/auth.ts";
import { roadLookup, transportCost, transportCo2, round } from "../utils/geo.ts";
import { rng, gaussian } from "../database/simulator.ts";
import { UPCYCLE_STREAM, effectiveComposition, streamSplit } from "./pipeline.ts";

export const UPCYCLE_LABEL: Record<string, string> = {
  textile: "Textiles & shoes", glass_container: "Glass jars & bottles", pet_bottle: "PET bottles", hdpe_container: "HDPE containers", cardboard: "Cardboard boxes",
};

// Demo partners (generic names, real Delhi-NCR localities; flagged is_simulated). Prices are INR/kg paid for upcycle-grade material.
const PARTNERS = [
  { code: "UP-TXT-1", name: "Textile upcycling studio — Shahpur Jat", kind: "upcycler", lat: 28.5494, lng: 77.2163, prices: { textile: 12 }, capacity_kg_week: 1500, products: "bags, quilts, rugs" },
  { code: "UP-TXT-2", name: "Panipat textile recycling cluster (shoddy yarn)", kind: "upcycler", lat: 29.3909, lng: 76.9635, prices: { textile: 8 }, capacity_kg_week: 20000, products: "shoddy yarn, blankets" },
  { code: "UP-GLS-1", name: "Glass jar refill & reuse partner — Kirti Nagar", kind: "upcycler", lat: 28.6517, lng: 77.1424, prices: { glass_container: 3 }, capacity_kg_week: 3000, products: "washed jars for refill stores, lamps" },
  { code: "UP-PET-1", name: "PET upcycling unit — Okhla Phase II", kind: "upcycler", lat: 28.5355, lng: 77.2732, prices: { pet_bottle: 30, hdpe_container: 26 }, capacity_kg_week: 4000, products: "polyester fibre, furniture, eco-bricks" },
  { code: "UP-CRD-1", name: "Packaging reuse partner — Naraina", kind: "upcycler", lat: 28.6305, lng: 77.139, prices: { cardboard: 11 }, capacity_kg_week: 5000, products: "re-used shipping boxes" },
  { code: "UP-MIX-1", name: "Upcycling workshop (social enterprise) — Mehrauli", kind: "upcycler", lat: 28.5244, lng: 77.1855, prices: { textile: 9, glass_container: 4, hdpe_container: 20 }, capacity_kg_week: 800, products: "decor, planters, bags" },
  { code: "BR-BWN-1", name: "Authorised battery recycler (BWMR 2022) — Bawana", kind: "battery_recycler", lat: 28.7996, lng: 77.0431, prices: {}, capacity_kg_week: 50000, products: "black mass, lead ingots, copper, aluminium" },
];

// Demo battery intake (simulated): what a Delhi e-waste collection drive brings in.
export const LOT_PRESETS = {
  laptop_cells: { source_label: "Laptop & power-bank 18650 cells — e-waste collection drive", chemistry: "li_nmc", unit_type: "cell", nominal_v: 3.65, nominal_ah: 2.6, unit_kg: 0.047, sim: { soh_mu: 0.76, soh_sd: 0.11, swell: 0.02, deep: 0.04 } },
  ev_modules: { source_label: "Retired EV / e-scooter LFP modules", chemistry: "li_lfp", unit_type: "module", nominal_v: 12.8, nominal_ah: 50, unit_kg: 6.2, sim: { soh_mu: 0.8, soh_sd: 0.06, swell: 0.01, deep: 0.02 } },
  erickshaw_lead: { source_label: "E-rickshaw lead-acid batteries (12 V)", chemistry: "lead_acid", unit_type: "block", nominal_v: 12, nominal_ah: 100, unit_kg: 28, sim: { soh_mu: 0.62, soh_sd: 0.12, swell: 0.03, deep: 0.05 } },
} as const;

export async function seedCircular() {
  const n = await one<{ n: number }>("SELECT COUNT(*)::int AS n FROM circular_partners");
  if (n?.n) return false;
  for (const p of PARTNERS) await insert("circular_partners", { ...p, is_simulated: true });
  const hub = await one<any>("SELECT id FROM processing_hubs ORDER BY id LIMIT 1");
  await createBatteryLot({ ...LOT_PRESETS.laptop_cells, hub_id: hub?.id, unit_count: 240, preset: "laptop_cells" }, true);
  await createBatteryLot({ ...LOT_PRESETS.erickshaw_lead, hub_id: hub?.id, unit_count: 24, preset: "erickshaw_lead" }, true);
  return true;
}

// ================================================================== UPCYCLING
export async function createUpcycleLot(input: { hub_id?: number; shipment_id?: number; category: string; kg: number; items?: number; notes?: string }, user?: AuthUser) {
  let hubId = input.hub_id;
  if (input.shipment_id) {
    const sh = await one<any>("SELECT * FROM shipments WHERE id=$1", [input.shipment_id]);
    if (!sh) throw notFound("Shipment");
    const eff = await effectiveComposition(sh.id);
    if (!eff) throw new HttpError(409, "Classify the shipment before setting items aside for upcycling");
    if (["dispatched", "processed"].includes(sh.status)) throw new HttpError(409, "Shipment already dispatched");
    const split = await streamSplit(sh.id, eff, sh.measured_kg ?? sh.total_kg);
    const s = split[UPCYCLE_STREAM[input.category]];
    const left = s.kg - s.upcycle_kg;
    if (input.kg > left + 0.5) throw new HttpError(400, `Only ${round(left, 0)} kg of ${UPCYCLE_STREAM[input.category]} left in ${sh.code}`);
    hubId = sh.hub_id;
  }
  if (!hubId) throw new HttpError(400, "hub_id or shipment_id required");
  const lot = await insert<any>("upcycle_lots", {
    code: await nextCode("upcycle_lots", "UC", 100), hub_id: hubId, shipment_id: input.shipment_id ?? null, category: input.category,
    kg: input.kg, items: input.items ?? null, notes: input.notes ?? null, status: "identified", created_by: user?.id ?? null,
  });
  await publish("UpcycleLotCreated", `${lot.code}: ${round(input.kg, 0)} kg ${UPCYCLE_LABEL[input.category].toLowerCase()} set aside for upcycling`, { upcycle_lot_id: lot.id, shipment_id: input.shipment_id ?? null });
  return lot;
}

async function partnerCandidates(origin: { lat: number; lng: number }, kind: string) {
  const rows = await query<any>(`SELECT p.*, COALESCE((SELECT SUM(l.kg) FROM upcycle_lots l WHERE l.partner_id=p.id AND l.status IN ('matched','in_transit') AND l.updated_at > now() - interval '7 days'),0) AS load_kg_week
    FROM circular_partners p WHERE p.kind=$1 ORDER BY p.id`, [kind]);
  return rows.map((p) => {
    const leg = roadLookup(origin, p);
    return { ...p, distance_km: round(leg.km, 1), transport_cost_inr: round(transportCost(leg.km), 0), transport_co2_kg: round(transportCo2(leg.km), 1) };
  });
}

async function getLot(id: number) {
  const lot = await one<any>("SELECT l.*, h.lat, h.lng, h.name AS hub_name, h.code AS hub_code FROM upcycle_lots l JOIN processing_hubs h ON h.id=l.hub_id WHERE l.id=$1", [id]);
  if (!lot) throw notFound("Upcycle lot");
  return lot;
}

export async function matchUpcycleLot(id: number) {
  const lot = await getLot(id);
  if (!["identified", "matched"].includes(lot.status)) throw new HttpError(409, `Lot is ${lot.status}`);
  const partners = await partnerCandidates(lot, "upcycler");
  const res = await ai.upcycleMatch({
    category: lot.category, kg: lot.kg,
    partners: partners.map((p) => ({ id: p.id, name: p.name, status: p.status, prices: p.prices, capacity_kg_week: p.capacity_kg_week, load_kg_week: Number(p.load_kg_week),
      received_kg: p.received_kg, accepted_kg: p.accepted_kg, distance_km: p.distance_km, transport_cost_inr: p.transport_cost_inr, transport_co2_kg: p.transport_co2_kg })),
  });
  const out = await update<any>("upcycle_lots", id, { status: "matched", partner_id: res.chosen_partner_id, match: res, updated_at: new Date() });
  await publish("UpcycleMatched", `${lot.code}: ${res.explanation.headline}`, { upcycle_lot_id: id });
  return out;
}

export async function dispatchUpcycleLot(id: number, opts: { partner_id?: number | null; fallback?: boolean }) {
  const lot = await getLot(id);
  if (lot.status !== "matched") throw new HttpError(409, "Match the lot with the AI first");
  if (opts.fallback) {
    const out = await update<any>("upcycle_lots", id, { status: "fallback", partner_id: null, updated_at: new Date() });
    await publish("UpcycleDispatched", `${lot.code} returned to the default route (${lot.match?.fallback?.route ?? "recycling / energy"})`, { upcycle_lot_id: id });
    return out;
  }
  const pid = opts.partner_id ?? lot.partner_id;
  const row = (lot.match?.ranking ?? []).find((r: any) => r.partner_id === pid);
  if (!pid || !row) throw new HttpError(400, "Choose a partner from the evaluated ranking");
  if (!row.eligible) throw new HttpError(400, `Partner ineligible: ${row.exclusion_reason}`);
  const out = await update<any>("upcycle_lots", id, { status: "in_transit", partner_id: pid, updated_at: new Date() });
  await publish("UpcycleDispatched", `${lot.code}: ${round(lot.kg, 0)} kg on its way to ${row.name}${pid !== lot.partner_id ? " (operator override)" : ""}`, { upcycle_lot_id: id });
  return out;
}

/** Partner weighs what it accepted. This is the feedback that trains the acceptance rate. */
export async function receiveUpcycleLot(id: number, acceptedKg: number) {
  const lot = await getLot(id);
  if (lot.status !== "in_transit") throw new HttpError(409, "Lot is not in transit");
  if (acceptedKg > lot.kg) throw new HttpError(400, "Accepted kg cannot exceed the lot weight");
  const partner = await one<any>("SELECT * FROM circular_partners WHERE id=$1", [lot.partner_id]);
  const row = (lot.match?.ranking ?? []).find((r: any) => r.partner_id === lot.partner_id);
  const f = lot.match?.factors ?? {};
  const co2 = acceptedKg * (f.ef_upcycle ?? 0) + (lot.kg - acceptedKg) * (f.ef_fallback ?? 0) - (row?.transport_co2_kg ?? 0);
  await query("UPDATE circular_partners SET received_kg = received_kg + $2, accepted_kg = accepted_kg + $3 WHERE id=$1", [lot.partner_id, lot.kg, acceptedKg]);
  const out = await update<any>("upcycle_lots", id, {
    status: "received", accepted_kg: round(acceptedKg, 1), rejected_kg: round(lot.kg - acceptedKg, 1),
    revenue_inr: round(acceptedKg * (row?.price_inr_per_kg ?? 0), 0), co2_avoided_kg: round(co2, 1), updated_at: new Date(),
  });
  const expected = row?.expected_accepted_kg;
  await publish("UpcycleReceived", `${partner?.name ?? "Partner"} accepted ${round(acceptedKg, 0)} of ${round(lot.kg, 0)} kg${expected != null ? ` (AI expected ${round(expected, 0)} kg)` : ""}; rejects return to the default route`, { upcycle_lot_id: id });
  await publish("AITrainingDataCreated", `Upcycling feedback: partner acceptance updated for ${partner?.name ?? "partner"}`, { upcycle_lot_id: id, kind: "upcycle_acceptance" });
  return out;
}

export async function completeUpcycleLot(id: number, input: { products: string; units_made: number; revenue_inr?: number }) {
  const lot = await getLot(id);
  if (lot.status !== "received") throw new HttpError(409, "Record the partner receipt first");
  const out = await update<any>("upcycle_lots", id, { status: "upcycled", products: input.products, units_made: input.units_made, revenue_inr: input.revenue_inr ?? lot.revenue_inr, updated_at: new Date() });
  await publish("UpcycleCompleted", `${lot.code}: ${input.units_made} ${input.products} made from ${round(lot.accepted_kg, 0)} kg — ${round(lot.co2_avoided_kg, 0)} kg CO2e avoided`, { upcycle_lot_id: id });
  return out;
}

export async function listUpcycleLots() {
  return query(`SELECT l.*, h.code AS hub_code, s.code AS shipment_code, p.name AS partner_name FROM upcycle_lots l JOIN processing_hubs h ON h.id=l.hub_id
    LEFT JOIN shipments s ON s.id=l.shipment_id LEFT JOIN circular_partners p ON p.id=l.partner_id ORDER BY l.id DESC LIMIT 200`);
}

// ================================================================== BATTERIES
let reference: any = null;
export async function batteryReference() {
  reference ??= await ai.batteryReference();
  return reference;
}

/** Fade priors used for grading: literature value per chemistry, replaced by what deployed packs show. */
async function fadePriors(): Promise<Record<string, number>> {
  const learned = await getSetting<Record<string, any>>("battery_fade_learned", {});
  return Object.fromEntries(Object.entries(learned).map(([k, v]) => [k, v.posterior_fade]));
}

export async function createBatteryLot(input: { hub_id?: number; source_label: string; chemistry: string; unit_type: string; nominal_v: number; nominal_ah: number; unit_kg: number; unit_count: number; ir_ref_mohm?: number; preset?: string }, simulated = false) {
  const lot = await insert<any>("battery_lots", {
    code: await nextCode("battery_lots", "BL", 300), hub_id: input.hub_id ?? null, source_label: input.source_label, chemistry: input.chemistry,
    unit_type: input.unit_type, nominal_v: input.nominal_v, nominal_ah: input.nominal_ah, unit_kg: input.unit_kg, unit_count: input.unit_count,
    ir_ref_mohm: input.ir_ref_mohm ?? null, status: "received", is_simulated: simulated,
  });
  // One row per physical unit so every cell/module is traceable from intake to pack or recycler.
  const rows = Array.from({ length: input.unit_count }, (_, i) => `(${lot.id}, '${lot.code}-${String(i + 1).padStart(4, "0")}', '${input.chemistry}', ${Number(input.nominal_v)}, ${Number(input.nominal_ah)}, ${simulated})`);
  for (let i = 0; i < rows.length; i += 500) {
    await exec(`INSERT INTO battery_units (lot_id, serial, chemistry, nominal_v, nominal_ah, is_simulated) VALUES ${rows.slice(i, i + 500).join(",")}`);
  }
  await publish("BatteryLotReceived", `${lot.code}: ${input.unit_count} discarded ${input.chemistry.replace("_", "-")} ${input.unit_type}s received (${round(input.unit_count * input.unit_kg, 0)} kg)`, { battery_lot_id: lot.id });
  return lot;
}

type Reading = { serial: string; measured_ah: number; ir_mohm: number; voltage?: number; swelling?: boolean; leakage?: boolean };

/** Demo tester: realistic second-life spread for the lot's source (flagged is_simulated). */
function simulateReadings(lot: any, units: any[], refIr: number): Reading[] {
  const preset = Object.values(LOT_PRESETS).find((p) => p.chemistry === lot.chemistry && p.unit_type === lot.unit_type);
  const sim = preset?.sim ?? { soh_mu: 0.75, soh_sd: 0.1, swell: 0.02, deep: 0.03 };
  const r = rng(lot.id * 104729);
  const cellV = { li_nmc: 3.65, li_lfp: 3.2, lead_acid: 2.0 }[lot.chemistry as "li_nmc"] ?? 3.6;
  const cells = Math.max(1, Math.round(lot.nominal_v / cellV));
  return units.map((u) => {
    const soh = Math.min(1.02, Math.max(0.15, sim.soh_mu + sim.soh_sd * gaussian(r)));
    const deep = r() < sim.deep;
    return {
      serial: u.serial, measured_ah: round(lot.nominal_ah * soh, 3),
      ir_mohm: round(refIr * (1 + Math.max(0, 1 - soh) * 2.2) * (0.88 + r() * 0.3), 3),
      voltage: round(deep ? cells * cellV * (0.35 + r() * 0.2) : cells * cellV * (0.95 + r() * 0.1), 3),
      swelling: r() < sim.swell, leakage: lot.chemistry === "lead_acid" && r() < 0.02,
    };
  });
}

export async function testBatteryLot(lotId: number, opts: { simulate?: boolean; readings?: Reading[] }) {
  const lot = await one<any>("SELECT * FROM battery_lots WHERE id=$1", [lotId]);
  if (!lot) throw notFound("Battery lot");
  const units = await query<any>("SELECT * FROM battery_units WHERE lot_id=$1 AND status IN ('untested','graded') ORDER BY id", [lotId]);
  if (!units.length) throw new HttpError(409, "No units left to test in this lot");
  const refData = await batteryReference();
  const cellV = refData.chemistries[lot.chemistry].cell_v;
  const refIr = lot.ir_ref_mohm ?? (refData.chemistries[lot.chemistry].ir_k / lot.nominal_ah) * Math.max(1, Math.round(lot.nominal_v / cellV));
  let readings: Reading[];
  if (opts.simulate) readings = simulateReadings(lot, units, refIr);
  else {
    if (!opts.readings?.length) throw new HttpError(400, "readings required (or simulate=true in demo mode)");
    readings = opts.readings;
  }
  const bySerial = new Map(units.map((u) => [u.serial, u]));
  const measured = readings.filter((x) => bySerial.has(x.serial));
  if (!measured.length) throw new HttpError(400, "No reading matches a unit serial in this lot");
  const res = await ai.gradeBatteries({
    units: measured.map((m) => { const u = bySerial.get(m.serial); return { id: u.id, chemistry: lot.chemistry, nominal_v: lot.nominal_v, nominal_ah: lot.nominal_ah, measured_ah: m.measured_ah, ir_mohm: m.ir_mohm, voltage: m.voltage ?? null, swelling: !!m.swelling, leakage: !!m.leakage, ir_ref_mohm: refIr }; }),
    fade_priors: await fadePriors(),
  });
  const g = new Map<number, any>(res.units.map((x: any) => [x.id, x]));
  for (const m of measured) {
    const u = bySerial.get(m.serial);
    const x = g.get(u.id);
    await query(`UPDATE battery_units SET measured_ah=$2, ir_mohm=$3, voltage=$4, swelling=$5, leakage=$6, soh=$7, ir_ratio=$8, grade=$9, remaining_cycles=$10, fade_per_cycle=$11, reason=$12, status='graded', is_simulated=$13 WHERE id=$1`,
      [u.id, m.measured_ah, m.ir_mohm, m.voltage ?? null, !!m.swelling, !!m.leakage, x.soh, x.ir_ratio, x.grade, x.remaining_cycles, x.fade_per_cycle, x.reason, !!opts.simulate]);
  }
  await update("battery_lots", lotId, { status: "graded" });
  const c = res.counts;
  await publish("BatteriesGraded", `${lot.code}: ${measured.length} units tested — grade A ${c.A}, B ${c.B}, recycle ${c.R}`, { battery_lot_id: lotId });
  return { lot: await one("SELECT * FROM battery_lots WHERE id=$1", [lotId]), counts: c, policy: res.policy };
}

export async function designPack(input: { lot_ids: number[]; application: string; target_kwh?: number }) {
  const lots = await query<any>("SELECT * FROM battery_lots WHERE id = ANY($1::int[])", [input.lot_ids]);
  if (!lots.length) throw notFound("Battery lot");
  const chem = lots[0].chemistry;
  if (lots.some((l) => l.chemistry !== chem || Math.abs(l.nominal_v - lots[0].nominal_v) > 0.05)) throw new HttpError(400, "Selected lots must share chemistry and unit voltage");
  const units = await query<any>("SELECT * FROM battery_units WHERE lot_id = ANY($1::int[]) AND status='graded' AND grade IN ('A','B') ORDER BY id", [input.lot_ids]);
  if (!units.length) throw new HttpError(409, "No graded A/B units available — test the lot first");
  const d = await ai.designPack({
    units: units.map((u) => ({ id: u.id, chemistry: u.chemistry, nominal_v: u.nominal_v, nominal_ah: u.nominal_ah, measured_ah: u.measured_ah, ir_mohm: u.ir_mohm, soh: u.soh, grade: u.grade, fade_per_cycle: u.fade_per_cycle })),
    application: input.application, target_kwh: input.target_kwh ?? null,
  });
  const pack = await insert<any>("battery_packs", {
    code: await nextCode("battery_packs", "PK", 500), chemistry: chem, application: input.application, config: d.config, units_used: d.units_used,
    nominal_v: d.nominal_v, capacity_ah: d.capacity_ah, usable_kwh: d.usable_kwh, imbalance_pct: d.imbalance_pct, pack_soh: d.pack_soh,
    fade_pred: d.fade_per_cycle, predicted_cycles: d.predicted_cycles, design: { ...d, lot_ids: input.lot_ids }, status: "designed",
  });
  await publish("BatteryPackDesigned", `${pack.code}: ${d.config} ${d.chemistry_label} pack, ${d.usable_kwh} kWh usable from ${d.units_used} second-life units (imbalance ${d.imbalance_pct}% vs ${d.baseline_random.imbalance_pct}% unmatched)`, { pack_id: pack.id });
  return pack;
}

export async function assemblePack(id: number) {
  const pack = await one<any>("SELECT * FROM battery_packs WHERE id=$1", [id]);
  if (!pack) throw notFound("Pack");
  if (pack.status !== "designed") throw new HttpError(409, `Pack is ${pack.status}`);
  const ids: number[] = pack.design.groups.flatMap((g: any) => g.unit_ids);
  const free = await one<{ n: number }>("SELECT COUNT(*)::int AS n FROM battery_units WHERE id = ANY($1::int[]) AND status='graded'", [ids]);
  if (free?.n !== ids.length) throw new HttpError(409, "Some units are already in another pack — redesign the pack");
  await query("UPDATE battery_units SET status='in_pack', pack_id=$2 WHERE id = ANY($1::int[])", [ids, id]);
  const out = await update<any>("battery_packs", id, { status: "assembled" });
  await publish("BatteryPackAssembled", `${pack.code} assembled: ${pack.config}, ${pack.usable_kwh} kWh`, { pack_id: id });
  return out;
}

export async function deployPack(id: number, site: { site_name: string; lat: number; lng: number }) {
  const pack = await one<any>("SELECT * FROM battery_packs WHERE id=$1", [id]);
  if (!pack) throw notFound("Pack");
  if (pack.status !== "assembled") throw new HttpError(409, "Assemble the pack before deploying it");
  // Hidden truth for the demo simulator: real second-life fade is usually somewhat worse than predicted.
  const r = rng(id * 7907);
  const sim = { true_fade: pack.fade_pred * Math.exp(0.2 + 0.15 * gaussian(r)), soh_true: pack.pack_soh, seed: id };
  const out = await update<any>("battery_packs", id, { status: "deployed", site_name: site.site_name, lat: site.lat, lng: site.lng, deployed_at: new Date(), soh_now: pack.pack_soh, sim_params: sim });
  await publish("BatteryPackDeployed", `${pack.code} deployed at ${site.site_name}: ${pack.usable_kwh} kWh of second-life storage`, { pack_id: id });
  return out;
}

/** Demo pack telemetry (BMS readings) — fast-forwards `days` of operation. */
export async function simulatePackDays(id: number, days: number) {
  const pack = await one<any>("SELECT * FROM battery_packs WHERE id=$1", [id]);
  if (!pack) throw notFound("Pack");
  if (pack.status !== "deployed") throw new HttpError(409, "Only deployed packs report telemetry");
  const app = (await batteryReference()).applications[pack.application];
  const last = await one<any>("SELECT COUNT(*)::int AS n FROM pack_telemetry WHERE pack_id=$1", [id]);
  const sim = { ...pack.sim_params };
  const r = rng(sim.seed * 31 + (last?.n ?? 0));
  let cycles = pack.cycles;
  let delivered = 0;
  const start = new Date(pack.deployed_at);
  const rows: string[] = [];
  for (let i = 0; i < days; i++) {
    const c = app.cycles_per_day * (0.8 + r() * 0.25);
    const solar = pack.application.includes("solar") || pack.application.includes("street") ? 0.75 + r() * 0.25 : 0.9 + r() * 0.1;
    sim.soh_true -= sim.true_fade * c;
    cycles += c;
    const kwh = pack.usable_kwh * (sim.soh_true / pack.pack_soh) * c * solar;
    delivered += kwh;
    const day = new Date(start.getTime() + ((last?.n ?? 0) + i) * 86_400_000).toISOString().slice(0, 10);
    rows.push(`(${id}, '${day}', ${round(kwh, 4)}, ${round(cycles, 3)}, ${round(sim.soh_true + 0.002 * gaussian(r), 5)}, true)`);
  }
  for (let i = 0; i < rows.length; i += 500) await exec(`INSERT INTO pack_telemetry (pack_id, day, discharged_kwh, cycles_cum, soh, is_simulated) VALUES ${rows.slice(i, i + 500).join(",")}`);
  await update("battery_packs", id, { cycles: round(cycles, 3), soh_now: round(sim.soh_true, 5), delivered_kwh: round(pack.delivered_kwh + delivered, 3), sim_params: sim });
  await publish("BatteryTelemetry", `${pack.code}: ${days} days of BMS telemetry — ${round(delivered, 1)} kWh delivered, SoH ${(sim.soh_true * 100).toFixed(1)}%`, { pack_id: id });
  return learnFade(pack.chemistry);
}

/** Feedback: observed fade of every deployed pack (one chemistry) → posterior fade used in future grading. */
export async function learnFade(chemistry: string) {
  const ref = await batteryReference();
  const packs = await query<any>("SELECT id, fade_pred FROM battery_packs WHERE chemistry=$1 AND status IN ('deployed','retired')", [chemistry]);
  const withPts = [];
  for (const p of packs) {
    const pts = await query<any>("SELECT cycles_cum AS cycles, soh FROM pack_telemetry WHERE pack_id=$1 ORDER BY day", [p.id]);
    const pack = await one<any>("SELECT pack_soh FROM battery_packs WHERE id=$1", [p.id]);
    withPts.push({ id: p.id, predicted_fade: p.fade_pred, points: [{ cycles: 0, soh: pack.pack_soh }, ...pts] });
  }
  // Always from the literature prior + ALL telemetry, so repeated learning never double-counts.
  const res = await ai.updateFade({ chemistry, prior_fade: ref.chemistries[chemistry].fade, prior_n: 5, packs: withPts });
  for (const p of res.packs) await update("battery_packs", p.id, { fade_observed: p.observed_fade });
  const learned = await getSetting<Record<string, any>>("battery_fade_learned", {});
  learned[chemistry] = { ...res, updated_at: new Date().toISOString() };
  await setSetting("battery_fade_learned", learned);
  if (res.packs.length) await publish("BatteryFadeUpdated", `${chemistry.replace("_", "-")} fade prior updated from ${res.packs.length} pack(s): ${res.prior_fade.toExponential(2)} → ${res.posterior_fade.toExponential(2)} per cycle (${res.change_pct > 0 ? "+" : ""}${res.change_pct}%)`, { chemistry });
  return res;
}

export async function recycleRejects(lotId: number) {
  const lot = await one<any>("SELECT * FROM battery_lots WHERE id=$1", [lotId]);
  if (!lot) throw notFound("Battery lot");
  const rejects = await query<any>("SELECT id FROM battery_units WHERE lot_id=$1 AND status='graded' AND grade='R'", [lotId]);
  if (!rejects.length) throw new HttpError(409, "No grade-R units waiting in this lot");
  const hub = lot.hub_id ? await one<any>("SELECT * FROM processing_hubs WHERE id=$1", [lot.hub_id]) : null;
  const recyclers = await partnerCandidates(hub ?? { lat: 28.61, lng: 77.21 }, "battery_recycler");
  const partner = recyclers.sort((a, b) => a.distance_km - b.distance_km)[0];
  const kg = rejects.length * lot.unit_kg;
  const ref = await batteryReference();
  const recovered = Object.entries(ref.chemistries[lot.chemistry].recovery as Record<string, number>).map(([material, f]) => ({ material, kg: round(kg * f, 1) }));
  await query("UPDATE battery_units SET status='to_recycling' WHERE id = ANY($1::int[])", [rejects.map((r) => r.id)]);
  const rec = await insert<any>("battery_recycling", { code: await nextCode("battery_recycling", "BR", 100), lot_id: lotId, partner_id: partner?.id ?? null, chemistry: lot.chemistry, units: rejects.length, kg: round(kg, 1), recovered });
  const left = await one<{ n: number }>("SELECT COUNT(*)::int AS n FROM battery_units WHERE lot_id=$1 AND status IN ('untested')", [lotId]);
  if (!left?.n) await update("battery_lots", lotId, { status: "processed" });
  await publish("BatteriesSentToRecycling", `${rejects.length} unusable units (${round(kg, 0)} kg) from ${lot.code} sent to ${partner?.name ?? "authorised recycler"} for material recovery`, { battery_lot_id: lotId });
  return rec;
}

export async function circularSummary() {
  const up = await one<any>(`SELECT COUNT(*)::int AS lots, COALESCE(SUM(kg),0) AS kg, COALESCE(SUM(accepted_kg),0) AS accepted_kg, COALESCE(SUM(co2_avoided_kg),0) AS co2,
      COALESCE(SUM(revenue_inr),0) AS revenue, COALESCE(SUM(units_made),0)::int AS units FROM upcycle_lots WHERE status<>'fallback'`);
  const units = await query<any>("SELECT grade, status, COUNT(*)::int AS n FROM battery_units GROUP BY grade, status");
  const packs = await one<any>(`SELECT COUNT(*)::int AS n, COALESCE(SUM(usable_kwh) FILTER (WHERE status='deployed'),0) AS deployed_kwh,
      COALESCE(SUM(delivered_kwh),0) AS delivered_kwh, COUNT(*) FILTER (WHERE status='deployed')::int AS deployed,
      COALESCE(SUM((design->'co2_avoided_kg'->>'manufacturing')::float) FILTER (WHERE status IN ('assembled','deployed')),0) AS co2_mfg FROM battery_packs`);
  const recycled = await one<any>("SELECT COALESCE(SUM(kg),0) AS kg, COALESCE(SUM(units),0)::int AS units FROM battery_recycling");
  const rec = await one<any>(`SELECT COALESCE(SUM((recyclability->>'recyclable_kg')::float),0) AS recyclable_kg, COALESCE(SUM((recyclability->>'non_recyclable_kg')::float),0) AS non_recyclable_kg
      FROM waste_classifications WHERE status<>'rejected' AND recyclability IS NOT NULL AND created_at > now() - interval '30 days'`);
  const tested = units.filter((u) => u.grade).reduce((a, u) => a + u.n, 0);
  const grade = (g: string) => units.filter((u) => u.grade === g).reduce((a, u) => a + u.n, 0);
  return {
    recyclability_30d: { recyclable_kg: round(rec.recyclable_kg, 0), non_recyclable_kg: round(rec.non_recyclable_kg, 0) },
    upcycling: { lots: up.lots, kg: round(up.kg, 0), accepted_kg: round(up.accepted_kg, 0), co2_avoided_kg: round(up.co2, 0), revenue_inr: round(up.revenue, 0), units_made: up.units },
    batteries: {
      units_total: units.reduce((a, u) => a + u.n, 0), tested, grade_a: grade("A"), grade_b: grade("B"), grade_r: grade("R"),
      packs: packs.n, deployed: packs.deployed, deployed_kwh: round(packs.deployed_kwh, 2), delivered_kwh: round(packs.delivered_kwh, 1),
      co2_mfg_avoided_kg: round(packs.co2_mfg, 0), recycled_kg: round(recycled.kg, 0), recycled_units: recycled.units,
      fade_learned: await getSetting("battery_fade_learned", {}),
    },
  };
}
