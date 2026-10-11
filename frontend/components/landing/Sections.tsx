"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Sprout, Building2, Truck, Warehouse, Zap, ShieldCheck } from "lucide-react";
import { cx } from "@/lib/format";
import { t } from "@/lib/i18n";

/** Eyebrow, serif heading and one-line lede, used by every landing section. */
export function SectionHead({ eyebrow, title, lede, className }: { eyebrow: string; title: string; lede?: string; className?: string }) {
  return (
    <div data-reveal className={cx("max-w-2xl", className)}>
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-accent">{t(eyebrow)}</p>
      <h2 className="mt-3 text-balance font-serif text-3xl font-medium leading-tight text-ink sm:text-[2.35rem]">{t(title)}</h2>
      {lede && <p className="mt-4 text-[15px] leading-relaxed text-ink-2">{t(lede)}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- Delhi: today vs WattCycle
// City-planner run on the real Delhi network (12 MCD zones, 4 WtE plants, biomethanation, 6 MRFs, 2 landfills).
const DELHI = [
  { label: "Electricity from the same waste", unit: "MWh/day", now: 1864, ours: 2016, better: "up", energy: true },
  { label: "Waste sent to landfill", unit: "t/day", now: 3983, ours: 3350, better: "down", energy: false },
  { label: "Truck tonne-kilometres", unit: "index", now: 100, ours: 81, better: "down", energy: false },
] as const;

export function DelhiResult() {
  return (
    <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
      <SectionHead eyebrow="The result on Delhi's real network"
        title="Same waste, same plants. More power, less landfill."
        lede="We ran the city planner on Delhi's 12 MCD zones and the plants that actually exist: Okhla, Tehkhand, Ghazipur and Bawana WtE, the Ghogha biomethanation plant, six MRFs and two landfills. The only change is where each zone's waste goes." />
      <div data-stagger className="space-y-4">
        {DELHI.map((r) => {
          const max = Math.max(r.now, r.ours);
          const delta = Math.round(((r.ours - r.now) / r.now) * 100);
          return (
            <div key={r.label} className="rounded-2xl border border-line bg-panel p-5">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-sm font-medium text-ink">{t(r.label)}</span>
                <span className={cx("num font-serif text-2xl", r.energy ? "text-gold" : "text-accent")}>{delta > 0 ? "+" : "−"}{Math.abs(delta)}%</span>
              </div>
              <div className="mt-4 space-y-2.5">
                {([["Today", r.now, false], ["With WattCycle", r.ours, true]] as const).map(([who, v, ours]) => (
                  <div key={who} className="grid grid-cols-[5.75rem_1fr_auto] items-center gap-2.5 text-xs sm:grid-cols-[7.5rem_1fr_auto] sm:gap-3">
                    <span className={ours ? "text-ink" : "text-ink-3"}>{t(who)}</span>
                    <div className="h-2.5 overflow-hidden rounded-full bg-line">
                      <div className={cx("h-full rounded-full", ours ? (r.energy ? "bg-gold" : "bg-accent") : "bg-ink-3/60")} style={{ width: `${(v / max) * 100}%` }} />
                    </div>
                    <span className={cx("num whitespace-nowrap text-right sm:w-28", ours ? "text-ink" : "text-ink-3")}>{r.unit === "index" ? v : v.toLocaleString("en-IN")} {r.unit === "index" ? "" : r.unit}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        <p className="text-xs leading-relaxed text-ink-3">{t("Plant capacities and megawatt ratings are published figures; daily tonnage per zone is the MCD average. Tonne-kilometres are shown as an index, today = 100.")}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- beyond the furnace
function Art({ children }: { children: ReactNode }) {
  return <svg viewBox="0 0 240 120" className="block h-auto w-full" aria-hidden><rect width="240" height="120" rx="12" fill="var(--raised)" opacity="0.7" />{children}</svg>;
}

const CIRCULAR = [
  {
    k: "Recycle first", title: "Recyclable or not, from one photo",
    body: "A vision model names 30 kinds of item. PET, cans, cardboard and paper go to a materials recovery facility; thin film, styrofoam and lined cups do not. Only what cannot be recycled is ranked for energy.",
    stat: "30 item types",
    art: <Art><rect x="34" y="34" width="46" height="58" rx="6" fill="var(--s-plastic)" /><rect x="44" y="26" width="26" height="10" rx="3" fill="var(--ink-3)" /><path d="M104 63 h30" stroke="var(--ink-3)" strokeWidth="3" strokeLinecap="round" /><path d="M128 55 l8 8 -8 8" fill="none" stroke="var(--ink-3)" strokeWidth="3" strokeLinecap="round" /><rect x="152" y="30" width="58" height="26" rx="6" fill="var(--accent)" /><rect x="152" y="64" width="58" height="26" rx="6" fill="var(--line-2)" /></Art>,
  },
  {
    k: "Upcycle", title: "Matched to someone who will use it",
    body: "Clothes, glass jars and PET bottles are set aside at the hub. The AI picks the upcycling partner by price, carbon saved and how much that partner really accepts, and every receipt updates the next match.",
    stat: "Learns each partner's acceptance",
    art: <Art><path d="M40 86 l14 -44 h22 l14 44Z" fill="var(--s-paper)" /><circle cx="120" cy="64" r="22" fill="none" stroke="var(--accent)" strokeWidth="5" /><path d="M136 46 l8 -4 -1 9" fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" /><rect x="166" y="44" width="38" height="44" rx="8" fill="var(--s-organic)" /></Art>,
  },
  {
    k: "Battery second life", title: "Old cells, new storage",
    body: "Discarded laptop cells, scooter modules and e-rickshaw batteries are tested one by one. Healthy cells are combined into balanced packs that store rooftop solar; worn-out ones go to an authorised recycler.",
    stat: "Group imbalance 11% → 0.04%",
    art: <Art>{[0, 1, 2, 3, 4].map((i) => <rect key={i} x={30 + i * 22} y={40} width="16" height="46" rx="4" fill={i === 3 ? "var(--warn)" : "var(--accent)"} opacity={i === 3 ? 0.8 : 1} />)}<path d="M150 63 h20" stroke="var(--ink-3)" strokeWidth="3" strokeLinecap="round" /><rect x="180" y="38" width="36" height="50" rx="6" fill="var(--panel)" stroke="var(--gold)" strokeWidth="3" /><path d="M200 48 l-8 14 h10 l-6 14" fill="none" stroke="var(--gold)" strokeWidth="3" strokeLinejoin="round" /></Art>,
  },
] as const;

export function Circular() {
  return (
    <>
      <SectionHead eyebrow="Beyond the furnace" title="Burning is the last resort, not the first."
        lede="Before any load is ranked for energy, WattCycle takes out what is worth more whole or as material." />
      <div data-stagger className="mt-10 grid gap-5 md:grid-cols-3">
        {CIRCULAR.map((c) => (
          <article key={c.k} className="group flex flex-col rounded-2xl border border-line bg-panel p-5 transition-[transform,border-color] duration-300 hover:-translate-y-1 hover:border-line-2">
            {c.art}
            <p className="mt-5 text-xs font-medium uppercase tracking-[0.12em] text-ink-3">{t(c.k)}</p>
            <h3 className="mt-1.5 font-serif text-xl font-medium text-ink">{t(c.title)}</h3>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-2">{t(c.body)}</p>
            <p className="num mt-4 border-t border-line pt-3 text-sm text-accent">{t(c.stat)}</p>
          </article>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- built on AWS
type Svc = { name: string; role: string };
const LAYERS: { layer: string; note?: string; items: Svc[] }[] = [
  { layer: "Edge", items: [
    { name: "Amazon CloudFront", role: "One HTTPS address for the site, the API and the live feed" },
    { name: "Application Load Balancer", role: "Sends /api and /ws to the API, everything else to the web app" },
  ] },
  { layer: "Compute", note: "Amazon ECS on AWS Fargate", items: [
    { name: "Web · Next.js", role: "Dashboards for six roles" },
    { name: "API · Node.js", role: "Data, workflow, roles, WebSockets" },
    { name: "AI · Python", role: "Forecasts, vision, ranking, OR-Tools routing, retraining" },
  ] },
  { layer: "Data and events", items: [
    { name: "Amazon RDS for PostgreSQL", role: "Network, loads, predictions and outcomes" },
    { name: "Amazon S3", role: "Waste photos via pre-signed links, versioned models" },
    { name: "Amazon EventBridge", role: "Every step published as an event, archived for replay" },
  ] },
  { layer: "Intelligence and operations", items: [
    { name: "Amazon Bedrock", role: "Claude for the operations assistant" },
    { name: "AWS CodeBuild + Amazon ECR", role: "Images built from GitHub, tagged by commit" },
    { name: "AWS Secrets Manager", role: "Keys generated at deploy, never in code" },
    { name: "Amazon CloudWatch", role: "Logs and container metrics" },
  ] },
];

export function AwsStack() {
  return (
    <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
      <div className="lg:sticky lg:top-24 lg:self-start">
        <SectionHead eyebrow="Built on AWS" title="One Terraform apply. Sixty-seven resources."
          lede="The web app, the API and the AI service run as separate containers on Fargate behind CloudFront. Data, photos, models and events each live in the AWS service built for them, and the whole stack is code." />
        <ul data-stagger className="mt-8 space-y-3 text-sm text-ink-2">
          {["Private subnets for the database and the AI service", "Least-privilege roles: one bucket, one event bus, Bedrock, nothing else", "No servers to patch; each service scales on its own"].map((x) => (
            <li key={x} className="flex gap-3"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" />{t(x)}</li>
          ))}
        </ul>
        <Link href="/about#architecture" className="mt-8 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:gap-2.5 transition-[gap]">{t("See the architecture")}<ArrowRight className="size-4" /></Link>
      </div>
      <div data-stagger className="relative space-y-3">
        {LAYERS.map((l, i) => (
          <div key={l.layer} className="relative">
            {i > 0 && <div aria-hidden className="absolute -top-3 left-8 h-3 border-l border-dashed border-line-2" />}
            <div className="rounded-2xl border border-line bg-panel p-4">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <span className="text-xs font-medium uppercase tracking-[0.12em] text-ink-3">{t(l.layer)}</span>
                {l.note && <span className="text-xs text-accent">{t(l.note)}</span>}
              </div>
              <div className={cx("grid gap-2", l.items.length === 2 ? "sm:grid-cols-2" : l.items.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
                {l.items.map((s) => (
                  <div key={s.name} className="rounded-xl border border-line bg-canvas px-3 py-2.5 transition-colors hover:border-accent/50">
                    <div data-notr className="text-[13px] font-medium text-ink">{s.name}</div>
                    <div className="mt-0.5 text-xs leading-snug text-ink-3">{t(s.role)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- roles
const ROLES = [
  { icon: Sprout, name: "Resident", what: "Scan an item, learn the right bin, earn points" },
  { icon: Building2, name: "Waste generator", what: "Forecasts and pickup requests for a zone" },
  { icon: Truck, name: "Fleet operator", what: "Routes that carry more in fewer trips" },
  { icon: Warehouse, name: "Hub operator", what: "Weigh, check the sort, approve the plant" },
  { icon: Zap, name: "Plant operator", what: "Incoming loads and meter readings" },
  { icon: ShieldCheck, name: "System operator", what: "The whole network, decisions and models" },
] as const;

export function Roles() {
  return (
    <>
      <SectionHead eyebrow="Six roles, one network" title="Everyone sees the part of the loop they run."
        lede="Every role has a demo account. Pick one and you land on that role's working screen." />
      <div data-stagger className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ROLES.map(({ icon: Icon, name, what }) => (
          <Link key={name} href="/login" className="group flex items-start gap-4 rounded-2xl border border-line bg-panel p-4 transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-accent/50">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-dim text-accent"><Icon className="size-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2 font-medium text-ink">{t(name)}<ArrowRight className="size-4 text-ink-3 transition-transform group-hover:translate-x-1 group-hover:text-accent" /></span>
              <span className="mt-0.5 block text-sm leading-snug text-ink-2">{t(what)}</span>
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
