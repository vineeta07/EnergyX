"use client";
import { create } from "zustand";

export type Theme = "light" | "dark";
const STORAGE_KEY = "wattcycle-theme";

/** Runs in <head> before paint so the page never flashes the wrong theme. */
export const THEME_BOOT_SCRIPT = `(function(){var t=null;try{t=localStorage.getItem("${STORAGE_KEY}")}catch(e){}try{if(t!=="light"&&t!=="dark"){t="light"}document.documentElement.setAttribute("data-theme",t)}catch(e){}})();`;

/** The theme actually on screen: the attribute if set. Light is the default, whatever the system setting says. */
function effectiveTheme(): Theme {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "dark" || attr === "light") return attr;
  return "light";
}

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

export const useTheme = create<ThemeState>()((set, get) => ({
  theme: "light",
  setTheme: (theme) => {
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* storage can be blocked */ }
    document.documentElement.setAttribute("data-theme", theme);
    set({ theme });
  },
  toggle: () => get().setTheme(effectiveTheme() === "dark" ? "light" : "dark"),
}));

export function restoreTheme() {
  useTheme.setState({ theme: effectiveTheme() });
}
