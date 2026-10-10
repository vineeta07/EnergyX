"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PublicNav, PublicFooter } from "@/components/shell/PublicNav";
import { SimTag } from "@/components/ui";
import { n, NONE } from "@/lib/format";
import { t } from "@/lib/i18n";

const STAGES = [
  ["Find", "A forecast per source says where waste is piling up, so pickups are asked for before bins overflow.", "Forecast model"],
  ["Collect", "Open pickups are grouped into truck routes with time windows. Urgent ones are dropped last.", "Route solver"],
  ["Weigh and sort", "The hub weighs the load. A photo sample and the source mix give the split into organic, plastic, paper and metal.", "Hub operator"],
  ["Choose a plant", "Each plant is scored on the electricity it can make from this exact load, minus distance, cost and carbon.", "Ranking, rules you can read"],
  ["Convert", "The plant burns, digests or sends it for recovery. The meter reading comes back as kWh.", "Plant operator"],
  ["Learn", "Predicted and metered kWh are stored side by side. The next ranking uses the gap.", "Nightly retraining"],
] as const;

const QUESTIONS = [
  ["Where is usable waste?", "Each source gets a seven-day forecast. Storage fill triggers a pickup request."],
  ["What is in the load?", "Source mix, load size and season give a first split. Photos and the hub operator's corrections sharpen it."],
  ["Which plant makes the most energy?", "A yield model predicts kWh at every plant that can take the load. The winner is the best score, not the nearest gate."],
  ["How does it get there?", "Pickups are consolidated into routes by weight, time window and urgency. Road distances come from OpenStreetMap."],
] as const;

