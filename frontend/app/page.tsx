"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowRight, Radar, Truck, ScanSearch, Scale, Zap, RefreshCcw, MapPin, BrainCircuit, Gauge, Network } from "lucide-react";
import { PublicNav, PublicFooter } from "@/components/shell/PublicNav";
import { SimTag } from "@/components/ui";
import { n } from "@/lib/format";

const PIPE = [
  { k: "DISCOVER", d: "Forecast where useful waste is accumulating", icon: Radar },
  { k: "COLLECT", d: "OR-Tools consolidates pickups into routes", icon: Truck },
  { k: "INTELLIGENCE", d: "AI characterises composition & moisture", icon: ScanSearch },
  { k: "OPTIMIZE", d: "Rank every facility by net useful energy", icon: Scale },
  { k: "ENERGY", d: "Conversion at the highest-value destination", icon: Zap },
  { k: "LEARN", d: "Metered output retrains the models", icon: RefreshCcw },
];

export default function Landing() {
  const { data } = useQuery({ queryKey: ["public-impact"], queryFn: () => fetch("/api/public/impact").then((r) => (r.ok ? r.json() : null)), refetchInterval: 20_000 });
  const metrics = [
    { v: data ? n(data.waste_processed_kg) : "—", u: "kg", l: "Waste processed" },
    { v: data ? n(data.energy_kwh) : "—", u: "kWh", l: "Energy generated" },
    { v: data ? n(data.co2_avoided_kg / 1000, 1) : "—", u: "t", l: "CO₂ avoided" },
    { v: data?.prediction_accuracy != null ? n(data.prediction_accuracy, 1) : "—", u: "%", l: "Energy prediction accuracy" },
  ];

  return (
    <div className="min-h-screen overflow-x-hidden">
      <PublicNav />
      {/* HERO */}
      <section className="relative grid-bg">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(61,220,132,0.12),transparent_60%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 pb-16 pt-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-24">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[11px] font-medium text-accent">
              <span className="size-1.5 rounded-full bg-accent pulse" /> Waste-to-energy optimization infrastructure
            </div>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-5xl lg:text-6xl">
              Every Waste Stream Has a <span className="bg-gradient-to-r from-accent to-cyan bg-clip-text text-transparent">Better Destination.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-2 sm:text-lg">
              AI-powered infrastructure that discovers waste, optimizes collection, identifies its highest-value energy pathway, and routes it to the facility where it can create the most useful energy.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/dashboard" className="inline-flex h-11 items-center gap-2 rounded bg-accent px-5 text-sm font-semibold text-[#04140b] hover:bg-[#5ae89a]">Launch Dashboard <ArrowRight className="size-4" /></Link>
              <Link href="/about" className="inline-flex h-11 items-center gap-2 rounded border border-line-2 px-5 text-sm text-ink hover:border-ink-3"><BrainCircuit className="size-4 text-cyan" />Explore the AI</Link>
            </div>
            <p className="mt-6 text-xs text-ink-3">Not the nearest facility — the one that maximises <span className="text-ink-2">useful energy</span> net of transport cost, carbon and capacity.</p>
          </div>
          <HeroDecision />
        </div>

        {/* metrics */}
        <div className="relative mx-auto max-w-7xl px-4 pb-16 sm:px-6">
          <div className="grid grid-cols-2 overflow-hidden rounded-md border border-line bg-panel/70 md:grid-cols-4">
            {metrics.map((m, i) => (
              <div key={m.l} className={`px-5 py-5 ${i ? "border-l border-line" : ""} ${i >= 2 ? "border-t border-line md:border-t-0" : ""}`}>
                <div className="flex items-baseline gap-1.5"><span className="num text-3xl font-semibold text-ink">{m.v}</span><span className="text-sm text-ink-3">{m.u}</span></div>
                <div className="mt-1 flex items-center gap-2 text-xs text-ink-3">{m.l}</div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-3"><SimTag /> Live counters from the demo network (simulated facilities &amp; meters).</div>
        </div>
      </section>

      {/* PIPELINE */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <div className="text-xs font-medium uppercase tracking-[0.2em] text-accent">The closed loop</div>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight">Not waste → AI → energy. A loop that gets better every time it runs.</h2>
          <div className="relative mt-12">
            <svg className="absolute left-0 right-0 top-7 hidden h-2 w-full lg:block" preserveAspectRatio="none" viewBox="0 0 100 2"><line x1="4" y1="1" x2="96" y2="1" stroke="var(--accent)" strokeWidth="0.4" className="flow-line" vectorEffect="non-scaling-stroke" /></svg>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
              {PIPE.map((p, i) => (
                <motion.div key={p.k} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }} className="relative">
                  <div className="relative z-10 grid size-14 place-items-center rounded-md border border-line-2 bg-panel"><p.icon className="size-6 text-accent" /></div>
                  <div className="mt-4 text-[11px] font-semibold tracking-[0.18em] text-ink">{String(i + 1).padStart(2, "0")} · {p.k}</div>
                  <p className="mt-1 text-sm text-ink-2">{p.d}</p>
                </motion.div>
              ))}
            </div>
            <div className="mt-8 flex items-center gap-2 text-xs text-ink-3"><RefreshCcw className="size-3.5 text-accent" /> Actual metered output becomes labelled training data → models retrain → better routing and predictions next cycle.</div>
          </div>
        </div>
      </section>

      {/* FOUR QUESTIONS */}
      <section className="border-t border-line bg-panel/40">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-20 sm:px-6 md:grid-cols-2 lg:grid-cols-4">
          {[
            { q: "WHERE is useful waste available?", a: "LightGBM forecasts daily generation per source; storage-fill estimates trigger pickups.", icon: MapPin },
            { q: "WHAT exactly is the waste?", a: "A composition model trained on lab audits + operator corrections estimates streams & moisture.", icon: ScanSearch },
            { q: "WHERE does it create the most energy?", a: "A yield model predicts kWh at every compatible facility; a configurable utility ranks them.", icon: Gauge },
            { q: "HOW should it get there?", a: "Capacitated VRP with time windows (OR-Tools) consolidates pickups and dispatches loads.", icon: Network },
          ].map((x) => (
            <div key={x.q} className="rounded-md border border-line bg-panel p-5">
              <x.icon className="size-5 text-cyan" />
              <div className="mt-4 text-sm font-semibold text-ink">{x.q}</div>
              <p className="mt-2 text-sm text-ink-2">{x.a}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-line">
        <div className="mx-auto max-w-7xl px-4 py-20 text-center sm:px-6">
          <h2 className="text-3xl font-semibold tracking-tight">See the full loop in under 30 seconds.</h2>
          <p className="mx-auto mt-3 max-w-xl text-ink-2">Sign in with a demo role and press <span className="text-accent">Run Full Optimization</span>. Every stage calls the real pipeline — only trucks and meters are simulated.</p>
          <Link href="/login" className="mt-8 inline-flex h-11 items-center gap-2 rounded bg-accent px-5 text-sm font-semibold text-[#04140b] hover:bg-[#5ae89a]">Open the demo <ArrowRight className="size-4" /></Link>
        </div>
      </section>
      <PublicFooter />
    </div>
  );
}

/** Illustrative decision card (hero art) — the real one is computed in the AI Decision Center. */
function HeroDecision() {
  const rows = [
    { f: "Facility C", km: 12, kwh: 155, s: 64 },
    { f: "Facility A", km: 20, kwh: 179, s: 70 },
    { f: "Facility B", km: 35, kwh: 265, s: 87, win: true },
  ];
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="glass relative self-center rounded-md border border-line-2 p-5 shadow-2xl">
      <div className="flex items-center justify-between text-[11px] text-ink-3"><span className="num">AI-7001 · facility_selection</span><span className="text-accent">● live model</span></div>
      <div className="mt-3 text-sm text-ink">620 kg organic · Okhla Hub → ?</div>
      <div className="mt-4 space-y-2.5">
        {rows.map((r, i) => (
          <motion.div key={r.f} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.15 }}
            className={`grid grid-cols-[88px_56px_1fr_36px] items-center gap-3 rounded border px-3 py-2 text-xs ${r.win ? "border-accent/40 bg-accent/10" : "border-line bg-panel/60"}`}>
            <span className={r.win ? "font-semibold text-ink" : "text-ink-2"}>{r.f}</span>
            <span className="num text-ink-3">{r.km} km</span>
            <div className="h-1.5 rounded-sm bg-line"><motion.div initial={{ width: 0 }} animate={{ width: `${(r.kwh / 265) * 100}%` }} transition={{ delay: 0.6 + i * 0.15, duration: 0.8 }} className={`h-full rounded-sm ${r.win ? "bg-accent" : "bg-ink-3"}`} /></div>
            <span className="num text-right text-ink">{r.s}</span>
          </motion.div>
        ))}
      </div>
      <p className="mt-4 text-xs leading-relaxed text-ink-2">“Although Facility B is 23 km farther than Facility C, its higher conversion efficiency produces approximately <span className="text-accent">110 kWh</span> additional useful energy.”</p>
      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center text-[11px]">
        <div><div className="text-ink-3">Predicted</div><div className="num text-ink">265 kWh</div></div>
        <div><div className="text-ink-3">Actual</div><div className="num text-accent">264 kWh</div></div>
        <div><div className="text-ink-3">Confidence</div><div className="num text-ink">≈ 80%</div></div>
      </div>
    </motion.div>
  );
}
