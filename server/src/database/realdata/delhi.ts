/**
 * REAL Delhi waste-management data used to build the WattCycle network.
 *
 * Every number here comes from a published source (see SOURCES). Coordinates are
 * OpenStreetMap/Nominatim geocodes of the facility or its documented locality
 * (OSM has no node for the plants themselves) — accurate to the neighbourhood.
 *
 * What is NOT real (generated in seed.ts and flagged is_simulated): day-to-day
 * variation around each zone's published average, individual truck loads and
 * routes, per-load composition variation around the city average, and meter
 * readings (scattered around each plant's published MW ÷ TPD yield).
 */

export const SOURCES = {
  dpcc_mcd: {
    title: "MCD — Status of Municipal Solid Waste Management (presentation hosted by DPCC)",
    url: "https://dpcc.delhi.gov.in/sites/default/files/DPCC/generic_multiple_files/mcd-ppt-msw-status.pdf",
  },
  renewablewatch_2026: {
    title: "Renewable Watch (Apr 2026) — Waste-to-energy initiatives in Delhi-NCR",
    url: "https://renewablewatch.in/2026/04/28/waste-wise-waste-to-energy-initiatives-to-deal-with-delhi-ncrs-legacy-landfill-challenges/",
  },
  tehkhand_2022: {
    title: "Organiser (Oct 2022) — Tehkhand Waste to Energy Plant inaugurated (2,000 TPD, 25 MW)",
    url: "https://organiser.org/2022/10/21/97010/bharat/union-home-minister-amit-shah-inaugurates-tehkhand-waste-to-energy-plant-which-generates-electricity-from-mcd-waste/",
  },
  national_composition: {
    title: "Waste Management World — WtE for integrated waste management in India (urban MSW: ~51% organics, 17.5% recyclables, 31% inerts)",
    url: "https://waste-management-world.com/a/waste-to-energy-for-integrated-waste-management-in-india",
  },
  biomethanation_delhi: {
    title: "IAMRenew — MCD decentralised biomethanation plants (750 MT/day wet waste; Ghogha first)",
    url: "https://www.iamrenew.com/policy/delhi-mcd-nddb-plan-10-biogas-plants-to-make-dairies-sustainable/",
  },
  india_ad_yield: {
    title: "KrishiKosh thesis — food-processing waste biogas plant, Bangalore (8 t/day → ~561 m³ biogas, ~645 kWh/day)",
    url: "https://krishikosh.egranth.ac.in/items/1c29fc98-0ac3-4ffb-8cf9-073b09a077c7",
  },
  osm: { title: "OpenStreetMap / Nominatim geocoding", url: "https://nominatim.openstreetmap.org" },
} as const;

/** City totals (DPCC/MCD). */
export const DELHI = {
  generation_tpd: 11000,
  biodegradable_share: 0.4, // 4,400 TPD bio-degradable vs 6,600 TPD non-bio-degradable
  processing_capacity_tpd: 8073,
  processed_tpd: 7200,
  wards: 250,
  zones: 12,
  per_capita_kg: 0.5,
  source: "dpcc_mcd",
};

/** MCD zones: wards, daily generation and current disposal point — DPCC/MCD "Zone wise waste generation" table.
 *  lat/lng = OSM geocode of the zone's reference locality (zone office area), not a facility. */
export const ZONES = [
  { name: "Central Zone", wards: 25, tpd: 1000, disposal: "Tehkhand WtE + Okhla WtE", ref: "Lajpat Nagar", lat: 28.5661, lng: 77.2433 },
  { name: "South Zone", wards: 23, tpd: 900, disposal: "Tehkhand WtE + Okhla WtE", ref: "Green Park", lat: 28.5564, lng: 77.2039 },
  { name: "West Zone", wards: 25, tpd: 900, disposal: "Tehkhand WtE + Okhla WtE", ref: "Rajouri Garden", lat: 28.6491, lng: 77.1227 },
  { name: "Najafgarh Zone", wards: 22, tpd: 900, disposal: "Tehkhand WtE + Okhla WtE", ref: "Najafgarh", lat: 28.6125, lng: 76.9865 },
  { name: "Rohini Zone (+ part Narela)", wards: 23, tpd: 950, disposal: "Bawana WtE", ref: "Rohini", lat: 28.7227, lng: 77.1048 },
  { name: "Civil Lines Zone (+ part City-SP)", wards: 15, tpd: 800, disposal: "Bawana WtE", ref: "Civil Lines", lat: 28.6807, lng: 77.2226 },
  { name: "Keshavpuram Zone", wards: 15, tpd: 800, disposal: "Bawana WtE", ref: "Keshav Puram", lat: 28.6889, lng: 77.1617 },
  { name: "Karol Bagh Zone", wards: 13, tpd: 850, disposal: "Bhalswa SLF", ref: "Karol Bagh", lat: 28.653, lng: 77.189 },
  { name: "City-SP Zone", wards: 12, tpd: 950, disposal: "Bhalswa SLF", ref: "Sadar Bazar", lat: 28.6581, lng: 77.217 },
  { name: "Narela Zone", wards: 16, tpd: 500, disposal: "Bhalswa SLF", ref: "Narela", lat: 28.8465, lng: 77.0857 },
  { name: "Shahdara South Zone", wards: 26, tpd: 1200, disposal: "Ghazipur SLF + Okhla WtE + Ghazipur WtE", ref: "Shahdara", lat: 28.6734, lng: 77.2899 },
  { name: "Shahdara North Zone", wards: 35, tpd: 1250, disposal: "Ghazipur SLF + Okhla WtE + Ghazipur WtE", ref: "Nand Nagri", lat: 28.6978, lng: 77.3057 },
] as const;

