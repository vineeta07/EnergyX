"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { STREAM_COLOR } from "@/lib/format";

export type Verdict = "recycle" | "compost" | "upcycle" | "energy" | "hazard";
export interface Item {
  key: string; name: string; material: string; verdict: Verdict; bin: "blue" | "green" | "red" | "donate";
  resin: number | null; why: string; prep: string; ideas: string | null; grams: number;
}
export interface Resin { code: number; short: string; name: string; found: string; recycled: "widely" | "sometimes" | "rarely"; reuse: string; note: string }
export interface Level { n: number; name: string; floor: number; next_at: number | null; next_name: string | null; to_next: number; progress: number }
export interface Badge { key: string; name: string; how: string; have: number; need: number; earned: boolean }
export interface Profile {
  points: number; level: Level; streak: number; rank: number | null;
  today: { scans: number; cap: number };
  counts: { scans: number; resins: number; guides: number; materials: number; quizzes: number; reports: number; bags: number };
  quiz_done_today: boolean;
  by_material: { material: string; n: number }[];
  by_verdict: Record<string, number>;
  top_items: { item: string; name: string; n: number }[];
  recent: { id: number; kind: "scan" | "resin" | "guide" | "quiz" | "report" | "bag"; item: string; name: string; material: string | null; verdict: Verdict | null; points: number; method: string | null; created_at: string }[];
  impact: { sorted_kg: number; kept_from_landfill_kg: number };
  badges: Badge[];
}
export interface Zone { name: string; ref: string; lat: number; lng: number }
export type ReportKind = "overflowing_bin" | "missed_collection" | "dumping" | "burning" | "other";
export interface Catalogue {
  items: Item[]; resins: Resin[]; levels: { n: number; name: string; at: number }[];
  points: { scan: number; new_item: number; resin: number; guide: number; quiz_right: number; report: number; bag: number }; daily_scan_cap: number;
  zones: Zone[]; report_kinds: { key: ReportKind; title: string }[]; reports_per_day: number;
}
/** What the API sends back after something that can earn points. */
export interface Reward { awarded: number; profile: Profile; level_up: Level | null; new_badges: Badge[] }

export const MATERIAL_LABEL: Record<string, string> = { organic: "Food and garden", plastic: "Plastic", paper: "Paper", metal: "Metal", glass: "Glass", textile: "Cloth" };
export const MATERIAL_COLOR: Record<string, string> = { ...STREAM_COLOR, glass: "var(--blue)", textile: "var(--gold)" };

/** Colours follow the bin: blue for dry recyclables, teal for the green wet bin, marigold for things worth keeping. */
export const VERDICT: Record<Verdict, { title: string; line: string; color: string }> = {
  recycle: { title: "Recycle it", line: "This one is bought and made into something new.", color: "var(--blue)" },
  compost: { title: "Compost it", line: "It turns into compost or cooking gas.", color: "var(--accent)" },
  upcycle: { title: "Give it a second life", line: "Worth more reused or remade than thrown away.", color: "var(--gold)" },
  energy: { title: "Not recyclable", line: "In the dry bin it is burned for electricity instead of sitting in a landfill.", color: "var(--warn)" },
  hazard: { title: "Handle with care", line: "Keep it out of both bins and hand it over separately.", color: "var(--crit)" },
};
export const BIN: Record<Item["bin"], string> = {
  blue: "Dry waste bin (blue)",
  green: "Wet waste bin (green)",
  red: "Hazardous waste, handed over separately",
  donate: "Donate it, or keep it to remake",
};
export const RECYCLED_LABEL: Record<Resin["recycled"], string> = { widely: "Widely recycled", sometimes: "Recycled when clean", rarely: "Rarely recycled" };
export const RECYCLED_COLOR: Record<Resin["recycled"], string> = { widely: "var(--accent)", sometimes: "var(--gold)", rarely: "var(--warn)" };

export const useProfile = () => useQuery({ queryKey: ["resident", "me"], queryFn: () => api.get<Profile>("/citizen/me") });
export const useCatalogue = () => useQuery({ queryKey: ["resident", "catalogue"], queryFn: () => api.get<Catalogue>("/citizen/catalogue"), staleTime: Infinity });

/** After an action that earned points: put the fresh profile in the cache and refresh the leaderboard. */
export function useApplyReward() {
  const qc = useQueryClient();
  return (r: Reward) => {
    qc.setQueryData(["resident", "me"], r.profile);
    qc.invalidateQueries({ queryKey: ["resident", "leaderboard"] });
  };
}

/** Read one value from the page address without needing a Suspense boundary. */
export const param = (name: string) => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get(name));

/** The area a resident picked, remembered on this device. The demo account lives in Lajpat Nagar (Central Zone). */
const ZONE_KEY = "wattcycle-zone";
export function savedZone(): string {
  try { return localStorage.getItem(ZONE_KEY) || "Central Zone"; } catch { return "Central Zone"; }
}
export function saveZone(z: string) {
  try { localStorage.setItem(ZONE_KEY, z); } catch { /* storage blocked: keep it for this visit only */ }
}

/** A short area name for lists: "Rohini Zone (+ part Narela)" reads as "Rohini". */
export const zoneShort = (z: string) => z.replace(/\s*\(.*\)$/, "").replace(/ Zone$/, "");

/** Bins as answer buttons in the quiz. */
export const BIN_CHOICE: { bin: Item["bin"]; label: string; color: string }[] = [
  { bin: "green", label: "Green bin (wet)", color: "var(--accent)" },
  { bin: "blue", label: "Blue bin (dry)", color: "var(--blue)" },
  { bin: "red", label: "Hazardous, handed over separately", color: "var(--crit)" },
  { bin: "donate", label: "Donate or remake", color: "var(--gold)" },
];

/** Phone photos are several MB. The model looks at 224 px, so a 1024 px JPEG loses nothing and uploads fast. */
export async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const k = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise<Blob>((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error("no blob"))), "image/jpeg", 0.86));
  } catch {
    return file; // the server still checks the type
  }
}
