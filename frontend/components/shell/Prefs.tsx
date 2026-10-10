"use client";
import { useEffect, useRef, useState } from "react";
import { Languages, Moon, Sun } from "lucide-react";
import { LANGS, t, useLang } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { cx } from "@/lib/format";

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useTheme((s) => s.theme);
  const toggle = useTheme((s) => s.toggle);
  const dark = theme === "dark";
  return (
    <button data-tour="theme" onClick={toggle} aria-pressed={dark}
      aria-label={dark ? t("Switch to light mode") : t("Switch to dark mode")} title={dark ? t("Switch to light mode") : t("Switch to dark mode")}
      className={cx("grid size-8 place-items-center rounded-md border border-line-2 text-ink-2 hover:border-ink-3 hover:text-ink", className)}>
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

export function LangSwitcher({ className }: { className?: string }) {
  const lang = useLang((s) => s.lang);
  const setLang = useLang((s) => s.setLang);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const current = LANGS.find((l) => l.code === lang)!;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  return (
    <div ref={box} className={cx("relative", className)} data-tour="language">
      <button onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open} aria-label={t("Language")}
        className="flex h-8 items-center gap-1.5 rounded-md border border-line-2 px-2.5 text-xs text-ink-2 hover:border-ink-3 hover:text-ink">
        <Languages className="size-4" />
        <span>{current.label}</span>
      </button>
      {open && (
        <ul role="listbox" aria-label={t("Language")} className="absolute right-0 top-10 z-50 min-w-36 overflow-hidden rounded-md border border-line-2 bg-panel py-1 shadow-[var(--popover-shadow)]">
          {LANGS.map((l) => (
            <li key={l.code}>
              <button role="option" aria-selected={l.code === lang} onClick={() => { setLang(l.code); setOpen(false); }}
                className={cx("flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-raised", l.code === lang ? "text-ink" : "text-ink-2")}>
                {l.label}
                {l.code === lang && <span className="size-1.5 rounded-full bg-accent" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