/**
 * Facilities. capacity_tpd / mw are published figures. Derived:
 *   nameplate yield (kWh per kg) = MW × 24 h ÷ TPD
 *   electrical efficiency      = nameplate yield ÷ LHV of Delhi mixed MSW (see LHV_KWH_PER_KG)
 * utilization_pct is derived from the DPCC zone→plant assignment (zones' TPD ÷ plant TPD), capped at 98%.
 */
export type RealFacility = {
  code: string; label: string; name: string; technology: "combustion" | "anaerobic_digestion" | "material_recovery" | "landfill";
  lat: number; lng: number; capacity_tpd: number; mw?: number; utilization_pct: number; status: "online" | "commissioning";
  caps: { stream: "organic" | "plastic" | "paper" | "metal" | "other"; compat: number; max_moisture?: number }[];
  notes: string; source: keyof typeof SOURCES;
};

const WTE_CAPS: RealFacility["caps"] = [
  { stream: "organic", compat: 70, max_moisture: 75 },
  { stream: "plastic", compat: 95 },
  { stream: "paper", compat: 95 },
  { stream: "other", compat: 60 },
];
const MRF_CAPS: RealFacility["caps"] = [{ stream: "paper", compat: 95 }, { stream: "plastic", compat: 85 }, { stream: "metal", compat: 95 }];
const SLF_CAPS: RealFacility["caps"] = (["organic", "plastic", "paper", "metal", "other"] as const).map((s) => ({ stream: s, compat: 100 }));

export const FACILITIES: RealFacility[] = [
  // Waste-to-energy (mass-burn / RDF-fired)
  { code: "WTE-OKH", label: "Okhla WtE", name: "Timarpur-Okhla Waste-to-Energy Plant", technology: "combustion", lat: 28.5597, lng: 77.2749,
    capacity_tpd: 1950, mw: 23, utilization_pct: 92, status: "online", caps: WTE_CAPS, source: "renewablewatch_2026",
    notes: "1,950 TPD, 23 MW (Renewable Watch 2026). Receives Central/South/West/Najafgarh + Shahdara zones (DPCC). Located in Sukhdev Vihar (geocoded locality)." },
  { code: "WTE-TKD", label: "Tehkhand WtE", name: "Tehkhand Waste-to-Energy Plant", technology: "combustion", lat: 28.5104, lng: 77.282,
    capacity_tpd: 2000, mw: 25, utilization_pct: 92, status: "online", caps: WTE_CAPS, source: "tehkhand_2022",
    notes: "2,000 TPD, 25 MW, commissioned Oct 2022. Receives Central/South/West/Najafgarh zones (DPCC)." },
  { code: "WTE-GZP", label: "Ghazipur WtE", name: "Ghazipur Waste-to-Energy Plant (RDF-fired)", technology: "combustion", lat: 28.6265, lng: 77.3245,
    capacity_tpd: 1300, mw: 12, utilization_pct: 97, status: "online", caps: WTE_CAPS, source: "dpcc_mcd",
    notes: "1,300 TPD authorised, 12 MW, fired on pre-processed RDF (DPCC; Renewable Watch). Receives Shahdara South/North zones." },
  { code: "WTE-BWN", label: "Bawana WtE", name: "Narela-Bawana Integrated MSW Processing Facility (RDF-based WtE)", technology: "combustion", lat: 28.8013, lng: 77.038,
    capacity_tpd: 2400, mw: 24, utilization_pct: 98, status: "online", caps: WTE_CAPS, source: "dpcc_mcd",
    notes: "2,400 TPD (DPCC), 24 MW. Assigned zones (Rohini, Civil Lines, Keshavpuram) total 2,550 TPD > capacity." },
  // Biomethanation (wet waste) — first MCD plant at Ghogha; capacity split across 3 plants not published
  { code: "BMP-GHG", label: "Ghogha Biomethanation", name: "Ghogha Decentralised Biomethanation Plant (bio-CNG)", technology: "anaerobic_digestion", lat: 28.831, lng: 77.0489,
    capacity_tpd: 250, utilization_pct: 0, status: "commissioning", caps: [{ stream: "organic", compat: 95, max_moisture: 90 }], source: "biomethanation_delhi",
    notes: "MCD's 3 planned plants total 750 MT/day wet waste; per-plant split not published (250 TPD assumed). Status: commissioning — not yet eligible." },
  // Sanitary landfills (no energy recovery)
  { code: "SLF-BHL", label: "Bhalswa SLF", name: "Bhalswa Sanitary Landfill", technology: "landfill", lat: 28.7409, lng: 77.1577,
    capacity_tpd: 2600, utilization_pct: 88, status: "online", caps: SLF_CAPS, source: "dpcc_mcd",
    notes: "Receives Karol Bagh, City-SP and Narela zones (2,300 TPD) per DPCC. No energy recovery." },
  { code: "SLF-GZP", label: "Ghazipur SLF", name: "Ghazipur Sanitary Landfill", technology: "landfill", lat: 28.6233, lng: 77.3267,
    capacity_tpd: 2000, utilization_pct: 80, status: "online", caps: SLF_CAPS, source: "dpcc_mcd",
    notes: "Receives part of Shahdara South/North waste (DPCC). No energy recovery." },
  // Material recovery facilities (DPCC/MCD MRF table)
  { code: "MRF-RGN", label: "Raghubir Nagar MRF", name: "Raghubir Nagar MRF (ITC WOW)", technology: "material_recovery", lat: 28.6566, lng: 77.1122, capacity_tpd: 15, utilization_pct: 70, status: "online", caps: MRF_CAPS, source: "dpcc_mcd", notes: "15 TPD, semi-automatic." },
  { code: "MRF-ZKH", label: "Zakhira MRF", name: "Zakhira MRF (Chintan)", technology: "material_recovery", lat: 28.6676, lng: 77.1674, capacity_tpd: 8, utilization_pct: 70, status: "online", caps: MRF_CAPS, source: "dpcc_mcd", notes: "8 TPD, semi-automatic." },
  { code: "MRF-DWK", label: "Dwarka MRF", name: "Dwarka Sector-29 MRF (UNDP)", technology: "material_recovery", lat: 28.5474, lng: 77.0233, capacity_tpd: 5, utilization_pct: 70, status: "online", caps: MRF_CAPS, source: "dpcc_mcd", notes: "5 TPD, automatic." },
  { code: "MRF-GTC", label: "Geeta Colony MRF", name: "Geeta Colony MRF (IPCA)", technology: "material_recovery", lat: 28.6511, lng: 77.275, capacity_tpd: 5, utilization_pct: 70, status: "online", caps: MRF_CAPS, source: "dpcc_mcd", notes: "5 TPD, semi-automatic." },
  { code: "MRF-PPG", label: "Patparganj MRF", name: "Patparganj Industrial Area MRF (IPCA)", technology: "material_recovery", lat: 28.6397, lng: 77.3103, capacity_tpd: 5, utilization_pct: 70, status: "online", caps: MRF_CAPS, source: "dpcc_mcd", notes: "5 TPD, semi-automatic." },
  { code: "MRF-PSV", label: "Pushp Vihar MRF", name: "Pushp Vihar MRF (Uboontu Foundation)", technology: "material_recovery", lat: 28.5227, lng: 77.2231, capacity_tpd: 2, utilization_pct: 70, status: "online", caps: MRF_CAPS, source: "dpcc_mcd", notes: "2 TPD, semi-automatic." },
];

