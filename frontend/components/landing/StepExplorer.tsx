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

const IDLE_MS = 2600;    // quiet time before it starts moving on its own
const STEP_MS = 3600;    // time on each step while moving on its own

/**
 * The step under your eye opens: scrolling past moves through them, sweeping the pointer over
 * them does the same, and when nothing is happening they advance by themselves.
 */
export function StepExplorer() {
  const [i, setI] = useState(0);
  const [inView, setInView] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const lastTouch = useRef(0);
  const touch = () => { lastTouch.current = Date.now(); };

  // Which section are we in
  useEffect(() => {
    if (!wrap.current) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.2 });
    io.observe(wrap.current);
    return () => io.disconnect();
  }, []);

  // Scrolling: the step closest to a line a little above the middle of the screen is the open one.
  useEffect(() => {
    if (!inView) return;
    let raf = 0;
    const pick = () => {
      raf = 0;
      const items = list.current?.children; if (!items) return;
      const line = window.innerHeight * 0.45;
      let best = 0, bestD = Infinity;
      for (let k = 0; k < items.length; k++) { const r = items[k].getBoundingClientRect(); const d = Math.abs(r.top + r.height / 2 - line); if (d < bestD) { bestD = d; best = k; } }
      setI((cur) => (cur === best ? cur : best));
    };
    const onScroll = () => { touch(); if (!raf) raf = requestAnimationFrame(pick); };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [inView]);

  // Quiet for a moment: carry on by itself.
  useEffect(() => {
    if (!inView || prefersReducedMotion()) return;
    touch();
    const id = setInterval(() => {
      if (Date.now() - lastTouch.current < IDLE_MS) return;
      setI((x) => (x + 1) % STAGES.length);
      lastTouch.current = Date.now() - IDLE_MS + STEP_MS;
    }, 400);
    return () => clearInterval(id);
  }, [inView]);

  // The picture changes smoothly with the step.
  useEffect(() => {
    if (!panel.current || prefersReducedMotion()) return;
    let off = false;
    loadGsap().then(({ gsap }) => {
      if (off || !panel.current) return;
      const q = gsap.utils.selector(panel.current);
      const svgs = q("svg");
      if (svgs.length > 0) {
        gsap.fromTo(svgs, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" });
      }
      const grows = q(".grow");
      if (grows.length > 0) {
        gsap.fromTo(grows, { scaleY: 0, transformOrigin: "50% 100%" }, { scaleY: 1, duration: 0.7, stagger: 0.07, ease: "back.out(1.4)" });
      }
      const needles = q(".needle");
      if (needles.length > 0) {
        gsap.fromTo(needles, { rotation: -50, transformOrigin: "262px 110px" }, { rotation: 0, duration: 1.1, ease: "elastic.out(1,0.5)" });
      }
    });
    return () => { off = true; };
  }, [i]);

  return (
    <div ref={wrap} className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
      <ol ref={list} className="space-y-2" aria-label={t("Steps")}>
        {STAGES.map(([name, what, who], k) => {
          const open = i === k;
          return (
            <li key={name} onPointerEnter={() => { touch(); setI(k); }} onPointerMove={touch}>
              <button onClick={() => { touch(); setI(k); }} aria-expanded={open}
                className={cx("w-full rounded-xl border px-4 py-3 text-left transition-[background-color,border-color,box-shadow,transform] duration-500 ease-out", open ? "border-accent/60 bg-panel shadow-[var(--shadow)]" : "border-line/70 hover:bg-panel/60")}>
                <span className="flex items-baseline gap-3">
                  <span className={cx("num text-sm transition-colors duration-500", open ? "text-accent" : "text-ink-3")}>{String(k + 1).padStart(2, "0")}</span>
                  <span className={cx("font-medium transition-colors duration-500", open ? "text-ink" : "text-ink-2")}>{t(name)}</span>
                  <span className="ml-auto text-xs text-ink-3">{t(who)}</span>
                </span>
                {/* closed: title only; open: the description slides in */}
                <span className={cx("block overflow-hidden pl-9 transition-[max-height,opacity,margin] duration-500 ease-out", open ? "mt-1.5 max-h-32 opacity-100" : "mt-0 max-h-0 opacity-0")}>
                  <span className="block text-sm leading-relaxed text-ink-2">{t(what)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <div ref={panel} className="aspect-[9/5] self-start overflow-hidden rounded-2xl border border-line bg-panel p-3 lg:sticky lg:top-24"><StepScene step={i} /></div>
    </div>
  );
}
