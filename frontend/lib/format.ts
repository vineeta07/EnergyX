export const STREAM_COLOR: Record<string, string> = {
  organic: "var(--s-organic)",
  plastic: "var(--s-plastic)",
  paper: "var(--s-paper)",
  metal: "var(--s-metal)",
  other: "var(--s-other)",
};
// Hex copies for canvas/WebGL consumers (MapLibre) that cannot read CSS vars.
export const STREAM_HEX: Record<string, string> = {
  organic: "#1ea85e", plastic: "#1795b8", paper: "#c4860f", metal: "#8b6ff0", other: "#d9579c",
};
export const STREAMS = ["organic", "plastic", "paper", "metal", "other"] as const;
export const STREAM_LABEL: Record<string, string> = { organic: "Organic", plastic: "Plastic", paper: "Paper", metal: "Metal", other: "Other" };

export const TECH_LABEL: Record<string, string> = {
  anaerobic_digestion: "Anaerobic Digestion",
  combustion: "Biomass Combustion",
  landfill_gas: "Landfill Gas",
  rdf_coprocessing: "RDF Co-processing",
  pyrolysis: "Pyrolysis",
  material_recovery: "Material Recovery",
};

export const BUSINESS_LABEL: Record<string, string> = {
  restaurant: "Restaurant", hotel: "Hotel", market: "Market", food_processing: "Food processing",
  agriculture: "Agriculture", manufacturing: "Manufacturing", municipal: "Municipal",
};

export function n(v: number | null | undefined, digits = 0) {
  if (v == null || Number.isNaN(v)) return "—";
  return Number(v).toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}
export function kg(v: number | null | undefined) {
  if (v == null) return "—";
  return Math.abs(v) >= 10_000 ? `${n(v / 1000, 1)} t` : `${n(v)} kg`;
}
export function kwh(v: number | null | undefined) {
  if (v == null) return "—";
  return Math.abs(v) >= 100_000 ? `${n(v / 1000, 1)} MWh` : `${n(v)} kWh`;
}
export function inr(v: number | null | undefined) {
  return v == null ? "—" : `₹${n(v)}`;
}
export function pct(v: number | null | undefined, digits = 0) {
  return v == null ? "—" : `${n(v, digits)}%`;
}
export function time(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
}
export function dateTime(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}
export function ago(d: string | Date | null | undefined) {
  if (!d) return "—";
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 0) return `in ${Math.round(-s / 60)} min`;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
export const cx = (...c: (string | false | null | undefined | 0)[]) => c.filter(Boolean).join(" ");