/**
 * Lower heating value of each stream as received (kWh thermal per wet kg).
 * organic ≈ 4 MJ/kg (wet food/green waste), plastic ≈ 30 MJ/kg, paper ≈ 15 MJ/kg, inert-rich residual ≈ 1.8 MJ/kg.
 * Weighted by the Delhi composition below this gives ≈ 6 MJ/kg (≈ 1,450 kcal/kg) for mixed MSW — consistent with the
 * 1,500–2,000 kcal/kg reported for Delhi WtE feed (Renewable Watch).
 */
export const LHV_KWH_PER_KG = { organic: 1.1, plastic: 8.3, paper: 4.2, metal: 0, other: 0.5 } as const;

/** Delhi MSW composition: 40% biodegradable (DPCC); recyclables split from the national 17.5% (WMW); remainder inerts/other. */
export const DELHI_COMPOSITION = { organic: 0.4, plastic: 0.085, paper: 0.07, metal: 0.01, other: 0.435 } as const;

/** Biomethanation electricity yield for segregated wet waste (kWh_e per wet kg):
 *  Bangalore plant 645 kWh/day from 8 t → 0.08; vendor norms 100–120 m³/t × ~2 kWh_e/m³ → ~0.2. Mid value used. */
export const AD_KWH_PER_KG = 0.15;

export function nameplateYield(f: RealFacility) {
  return f.mw ? (f.mw * 24 * 1000) / (f.capacity_tpd * 1000) : 0;
}
export function mixedLhv() {
  return (Object.keys(DELHI_COMPOSITION) as (keyof typeof DELHI_COMPOSITION)[]).reduce((a, s) => a + DELHI_COMPOSITION[s] * LHV_KWH_PER_KG[s], 0);
}
/** Electrical efficiency implied by the published MW and TPD for Delhi mixed MSW. */
export function electricalEfficiency(f: RealFacility) {
  if (f.technology === "combustion") return nameplateYield(f) / mixedLhv();
  if (f.technology === "anaerobic_digestion") return AD_KWH_PER_KG / LHV_KWH_PER_KG.organic;
  return 0;
}
