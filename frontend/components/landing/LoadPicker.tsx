"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { cx, n } from "@/lib/format";
import { t } from "@/lib/i18n";
import { SimTag } from "@/components/ui";
import { loadGsap, prefersReducedMotion } from "./gsapKit";

// Illustrative yields (kWh per kg) and distances from the Okhla hub. Not live data.
const PLANTS = [
  { name: "Bhalswa landfill", km: 34, y: { food: 0, plastic: 0, paper: 0, mixed: 0 } },
  { name: "Ghazipur WtE", km: 16, y: { food: 0.136, plastic: 1.2, paper: 0.95, mixed: 0.52 } },
  { name: "Okhla WtE", km: 5.5, y: { food: 0.185, plastic: 0.9, paper: 0.8, mixed: 0.46 } },
  { name: "Tehkhand WtE", km: 1.5, y: { food: 0.196, plastic: 0.6, paper: 0.7, mixed: 0.4 } },
] as const;
const KINDS = [["food", "Food waste"], ["plastic", "Plastic"], ["paper", "Paper"], ["mixed", "Mixed municipal"]] as const;
type Kind = (typeof KINDS)[number][0];

export function LoadPicker() {
  const [kind, setKind] = useState<Kind>("food");
  const [tonnes, setTonnes] = useState(4);
  const list = useRef<HTMLUListElement>(null);
  const flip = useRef<any>(null);

  const rows = PLANTS.map((p) => ({ ...p, kwh: Math.round(p.y[kind] * tonnes * 1000) }));
  const max = Math.max(...rows.map((r) => r.kwh), 1);
  const ranked = rows.map((r) => ({ ...r, score: Math.round(100 * (0.8 * (r.kwh / max) + 0.2 * Math.max(0, 1 - r.km / 40))) })).sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const nearest = [...rows].sort((a, b) => a.km - b.km)[0];

  // Animate rows to their new order whenever the picks change.
  useLayoutEffect(() => {
    if (!list.current || prefersReducedMotion()) return;
    let off = false;
    loadGsap().then(({ gsap, Flip }) => {
      if (off || !list.current) return;
      if (flip.current) Flip.from(flip.current, { duration: 0.6, ease: "power2.inOut", absolute: false });
      gsap.fromTo(".pick-bar", { scaleX: 0 }, { scaleX: 1, transformOrigin: "left center", duration: 0.7, ease: "power2.out", stagger: 0.05 });
    });
    return () => { off = true; };
  }, [kind, tonnes]);

  const capture = async () => { const { Flip } = await loadGsap(); if (list.current) flip.current = Flip.getState(list.current.children); };
  const pick = (k: Kind) => { capture(); setKind(k); };
  const size = (v: number) => { capture(); setTonnes(v); };

  return (
    <div className="rounded-2xl border border-line-2 bg-panel p-5 shadow-[var(--shadow)]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-serif text-xl font-medium text-ink">{t("Try a load")}</h2>
        <SimTag label={t("Illustrative figures")} />
      </div>
      <p className="mt-1 text-sm text-ink-2">{t("Pick what is in the truck and how much. The plants re-rank as you change it.")}</p>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={t("Waste in the load")}>
        {KINDS.map(([k, label]) => (
          <button key={k} onClick={() => pick(k)} aria-pressed={kind === k}
            className={cx("h-9 rounded-full border px-4 text-sm transition-colors", kind === k ? "border-accent bg-accent text-on-accent" : "border-line-2 text-ink-2 hover:border-ink-3 hover:text-ink")}>{t(label)}</button>
        ))}
      </div>

      <label className="mt-4 block text-sm text-ink-2">
        <span className="num">{t("Load size: {n} t", { n: tonnes })}</span>
        <input type="range" min={1} max={10} value={tonnes} onChange={(e) => size(Number(e.target.value))} className="mt-2 w-full accent-[var(--accent)]" />
      </label>

      <ul ref={list} className="mt-3 space-y-2">
        {ranked.map((r, i) => (
          <li key={r.name} data-flip-id={r.name} className={cx("grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 rounded-xl border px-3 py-2.5", i === 0 ? "border-accent/60 bg-accent/10" : "border-line")}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className={i === 0 ? "font-medium text-ink" : "text-ink-2"}>{t(r.name)}</span>
              <span className="num text-xs text-ink-3">{r.km} km</span>
            </div>
            <span className="num text-right text-sm text-ink">{n(r.kwh)} kWh</span>
            <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-line"><div className={cx("pick-bar h-full rounded-full", i === 0 ? "bg-gold" : "bg-ink-3")} style={{ width: `${Math.max(2, (r.kwh / max) * 100)}%` }} /></div>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-sm leading-relaxed text-ink-2" aria-live="polite">
        {best.name === nearest.name
          ? t("For {q} t of {w}, {p} wins, and it is also the closest.", { q: tonnes, w: t(KINDS.find((x) => x[0] === kind)![1]).toLowerCase(), p: t(best.name) })
          : t("For {q} t of {w}, {p} wins even though {c} is closer. It gives about {k} kWh more.", { q: tonnes, w: t(KINDS.find((x) => x[0] === kind)![1]).toLowerCase(), p: t(best.name), c: t(nearest.name), k: n(best.kwh - rows.find((r) => r.name === nearest.name)!.kwh) })}
      </p>
    </div>
  );
}
