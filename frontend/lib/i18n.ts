"use client";
import { create } from "zustand";
import { DICT } from "./dict";

export type Lang = "en" | "hi" | "bn" | "ta" | "pa";

export const LANGS: { code: Lang; label: string; locale: string }[] = [
  { code: "en", label: "English", locale: "en-IN" },
  { code: "hi", label: "हिन्दी", locale: "hi-IN" },
  { code: "bn", label: "বাংলা", locale: "bn-IN" },
  { code: "ta", label: "தமிழ்", locale: "ta-IN" },
  { code: "pa", label: "ਪੰਜਾਬੀ", locale: "pa-IN" },
];

const STORAGE_KEY = "wattcycle-lang";
const COLUMN: Record<Exclude<Lang, "en">, number> = { hi: 0, bn: 1, ta: 2, pa: 3 };

interface LangState {
  lang: Lang;
  setLang: (l: Lang) => void;
}

export const useLang = create<LangState>()((set) => ({
  lang: "en",
  setLang: (lang) => {
    try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* storage can be blocked */ }
    if (typeof document !== "undefined") document.documentElement.lang = lang;
    set({ lang });
  },
}));

/** Read the saved language once after hydration (the server always renders English). */
export function restoreLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as Lang | null;
    if (saved && LANGS.some((l) => l.code === saved) && saved !== useLang.getState().lang) useLang.getState().setLang(saved);
  } catch { /* ignore */ }
}

export function currentLocale() {
  const code = useLang.getState().lang;
  // Latin digits everywhere: weights, prices and dates are read faster that way on a scale or a receipt.
  return `${LANGS.find((l) => l.code === code)!.locale}-u-nu-latn`;
}

/**
 * Translate an English UI string. English text is the key, so a missing entry
 * falls back to readable English instead of a blank. {name} placeholders are filled from vars.
 */
export function t(key: string, vars?: Record<string, string | number | null | undefined>): string {
  const lang = useLang.getState().lang;
  let s = key;
  if (lang !== "en") {
    const hit = DICT[key]?.[COLUMN[lang]];
    if (hit) s = hit;
  }
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] == null ? "" : String(vars[k])));
  return s;
}

/** Translate a backend enum such as in_transit or anaerobic_digestion. Falls back to a spaced, capitalised label. */
export function tEnum(v: string | null | undefined) {
  if (!v) return "";
  const spaced = v.replace(/_/g, " ");
  const pretty = spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
  return t(pretty);
}
