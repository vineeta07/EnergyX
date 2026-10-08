/**
 * DEMO-MODE PHYSICAL SIMULATOR
 * ----------------------------
 * WattCycle has no physical trucks or plants in the hackathon environment, so
 * this module stands in for the real world: it generates historical records
 * and plays the role of facility energy meters.
 *
 * The ML models in the Python AI service NEVER see these formulas. They only
 * see the records this simulator writes to the database — exactly as they would
 * only see meter readings from real facilities. Every row it produces is
 * flagged `is_simulated = true` and labelled "SIMULATED" in the UI.
 *
 * Reference ranges used to keep the simulated physics plausible:
 *  - Food-waste AD: ~100–150 m³ biogas / t wet, ~6 kWh/m³ (60% CH4) → after CHP
 *    electrical + recovered heat ≈ 0.4–0.55 kWh useful per kg wet waste.
 *  - Mixed-plastic RDF co-processing: LHV ~25–35 MJ/kg.
 */

export type Stream = "organic" | "plastic" | "paper" | "metal" | "other";
export const STREAMS: Stream[] = ["organic", "plastic", "paper", "metal", "other"];

export type Technology =
  | "anaerobic_digestion"
  | "combustion"
  | "landfill_gas"
  | "rdf_coprocessing"
  | "pyrolysis"
  | "material_recovery";

/** Ideal useful-energy potential (kWh per wet kg) of a stream through a technology at 100% efficiency. */
export const POTENTIAL_KWH_PER_KG: Record<Stream, Partial<Record<Technology, number>>> = {
  organic: { anaerobic_digestion: 0.5, combustion: 0.33, landfill_gas: 0.15 },
  plastic: { rdf_coprocessing: 1.9, pyrolysis: 1.6, combustion: 1.5 },
  paper: { combustion: 0.9, material_recovery: 0 },
  metal: { material_recovery: 0 },
  other: { combustion: 0.35, landfill_gas: 0.05 },
};

export const BIOGAS_M3_PER_KWH = 1 / 2.15; // CHP useful kWh per m³ biogas (elec+heat recovered)

// Deterministic PRNG so seeding is reproducible.
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function gaussian(r: () => number) {
  const u = Math.max(r(), 1e-9);
  const v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export interface FacilitySimParams {
  /** hidden "true" conversion factor of this plant (efficiency × feedstock match), unknown to the ML */
  trueFactor: number;
  /** relative noise of daily performance */
  noise: number;
  /** optimal moisture for this process */
  optimalMoisture: number;
}

function moistureAdjust(tech: Technology, moisture: number, optimal: number) {
  if (tech === "anaerobic_digestion") return Math.max(0.55, 1 - 0.9 * Math.abs(moisture - optimal));
  if (tech === "combustion" || tech === "rdf_coprocessing" || tech === "pyrolysis") return Math.max(0.45, 1 - 1.1 * Math.max(0, moisture - optimal));
  return 1;
}

/** Simulated facility meter: what a plant would actually produce from a batch. */
export function simulateEnergy(opts: {
  stream: Stream;
  technology: Technology;
  kg: number;
  moisture: number; // 0..1
  sim: FacilitySimParams;
  utilization: number; // 0..1 — overloaded plants underperform
  r: () => number;
}): number {
  const potential = POTENTIAL_KWH_PER_KG[opts.stream][opts.technology] ?? 0;
  if (potential === 0) return 0;
  const load = opts.utilization > 0.85 ? 1 - (opts.utilization - 0.85) * 0.8 : 1;
  const m = moistureAdjust(opts.technology, opts.moisture, opts.sim.optimalMoisture);
  const noise = 1 + gaussian(opts.r) * opts.sim.noise;
  return Math.max(0, opts.kg * potential * opts.sim.trueFactor * m * load * noise);
}

/** Typical composition (fractions) of waste by business type — used to synthesise lab audits. */
export const BUSINESS_COMPOSITION: Record<string, Record<Stream, number>> = {
  restaurant: { organic: 0.68, plastic: 0.15, paper: 0.1, metal: 0.04, other: 0.03 },
  hotel: { organic: 0.55, plastic: 0.2, paper: 0.15, metal: 0.05, other: 0.05 },
  market: { organic: 0.78, plastic: 0.1, paper: 0.06, metal: 0.02, other: 0.04 },
  food_processing: { organic: 0.82, plastic: 0.08, paper: 0.06, metal: 0.02, other: 0.02 },
  agriculture: { organic: 0.9, plastic: 0.04, paper: 0.02, metal: 0.01, other: 0.03 },
  manufacturing: { organic: 0.12, plastic: 0.38, paper: 0.25, metal: 0.15, other: 0.1 },
  municipal: { organic: 0.48, plastic: 0.2, paper: 0.14, metal: 0.05, other: 0.13 },
};

export const BUSINESS_MOISTURE: Record<string, number> = {
  restaurant: 0.74, hotel: 0.68, market: 0.79, food_processing: 0.8, agriculture: 0.62, manufacturing: 0.22, municipal: 0.55,
};

/** Draw a noisy composition around a business-type prior, then normalise. */
export function sampleComposition(mix: { business_type: string; kg: number }[], monthIdx: number, r: () => number) {
  const total = mix.reduce((s, m) => s + m.kg, 0) || 1;
  const base: Record<Stream, number> = { organic: 0, plastic: 0, paper: 0, metal: 0, other: 0 };
  for (const m of mix) {
    const prior = BUSINESS_COMPOSITION[m.business_type] ?? BUSINESS_COMPOSITION.municipal;
    for (const s of STREAMS) base[s] += (prior[s] * m.kg) / total;
  }
  // Seasonality: monsoon (Jul–Sep) raises organic share slightly; festival season (Oct–Nov) raises packaging.
  if (monthIdx >= 6 && monthIdx <= 8) base.organic *= 1.05;
  if (monthIdx >= 9 && monthIdx <= 10) base.plastic *= 1.12;
  for (const s of STREAMS) base[s] = Math.max(0.005, base[s] * (1 + gaussian(r) * 0.12));
  const sum = STREAMS.reduce((a, s) => a + base[s], 0);
  for (const s of STREAMS) base[s] = base[s] / sum;
  return base;
}

export function sampleMoisture(mix: { business_type: string; kg: number }[], monthIdx: number, r: () => number) {
  const total = mix.reduce((s, m) => s + m.kg, 0) || 1;
  let m = mix.reduce((s, x) => s + (BUSINESS_MOISTURE[x.business_type] ?? 0.55) * x.kg, 0) / total;
  if (monthIdx >= 6 && monthIdx <= 8) m += 0.04; // monsoon
  return Math.min(0.92, Math.max(0.1, m + gaussian(r) * 0.04));
}
