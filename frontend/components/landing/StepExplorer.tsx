"use client";
import { useEffect, useRef, useState } from "react";
import { cx } from "@/lib/format";
import { t } from "@/lib/i18n";
import { StepScene } from "./Scenes";
import { loadGsap, prefersReducedMotion } from "./gsapKit";

export const STAGES = [
  ["Find", "A forecast per source says where waste is piling up, so pickups are asked for before bins overflow.", "Forecast model"],
  ["Collect", "Open pickups are grouped into truck routes with time windows. Urgent ones are dropped last.", "Route solver"],
  ["Weigh and sort", "The hub weighs the load. A photo sample and the source mix give the split into organic, plastic, paper and metal.", "Hub operator"],
  ["Choose a plant", "Each plant is scored on the electricity it can make from this exact load, minus distance, cost and carbon.", "Ranking, rules you can read"],
  ["Convert", "The plant burns, digests or sends it for recovery. The meter reading comes back as kWh.", "Plant operator"],
  ["Learn", "Predicted and metered kWh are stored side by side. The next ranking uses the gap.", "Nightly retraining"],
] as const;

export function StepExplorer() {
  const [i, setI] = useState(0);
  const [auto, setAuto] = useState(true);
  const [seen, setSeen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const choose = (k: number) => { setAuto(false); setI(k); };

  // Walk through the steps on its own until the visitor takes over.
  useEffect(() => {
    if (!wrap.current) return;
    const io = new IntersectionObserver(([e]) => setSeen(e.isIntersecting), { threshold: 0.35 });
    io.observe(wrap.current);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!auto || !seen || prefersReducedMotion()) return;
    const id = setTimeout(() => setI((x) => (x + 1) % STAGES.length), 5200);
    return () => clearTimeout(id);
  }, [auto, seen, i]);

  useEffect(() => {
    if (!panel.current || prefersReducedMotion()) return;
    let off = false;
    loadGsap().then(({ gsap }) => {
      if (off || !panel.current) return;
      const q = gsap.utils.selector(panel.current);
      gsap.fromTo(q("svg"), { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.45, ease: "power2.out" });
      gsap.fromTo(q(".grow"), { scaleY: 0, transformOrigin: "50% 100%" }, { scaleY: 1, duration: 0.7, stagger: 0.07, ease: "back.out(1.4)" });
      gsap.fromTo(q(".needle"), { rotation: -50, transformOrigin: "262px 110px" }, { rotation: 0, duration: 1.1, ease: "elastic.out(1,0.5)" });
    });
    return () => { off = true; };
  }, [i]);

  return (
    <div ref={wrap} className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
      <ol className="space-y-2" role="tablist" aria-label={t("Steps")}>
        {STAGES.map(([name, what, who], k) => (
          <li key={name}>
            <button role="tab" aria-selected={i === k} onClick={() => choose(k)} onMouseEnter={() => choose(k)}
              className={cx("w-full rounded-xl border px-4 py-3 text-left transition-all", i === k ? "border-accent/60 bg-panel shadow-[var(--shadow)]" : "border-transparent hover:border-line-2 hover:bg-panel/60")}>
              <span className="flex items-baseline gap-3">
                <span className="num text-sm text-ink-3">{String(k + 1).padStart(2, "0")}</span>
                <span className="font-medium text-ink">{t(name)}</span>
                <span className="ml-auto text-xs text-ink-3">{t(who)}</span>
              </span>
              {i === k && <span className="mt-1.5 block pl-9 text-sm leading-relaxed text-ink-2">{t(what)}</span>}
              {i === k && auto && seen && <span key={i} className="step-timer mt-2 block h-0.5 origin-left rounded bg-accent/60" />}
            </button>
          </li>
        ))}
      </ol>
      <div ref={panel} className="aspect-[9/5] self-start overflow-hidden rounded-2xl border border-line bg-panel p-3 lg:sticky lg:top-24"><StepScene step={i} /></div>
    </div>
  );
}