export default function Landing() {
  const { data } = useQuery({ queryKey: ["public-impact"], queryFn: () => fetch("/api/public/impact").then((r) => (r.ok ? r.json() : null)), refetchInterval: 20_000 });
  const readings = [
    { v: data ? n(data.waste_processed_kg) : NONE, u: "kg", l: "Waste weighed at hubs" },
    { v: data ? n(data.energy_kwh) : NONE, u: "kWh", l: "Energy metered at plants" },
    { v: data ? n(data.co2_avoided_kg / 1000, 1) : NONE, u: "t", l: "CO₂ avoided" },
    { v: data?.prediction_accuracy != null ? n(data.prediction_accuracy, 1) : NONE, u: "%", l: "Predicted kWh against metered kWh" },
  ];

  return (
    <div className="min-h-screen overflow-x-hidden">
      <PublicNav />

      {/* Hero: text on the left, a real ranking table on the right */}
      <section className="border-b border-line">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1.05fr] lg:py-20">
          <div>
            <p className="text-xs tracking-[0.08em] text-ink-3">{t("Delhi NCR, 20 sources, 3 hubs, 6 plants")}</p>
            <h1 className="mt-4 font-serif text-4xl font-medium leading-[1.12] text-ink sm:text-5xl">
              {t("Send each load to the plant that makes the most power from it.")}
            </h1>
            <p className="mt-5 max-w-[34rem] text-base leading-relaxed text-ink-2">
              {t("WattCycle follows waste from ward collection points to a hub scale, then picks the plant where it turns into the most electricity. A landfill takes any load and gives back nothing. A plant that suits the waste gives back power.")}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login" className="inline-flex h-11 items-center rounded-md bg-accent px-5 text-sm font-medium text-on-accent hover:opacity-90">{t("Open the demo")}</Link>
              <Link href="/about" className="inline-flex h-11 items-center rounded-md border border-line-2 px-5 text-sm text-ink hover:border-ink-3">{t("Read how it works")}</Link>
            </div>
          </div>
          <RankingBoard />
        </div>
      </section>

      {/* Readings: one strip, read like a weigh-scale display */}
      <section className="border-b border-line bg-panel">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <dl className="grid grid-cols-2 gap-y-6 md:grid-cols-4">
            {readings.map((m, i) => (
              <div key={m.l} className={`px-4 ${i ? "md:border-l md:border-line" : "md:pl-0"} ${i === 2 ? "border-l border-line md:border-l" : ""} ${i === 1 ? "border-l border-line" : ""}`}>
                <dd className="num flex items-baseline gap-1.5"><span className="font-serif text-4xl font-medium text-ink">{m.v}</span><span className="text-sm text-ink-3">{m.u}</span></dd>
                <dt className="mt-1 max-w-[16rem] text-xs leading-snug text-ink-3">{t(m.l)}</dt>
              </div>
            ))}
          </dl>
          <p className="mt-6 flex items-center gap-2 text-xs text-ink-3"><SimTag />{t("Counters come from the demo network. Plants and zones are real; daily weights and meter readings are simulated.")}</p>
        </div>
      </section>

      {/* The loop as a receipt: number, stage, what happens, who does it */}
      <section className="border-b border-line">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.8fr_1.6fr]">
          <div>
            <h2 className="font-serif text-3xl font-medium text-ink">{t("Six steps, and the last one feeds the first.")}</h2>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-2">{t("Every metered kWh is stored next to the number that was predicted for it. Retraining uses the gap, so the next ranking is a little less wrong.")}</p>
            <PlantScene />
          </div>
          <ol className="divide-y divide-line border-y border-line">
            {STAGES.map(([name, what, who], i) => (
              <li key={name} className="grid grid-cols-[2.5rem_1fr] gap-x-3 py-4 sm:grid-cols-[2.5rem_9rem_1fr_9rem]">
                <span className="num pt-0.5 text-sm text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                <span className="font-medium text-ink">{t(name)}</span>
                <span className="col-start-2 mt-1 text-sm leading-relaxed text-ink-2 sm:col-start-auto sm:mt-0">{t(what)}</span>
                <span className="col-start-2 mt-1 text-xs text-ink-3 sm:col-start-auto sm:mt-0.5 sm:text-right">{t(who)}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Four questions: plain definition list, no cards */}
      <section className="border-b border-line bg-panel">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-[1fr_1.4fr]">
          <h2 className="font-serif text-3xl font-medium text-ink">{t("Four things the system works out for every load")}</h2>
          <dl className="space-y-6">
            {QUESTIONS.map(([q, a]) => (
              <div key={q} className="border-l-2 border-line-2 pl-4">
                <dt className="font-medium text-ink">{t(q)}</dt>
                <dd className="mt-1 max-w-[34rem] text-sm leading-relaxed text-ink-2">{t(a)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Closing band */}
      <section>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-4 py-14 sm:px-6">
          <div className="max-w-xl">
            <h2 className="font-serif text-2xl font-medium text-ink">{t("Watch one load go from pickup to meter in about 25 seconds.")}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">{t("Sign in with any demo role and press Run a full load. Each stage calls the real pipeline. Only the trucks and the plant meter are simulated.")}</p>
          </div>
          <Link href="/login" className="inline-flex h-11 items-center rounded-md bg-accent px-5 text-sm font-medium text-on-accent hover:opacity-90">{t("Open the demo")}</Link>
        </div>
      </section>
      <PublicFooter />
    </div>
  );
}

/** Example ranking for one organic load. The real one is computed on the Plant decisions screen. */
function RankingBoard() {
  const rows = [
    { f: "Bhalswa landfill", km: 34, kwh: 0, s: 31 },
    { f: "Ghazipur WtE", km: 16, kwh: 576, s: 56 },
    { f: "Okhla WtE", km: 5.5, kwh: 781, s: 69 },
    { f: "Tehkhand WtE", km: 1.5, kwh: 829, s: 72, win: true },
  ];
  return (
    <div className="self-start rounded-lg border border-line-2 bg-panel p-5 shadow-[var(--shadow)]">
      <div className="flex items-baseline justify-between gap-3 text-xs text-ink-3">
        <span>{t("Example decision")}</span>
        <span>{t("4,230 kg organic from the Okhla hub")}</span>
      </div>
      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-ink-3">
            <th className="pb-2 text-left font-medium">{t("Plant")}</th>
            <th className="pb-2 text-right font-medium">{t("Distance")}</th>
            <th className="pb-2 text-right font-medium">{t("Predicted")}</th>
            <th className="pb-2 text-right font-medium">{t("Score")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.f} className={`border-b border-line/70 ${r.win ? "bg-accent/10" : ""}`}>
              <td className={`py-2.5 pl-2 ${r.win ? "font-medium text-ink" : "text-ink-2"}`}>{r.f}</td>
              <td className="num py-2.5 text-right text-ink-3">{r.km} km</td>
              <td className="num py-2.5 text-right text-ink">{r.kwh} kWh</td>
              <td className="num py-2.5 pr-2 text-right text-ink">{r.s}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 text-sm leading-relaxed text-ink-2">
        {t("Sending this load to the Bhalswa landfill would recover 0 kWh. Tehkhand recovers about 829 kWh.")}
      </p>
      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 text-xs">
        <div><dt className="text-ink-3">{t("Predicted")}</dt><dd className="num mt-0.5 text-sm text-ink">829 kWh</dd></div>
        <div><dt className="text-ink-3">{t("Metered")}</dt><dd className="num mt-0.5 text-sm text-gold">845 kWh</dd></div>
        <div><dt className="text-ink-3">{t("Confidence")}</dt><dd className="num mt-0.5 text-sm text-ink">80%</dd></div>
      </dl>
    </div>
  );
}

/** Flat scene: a tipper truck with bags heading to a plant. Drawn in the palette, no gradients. */
function PlantScene() {
  return (
    <svg viewBox="0 0 320 130" className="mt-8 w-full max-w-sm" role="img" aria-label={t("A waste truck driving towards a power plant")}>
      <line x1="0" y1="112" x2="320" y2="112" stroke="var(--line-2)" strokeWidth="1.5" />
      {/* plant */}
      <rect x="214" y="58" width="76" height="54" fill="var(--raised)" stroke="var(--line-2)" />
      <rect x="226" y="34" width="14" height="24" fill="var(--raised)" stroke="var(--line-2)" />
      <rect x="258" y="22" width="14" height="36" fill="var(--raised)" stroke="var(--line-2)" />
      <rect x="224" y="76" width="14" height="14" fill="var(--panel)" stroke="var(--line-2)" />
      <rect x="246" y="76" width="14" height="14" fill="var(--panel)" stroke="var(--line-2)" />
      <rect x="268" y="90" width="14" height="22" fill="var(--accent)" />
      <path d="M233 30c0-6 7-6 7-12M265 18c0-6 7-6 7-12" stroke="var(--ink-3)" strokeWidth="1.2" fill="none" />
      {/* truck */}
      <rect x="20" y="62" width="92" height="38" fill="var(--panel)" stroke="var(--ink-2)" strokeWidth="1.5" />
      <path d="M112 72h24l12 14v14h-36z" fill="var(--panel)" stroke="var(--ink-2)" strokeWidth="1.5" />
      <rect x="122" y="76" width="16" height="10" fill="var(--raised)" stroke="var(--ink-2)" />
      <circle cx="46" cy="102" r="9" fill="var(--ink-2)" /><circle cx="46" cy="102" r="3.5" fill="var(--panel)" />
      <circle cx="128" cy="102" r="9" fill="var(--ink-2)" /><circle cx="128" cy="102" r="3.5" fill="var(--panel)" />
      {/* bags */}
      <path d="M30 62c0-14 16-14 16 0z" fill="var(--s-organic)" />
      <path d="M48 62c0-18 18-18 18 0z" fill="var(--s-paper)" />
      <path d="M68 62c0-12 14-12 14 0z" fill="var(--s-plastic)" />
      <path d="M84 62c0-16 16-16 16 0z" fill="var(--s-organic)" />
      {/* energy tick */}
      <path d="M170 56l12-14M182 42h-8M182 42v8" stroke="var(--gold)" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </svg>
  );
}
