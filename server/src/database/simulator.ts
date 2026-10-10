/**
 * DEMO-MODE PHYSICAL SIMULATOR (calibrated to real Delhi data)
 * ------------------------------------------------------------
 * There are no live meters or trucks in the hackathon environment, so this module
 * generates the day-to-day records. It is CALIBRATED to published Delhi figures
 * (realdata/delhi.ts): each WtE plant's average output equals its published
 * MW ÷ TPD, waste composition centres on MCD's 40% biodegradable share, and each
 * zone's daily tonnage centres on its published TPD.
 *
 * The ML models never see these formulas — only the records written to the DB.
 * Every generated row is flagged `is_simulated = true` and labelled in the UI.
 */
import { LHV_KWH_PER_KG, DELHI_COMPOSITION, AD_KWH_PER_KG } from "./realdata/delhi.ts";

export type Stream = "organic" | "plastic" | "paper" | "metal" | "other";
export const STREAMS: Stream[] = ["organic", "plastic", "paper", "metal", "other"];

export type Technology =
  | "anaerobic_digestion"
  | "combustion"
  | "landfill"
  | "landfill_gas"
  | "rdf_coprocessing"
  | "pyrolysis"
  | "material_recovery";

/**
 * Energy content available to each technology (kWh per wet kg).
 * Combustion: stream LHV — the plant's electrical efficiency (sim.trueFactor) converts it to kWh_e.
 * Anaerobic digestion: kWh_e per kg of segregated organics (Indian plant data) — trueFactor ≈ 1.
 */
export const POTENTIAL_KWH_PER_KG: Record<Stream, Partial<Record<Technology, number>>> = {
  organic: { anaerobic_digestion: AD_KWH_PER_KG, combustion: LHV_KWH_PER_KG.organic },
  plastic: { combustion: LHV_KWH_PER_KG.plastic },
  paper: { combustion: LHV_KWH_PER_KG.paper, material_recovery: 0 },
  metal: { material_recovery: 0 },
  other: { combustion: LHV_KWH_PER_KG.other },
};

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
  /** plant conversion factor: electrical efficiency for WtE (from published MW ÷ TPD), ~1 for AD; unknown to the ML */
  trueFactor: number;
  /** relative noise of daily performance */
  noise: number;
  /** optimal moisture for this process */
  optimalMoisture: number;
}

function moistureAdjust(tech: Technology, moisture: number, optimal: number) {
  if (tech === "anaerobic_digestion") return Math.max(0.55, 1 - 0.9 * Math.abs(moisture - optimal));
  // LHV is already "as received"; only moisture well above the plant's typical feed costs extra drying energy.
  if (tech === "combustion" || tech === "rdf_coprocessing" || tech === "pyrolysis") return Math.max(0.6, 1 - 0.8 * Math.max(0, moisture - optimal));
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
  const load = opts.utilization > 0.95 ? 1 - (opts.utilization - 0.95) * 1.5 : 1; // overloaded plants lose a little output
  const m = moistureAdjust(opts.technology, opts.moisture, opts.sim.optimalMoisture);
  const noise = 1 + gaussian(opts.r) * opts.sim.noise;
  return Math.max(0, opts.kg * potential * opts.sim.trueFactor * m * load * noise);
}

/** Composition prior by source type. `municipal` = Delhi MSW (MCD 40% biodegradable; national recyclables split). */
export const BUSINESS_COMPOSITION: Record<string, Record<Stream, number>> = {
  municipal: { ...DELHI_COMPOSITION },
};

/** Typical moisture of Delhi mixed MSW (as collected). */
export const BUSINESS_MOISTURE: Record<string, number> = { municipal: 0.5 };

/** Draw a noisy composition around a business-type prior, then normalise. */
export function sampleComposition(mix: { business_type: string; kg: number }[], monthIdx: number, r: () => number) {
  const total = mix.reduce((s, m) => s + m.kg, 0) || 1;
  const base: Record<Stream, number> = { organic: 0, plastic: 0, paper: 0, metal: 0, other: 0 };
  for (const m of mix) {
    const prior = BUSINESS_COMPOSITION[m.business_type] ?? BUSINESS_COMPOSITION.municipal;
    for (const s of STREAMS) base[s] += (prior[s] * m.kg) / total;
  }
  // Seasonality (demo assumption): monsoon raises the organic share a little; festive season (Oct–Nov) raises packaging.
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
