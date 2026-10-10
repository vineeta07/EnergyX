"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PublicNav, PublicFooter } from "@/components/shell/PublicNav";
import { LoadPicker } from "@/components/landing/LoadPicker";
import { StepExplorer } from "@/components/landing/StepExplorer";
import { RoadScene } from "@/components/landing/Scenes";
import { CountUp } from "@/components/landing/CountUp";
import { Magnetic, ScrollProgress, Tilt } from "@/components/landing/Fx";
import { loadGsap, prefersReducedMotion } from "@/components/landing/gsapKit";
import { t } from "@/lib/i18n";

const QUESTIONS = [
  ["Where is usable waste?", "Each source gets a seven-day forecast. Storage fill triggers a pickup request."],
  ["What is in the load?", "Source mix, load size and season give a first split. Photos and the hub operator's corrections sharpen it."],
  ["Which plant makes the most energy?", "A yield model predicts kWh at every plant that can take the load. The winner is the best score, not the nearest gate."],
  ["How does it get there?", "Pickups are consolidated into routes by weight, time window and urgency. Road distances come from OpenStreetMap."],
] as const;

export default function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const { data } = useQuery({ queryKey: ["public-impact"], queryFn: () => fetch("/api/public/impact").then((r) => (r.ok ? r.json() : null)), refetchInterval: 20_000 });

  // Entrance and scroll reveals. Content stays visible if scripts fail or motion is reduced.
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let ctx: { revert: () => void } | undefined; let off = false;
    loadGsap().then(({ gsap }) => {
      if (off || !root.current) return;
      ctx = gsap.context(() => {
        gsap.from("[data-hero]", { y: 22, opacity: 0, duration: 0.8, ease: "power3.out", stagger: 0.12 });
        gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => gsap.from(el, { y: 28, opacity: 0, duration: 0.8, ease: "power2.out", scrollTrigger: { trigger: el, start: "top 88%", once: true } }));
        gsap.utils.toArray<HTMLElement>("[data-stagger]").forEach((wrap) => gsap.from(wrap.children, { y: 22, opacity: 0, duration: 0.7, stagger: 0.12, ease: "power2.out", scrollTrigger: { trigger: wrap, start: "top 85%", once: true } }));
      }, root);
    });
    return () => { off = true; ctx?.revert(); };
  }, []);

  const readings = [
    { v: data ? data.waste_processed_kg : null, d: 0, u: "kg", l: "Waste weighed at hubs" },
    { v: data ? data.energy_kwh : null, d: 0, u: "kWh", l: "Energy metered at plants" },
    { v: data ? data.co2_avoided_kg / 1000 : null, d: 1, u: "t", l: "CO₂ avoided" },
    { v: data?.prediction_accuracy ?? null, d: 1, u: "%", l: "Predicted kWh against metered kWh" },
  ];

  return (
    <div ref={root} className="min-h-screen overflow-x-hidden">
      <ScrollProgress />
      <PublicNav />

      <section className="border-b border-line">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_1fr] lg:py-16">
          <div className="self-center">
            <p data-hero className="text-sm text-accent">{t("Delhi NCR, 20 sources, 3 hubs, 6 plants")}</p>
            <h1 data-hero className="mt-3 font-serif text-4xl font-medium leading-[1.12] text-ink sm:text-5xl">{t("Send each load to the plant that makes the most power from it.")}</h1>
            <p data-hero className="mt-5 max-w-[34rem] text-base leading-relaxed text-ink-2">
              {t("WattCycle follows waste from ward collection points to a hub scale, then picks the plant where it turns into the most electricity. A landfill takes any load and gives back nothing. A plant that suits the waste gives back power.")}
            </p>
            <div data-hero className="mt-7 flex flex-wrap gap-3">
              <Magnetic><Link href="/login" className="inline-flex h-11 items-center rounded-full bg-accent px-6 text-sm font-medium text-on-accent">{t("Open dashboard")}</Link></Magnetic>
              <Magnetic><Link href="/about" className="inline-flex h-11 items-center rounded-full border border-line-2 px-6 text-sm text-ink hover:border-ink-3">{t("Read how it works")}</Link></Magnetic>
            </div>
          </div>
          <Tilt className="[transform-style:preserve-3d]"><div data-hero><LoadPicker /></div></Tilt>
        </div>
      </section>

      <section className="border-b border-line">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6"><RoadScene /></div>
      </section>

      <section className="border-b border-line bg-panel">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <dl data-stagger className="grid grid-cols-2 gap-y-6 md:grid-cols-4">
            {readings.map((m, i) => (
              <div key={m.l} className={`px-4 ${i ? "md:border-l md:border-line" : "md:pl-0"} ${i % 2 ? "border-l border-line" : ""}`}>
                <dd className="num flex items-baseline gap-1.5"><span className="font-serif text-4xl font-medium text-ink"><CountUp value={m.v} digits={m.d} /></span><span className="text-sm text-ink-3">{m.u}</span></dd>
                <dt className="mt-1 max-w-[16rem] text-xs leading-snug text-ink-3">{t(m.l)}</dt>
              </div>
            ))}
          </dl>
          <p className="mt-6 text-xs text-ink-3">{t("Counters come from the demo network. Plants and zones are real; daily weights and meter readings are simulated.")}</p>
        </div>
      </section>

      <section className="border-b border-line">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div data-reveal className="mb-8 max-w-xl">
            <h2 className="font-serif text-3xl font-medium text-ink">{t("Six steps, and the last one feeds the first.")}</h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-2">{t("Pick a step to see what happens. Every metered kWh is stored next to the number that was predicted for it, so the next ranking is a little less wrong.")}</p>
          </div>
          <StepExplorer />
        </div>
      </section>

      <section className="border-b border-line bg-panel">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-[1fr_1.4fr]">
          <h2 data-reveal className="font-serif text-3xl font-medium text-ink">{t("Four things the system works out for every load")}</h2>
          <dl data-stagger className="space-y-5">
            {QUESTIONS.map(([q, a]) => (
              <div key={q} className="rounded-xl border border-line bg-canvas p-4 transition-transform hover:-translate-y-0.5">
                <dt className="font-medium text-ink">{t(q)}</dt>
                <dd className="mt-1 max-w-[34rem] text-sm leading-relaxed text-ink-2">{t(a)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section>
        <div data-reveal className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-4 py-14 sm:px-6">
          <div className="max-w-xl">
            <h2 className="font-serif text-2xl font-medium text-ink">{t("Watch one load go from pickup to meter in about 25 seconds.")}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">{t("Open any demo role and press Run a full load. Each stage calls the real pipeline. Only the trucks and the plant meter are simulated.")}</p>
          </div>
          <Magnetic><Link href="/login" className="inline-flex h-11 items-center rounded-full bg-accent px-6 text-sm font-medium text-on-accent">{t("Open dashboard")}</Link></Magnetic>
        </div>
      </section>
      <PublicFooter />
    </div>
  );
}
