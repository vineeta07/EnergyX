import { t, currentLocale } from "@/lib/i18n";

export const STREAM_COLOR: Record<string, string> = {
  organic: "var(--s-organic)",
  plastic: "var(--s-plastic)",
  paper: "var(--s-paper)",
  metal: "var(--s-metal)",
  other: "var(--s-other)",
};
export const STREAMS = ["organic", "plastic", "paper", "metal", "other"] as const;

/** Read a CSS token as a concrete colour, for canvas/WebGL consumers (MapLibre) that cannot use var(). */
export function token(name: string, fallback = "#888888") {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim() || fallback;
}

/** Label maps resolve through t() on every read, so they follow the language without being rebuilt. */
function labels(base: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(base)) Object.defineProperty(out, k, { enumerable: true, get: () => t(base[k]) });
  return out;
}

export const STREAM_LABEL = labels({ organic: "Organic", plastic: "Plastic", paper: "Paper", metal: "Metal", other: "Other" });

export const TECH_LABEL = labels({
  anaerobic_digestion: "Anaerobic digestion",
  combustion: "Waste-to-energy plant (burning)",
  landfill_gas: "Landfill gas",
  landfill: "Sanitary landfill",
  rdf_coprocessing: "RDF co-processing",
  pyrolysis: "Pyrolysis",
  material_recovery: "Material recovery",
});

export const BUSINESS_LABEL = labels({
  restaurant: "Restaurant", hotel: "Hotel", market: "Market", food_processing: "Food processing",
  agriculture: "Agriculture", manufacturing: "Manufacturing", municipal: "Municipal",
});

/** Empty cell marker. An en dash, never an em dash. */
export const NONE = "–";

const loc = () => currentLocale();

export function n(v: number | null | undefined, digits = 0) {
  if (v == null || Number.isNaN(v)) return NONE;
  return Number(v).toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}
export function kg(v: number | null | undefined) {
  if (v == null) return NONE;
  return Math.abs(v) >= 10_000 ? `${n(v / 1000, 1)} t` : `${n(v)} kg`;
}
export function kwh(v: number | null | undefined) {
  if (v == null) return NONE;
  return Math.abs(v) >= 100_000 ? `${n(v / 1000, 1)} MWh` : `${n(v)} kWh`;
}
export function inr(v: number | null | undefined) {
  return v == null ? NONE : `₹${n(v)}`;
}
export function pct(v: number | null | undefined, digits = 0) {
  return v == null ? NONE : `${n(v, digits)}%`;
}
export function time(d: string | Date | null | undefined) {
  if (!d) return NONE;
  return new Date(d).toLocaleTimeString(loc(), { hour: "2-digit", minute: "2-digit", hour12: false });
}
export function dateTime(d: string | Date | null | undefined) {
  if (!d) return NONE;
  return new Date(d).toLocaleString(loc(), { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}
export function shortDate(d: string | Date | null | undefined) {
  return d ? new Date(d).toLocaleDateString(loc(), { day: "2-digit", month: "short" }) : "";
}
export function ago(d: string | Date | null | undefined) {
  if (!d) return NONE;
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 0) return t("in {m} min", { m: Math.round(-s / 60) });
  if (s < 60) return t("just now");
  if (s < 3600) return t("{m} min ago", { m: Math.round(s / 60) });
  if (s < 86400) return t("{h} h ago", { h: Math.round(s / 3600) });
  return t("{d} d ago", { d: Math.round(s / 86400) });
}
export const cx = (...c: (string | false | null | undefined | 0)[]) => c.filter(Boolean).join(" ");
