"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, PlayCircle } from "lucide-react";
import { PublicNav, PublicFooter } from "@/components/shell/PublicNav";
import { LoadPicker } from "@/components/landing/LoadPicker";
import { StepExplorer } from "@/components/landing/StepExplorer";
import { RoadScene } from "@/components/landing/Scenes";
import { CountUp } from "@/components/landing/CountUp";
import { Magnetic, ScrollProgress, Tilt } from "@/components/landing/Fx";
import { AwsStack, Circular, DelhiResult, Roles, SectionHead } from "@/components/landing/Sections";
import { loadGsap, prefersReducedMotion } from "@/components/landing/gsapKit";
import { t } from "@/lib/i18n";

// City-planner result on the real Delhi network (see the Delhi section below).
const PROOF = [
  { v: "+8%", l: "more electricity from the same waste", gold: true },
  { v: "−633 t", l: "a day kept out of landfill", gold: false },
  { v: "−19%", l: "truck tonne-kilometres", gold: false },
] as const;

export default function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const { data } = useQuery({
    queryKey: ["public-impact"],
    queryFn: () =>
      fetch("/api/public/impact")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    refetchInterval: 20_000,
  });

  // Entrance and scroll reveals. Content stays visible if scripts fail or motion is reduced, and when the
  // page loads in a background tab (no animation frames run there, so the content would sit at opacity 0).
  useEffect(() => {
    if (prefersReducedMotion() || document.hidden) return;
    let ctx: { revert: () => void } | undefined; let off = false;
    loadGsap().then(({ gsap }) => {
      if (off || !root.current) return;
      ctx = gsap.context(() => {
        gsap.fromTo("[data-hero]", { y: 22, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: "power3.out", stagger: 0.1, clearProps: "all" });
        gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => gsap.fromTo(el, { y: 28, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: "power2.out", clearProps: "all", scrollTrigger: { trigger: el, start: "top 88%", once: true } }));
        gsap.utils.toArray<HTMLElement>("[data-stagger]").forEach((wrap) => gsap.fromTo(wrap.children, { y: 22, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, stagger: 0.1, ease: "power2.out", clearProps: "all", scrollTrigger: { trigger: wrap, start: "top 85%", once: true } }));
      }, root);
    });
    return () => { off = true; ctx?.revert(); };
  }, []);

  const readings = [
    { v: data ? data.waste_processed_kg / 1000 : null, d: 0, u: "t", l: "Waste weighed at hubs" },
    { v: data ? data.energy_kwh / 1000 : null, d: 1, u: "MWh", l: "Energy metered at plants" },
    { v: data ? data.co2_avoided_kg / 1000 : null, d: 1, u: "t", l: "CO₂ avoided" },
    { v: data?.prediction_accuracy ?? null, d: 1, u: "%", l: "Predicted kWh against metered kWh" },
  ];

  return (
    <div ref={root} className="min-h-screen overflow-x-hidden">
      <ScrollProgress />
      <PublicNav />

      {/* ---------------------------------------------------------------- hero */}
      <section className="border-b border-line">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 pb-14 pt-12 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:pb-16 lg:pt-14">
          <div className="self-center">
            <p data-hero className="inline-flex items-center gap-2 rounded-full border border-line-2 bg-panel px-3 py-1 text-xs text-ink-2">
              <span className="live-dot size-1.5 rounded-full bg-accent" />{t("Delhi NCR, 20 sources, 3 hubs, 6 plants")}
            </p>
            <h1 data-hero className="mt-5 text-balance font-serif text-[2.5rem] font-medium leading-[1.06] tracking-[-0.01em] text-ink sm:text-[3.1rem] xl:text-[3.4rem]">{t("Send each load to the plant that makes the most power from it.")}</h1>
            <p data-hero className="mt-5 max-w-[34rem] text-[17px] leading-relaxed text-ink-2">
              {t("WattCycle follows waste from ward collection points to a hub scale, then picks the plant where it turns into the most electricity. A landfill takes any load and gives back nothing. A plant that suits the waste gives back power.")}
            </p>
            <div data-hero className="mt-8 flex flex-wrap items-center gap-3">
              <Magnetic><Link href="/login" className="inline-flex h-12 items-center gap-2 rounded-full bg-accent px-6 text-sm font-medium text-on-accent hover:opacity-90">{t("Open dashboard")}<ArrowRight className="size-4" /></Link></Magnetic>
              <Magnetic><a href="#loop" className="inline-flex h-12 items-center gap-2 rounded-full border border-line-2 px-6 text-sm text-ink hover:border-ink-3"><PlayCircle className="size-4 text-accent" />{t("See the loop")}</a></Magnetic>
            </div>
            <dl data-hero className="mt-9 grid max-w-lg grid-cols-3 border-t border-line pt-5">
              {PROOF.map((p, i) => (
                <div key={p.l} className={i ? "border-l border-line pl-4" : "pr-4"}>
                  <dd className={`num font-serif text-[1.65rem] leading-none ${p.gold ? "text-gold" : "text-ink"}`}>{p.v}</dd>
                  <dt className="mt-2 text-xs leading-snug text-ink-3">{t(p.l)}</dt>
                </div>
              ))}
            </dl>
            <p data-hero className="mt-3 text-[11px] text-ink-3">{t("City planner on Delhi's real zones and plants.")} <a href="#delhi" className="underline decoration-line-2 underline-offset-2 hover:text-ink">{t("How we got this")}</a></p>
          </div>
          <Tilt className="[transform-style:preserve-3d] lg:self-center"><div data-hero><LoadPicker /></div></Tilt>
        </div>
      </section>

      {/* ---------------------------------------------------------------- one journey */}
      <section className="border-b border-line">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6"><RoadScene /></div>
      </section>

      {/* ---------------------------------------------------------------- live counters */}
      <section className="border-b border-line bg-panel">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <p className="mb-6 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-ink-3"><span className="live-dot size-1.5 rounded-full bg-accent" />{t("Live from the demo network")}</p>
          <dl data-stagger className="grid grid-cols-2 gap-y-8 md:grid-cols-4">
            {readings.map((m, i) => (
              <div key={m.l} className={`px-4 ${i ? "md:border-l md:border-line" : "md:pl-0"} ${i % 2 ? "border-l border-line" : "pl-0"}`}>
                <dd className="num flex items-baseline gap-1.5"><span className="font-serif text-[2.6rem] font-medium leading-none text-ink"><CountUp value={m.v} digits={m.d} /></span><span className="text-sm text-ink-3">{m.u}</span></dd>
                <dt className="mt-2 max-w-[16rem] text-xs leading-snug text-ink-3">{t(m.l)}</dt>
              </div>
            ))}
          </dl>
          <p className="mt-8 text-xs text-ink-3">{t("Counters come from the demo network. Plants and zones are real; daily weights and meter readings are simulated.")}</p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- the loop */}
      <section id="loop" className="scroll-mt-16 border-b border-line">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <SectionHead className="mb-10" eyebrow="How it works" title="Six steps, and the last one feeds the first."
            lede="Every metered kWh is stored next to the number that was predicted for it. Retraining uses the gap, so the next ranking is a little less wrong." />
          <StepExplorer />
        </div>
      </section>

      {/* ---------------------------------------------------------------- Delhi result */}
      <section id="delhi" className="scroll-mt-16 border-b border-line bg-panel">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6"><DelhiResult /></div>
      </section>

      {/* ---------------------------------------------------------------- circular */}
      <section className="border-b border-line">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6"><Circular /></div>
      </section>

      {/* ---------------------------------------------------------------- AWS */}
      <section id="aws" className="scroll-mt-16 border-b border-line bg-panel">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6"><AwsStack /></div>
      </section>

      {/* ---------------------------------------------------------------- roles */}
      <section className="border-b border-line">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6"><Roles /></div>
      </section>

      {/* ---------------------------------------------------------------- close */}
      <section>
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div data-reveal className="grid gap-8 rounded-3xl border border-line-2 bg-panel p-8 sm:p-12 lg:grid-cols-[1.4fr_1fr] lg:items-center">
            <div>
              <h2 className="font-serif text-3xl font-medium leading-tight text-ink sm:text-4xl">{t("Watch one load go from pickup to meter in about 25 seconds.")}</h2>
              <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-ink-2">{t("Open any demo role and press Run a full load. Each stage calls the real pipeline. Only the trucks and the plant meter are simulated.")}</p>
            </div>
            <div className="flex flex-wrap gap-3 lg:justify-end">
              <Magnetic><Link href="/login" className="inline-flex h-12 items-center gap-2 rounded-full bg-accent px-6 text-sm font-medium text-on-accent hover:opacity-90">{t("Open dashboard")}<ArrowRight className="size-4" /></Link></Magnetic>
              <Magnetic><Link href="/about" className="inline-flex h-12 items-center rounded-full border border-line-2 px-6 text-sm text-ink hover:border-ink-3">{t("Read how it works")}</Link></Magnetic>
            </div>
          </div>
        </div>
      </section>
      <PublicFooter />
    </div>
  );
}
