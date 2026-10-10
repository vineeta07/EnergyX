"use client";
import { create } from "zustand";

export type Theme = "light" | "dark";
const STORAGE_KEY = "wattcycle-theme";

/** Runs in <head> before paint so the page never flashes the wrong theme. */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.setAttribute("data-theme",t)}catch(e){}})();`;

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
  toggle: () => get().setTheme(get().theme === "dark" ? "light" : "dark"),
}));

export function restoreTheme() {
  const attr = document.documentElement.getAttribute("data-theme");
  useTheme.setState({ theme: attr === "dark" ? "dark" : "light" });
}
