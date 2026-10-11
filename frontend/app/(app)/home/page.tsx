"use client";
import Link from "next/link";
import { Award, ChevronRight, CircleHelp, Flame, Lightbulb, MapPin, Megaphone, Recycle, ScanLine, Trophy } from "lucide-react";
import { useAuth } from "@/store/auth";
import { ErrorBox, Loading } from "@/components/ui";
import { ago, cx, n } from "@/lib/format";
import { t } from "@/lib/i18n";
import { MATERIAL_LABEL, VERDICT, useProfile } from "@/lib/resident";
import { GrowthRing } from "@/features/resident/Plant";
import { Card, MaterialDot, ResidentPage } from "@/features/resident/ui";
import { ResidentDemoLink } from "@/features/resident/ResidentDemo";

const ACTIONS = [
  { href: "/resin", icon: Recycle, title: "Plastic codes", body: "What the number in the triangle means" },
  { href: "/ideas", icon: Lightbulb, title: "Upcycling ideas", body: "Things to make from what you would throw away" },
  { href: "/leaderboard", icon: Trophy, title: "Leaderboard", body: "See how your neighbours are doing" },
  { href: "/quiz", icon: CircleHelp, title: "Daily quiz", body: "Five items, one minute, points for every right bin" },
  { href: "/dropoff", icon: MapPin, title: "Where to take it", body: "Recycling centres and workshops near you" },
  { href: "/report", icon: Megaphone, title: "Report a problem", body: "A full bin or a missed pickup in your lane" },
];

export default function Home() {
  const user = useAuth((s) => s.user)!;
  const { data: p, isLoading, error } = useProfile();
  if (isLoading) return <Loading />;
  if (error || !p) return <ErrorBox error={error} />;
  const first = user.name.split(" ")[0];
  const left = Math.max(0, p.today.cap - p.today.scans);
  const maxMat = Math.max(1, ...p.by_material.map((m) => m.n));

  return (
    <ResidentPage title={<span data-notr>{t("Hello, {name}", { name: first })}</span>} subtitle={t("Check an item before it goes in the bin. Every one you sort grows your plant.")}>
      <Card className="grid items-center gap-6 sm:grid-cols-[auto_1fr]">
        <div className="mx-auto" data-tour="plant">
          <GrowthRing level={p.level.n} progress={p.level.progress} size={196}>
            <div className="-mt-1 text-center">
              <div className="text-xs text-ink-3">{t("Level {n}", { n: p.level.n })}</div>
              <div className="font-serif text-lg font-medium leading-tight text-ink">{t(p.level.name)}</div>
            </div>
          </GrowthRing>
        </div>
        <div className="min-w-0 text-center sm:text-left">
          <div className="flex items-baseline justify-center gap-2 sm:justify-start"><span className="num font-serif text-5xl font-medium text-ink">{n(p.points)}</span><span className="text-sm text-ink-3">{t("points")}</span></div>
          <p className="mt-1 text-[15px] text-ink-2">
            {p.level.next_name ? t("{n} more points and your plant becomes a {name}.", { n: p.level.to_next, name: t(p.level.next_name).toLowerCase() }) : t("Your plant is fully grown. Keep the grove going.")}
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2 text-sm sm:justify-start">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-raised px-3 py-1.5 text-ink-2"><Flame className={cx("size-4", p.streak > 0 ? "text-warn" : "text-ink-3")} />{p.streak > 0 ? t("{n} days in a row", { n: p.streak }) : t("Start a streak today")}</span>
            {p.rank && <Link href="/leaderboard" className="inline-flex items-center gap-1.5 rounded-full bg-raised px-3 py-1.5 text-ink-2 hover:text-ink"><Trophy className="size-4 text-gold" />{t("Rank {n}", { n: p.rank })}</Link>}
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 sm:justify-start">
            <Link href="/scan" data-tour="scan-cta" className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-accent px-6 text-[15px] font-medium text-on-accent hover:opacity-90">
              <ScanLine className="size-5" />{t("Scan an item")}
            </Link>
            <ResidentDemoLink />
          </div>
          <p className="mt-2 text-xs text-ink-3">{left > 0 ? t("{n} more scans earn points today.", { n: left }) : t("You have reached today's points limit. Scans still count towards your tally.")}</p>
        </div>
      </Card>

      {!p.quiz_done_today && (
        <Link href="/quiz" className="group flex items-center gap-4 rounded-2xl border border-gold/40 bg-gold/10 p-4 transition-all hover:-translate-y-0.5">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-panel text-gold"><CircleHelp className="size-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium text-ink">{t("Today's quiz is waiting")}</span>
            <span className="block text-sm text-ink-2">{t("Five items, one minute. Up to {n} points.", { n: 10 })}</span>
          </span>
          <ChevronRight className="size-5 text-ink-3 transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        {ACTIONS.map((a) => (
          <Link key={a.href} href={a.href} className="group rounded-2xl border border-line bg-panel p-4 shadow-[var(--shadow)] transition-all hover:-translate-y-0.5 hover:border-line-2">
            <a.icon className="size-5 text-accent" />
            <div className="mt-2 flex items-center justify-between text-[15px] font-medium text-ink">{t(a.title)}<ChevronRight className="size-4 text-ink-3 transition-transform group-hover:translate-x-0.5" /></div>
            <div className="mt-0.5 text-sm leading-snug text-ink-3">{t(a.body)}</div>
          </Link>
        ))}
      </div>

      <div className="grid items-start gap-5 md:grid-cols-2">
        <Card>
          <h2 className="text-[15px] font-semibold text-ink">{t("What you sort most")}</h2>
          {p.by_material.length === 0 ? <p className="mt-3 text-sm text-ink-3">{t("Nothing yet. Your first scan will show up here.")}</p> : (
            <ul className="mt-3 space-y-2.5">
              {p.by_material.map((m) => (
                <li key={m.material} className="grid grid-cols-[110px_1fr_auto] items-center gap-3 text-sm">
                  <span className="flex items-center gap-2 text-ink-2"><MaterialDot material={m.material} />{t(MATERIAL_LABEL[m.material] ?? m.material)}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-line"><span className="block h-full rounded-full bg-accent" style={{ width: `${(m.n / maxMat) * 100}%` }} /></span>
                  <span className="num text-ink">{m.n === 1 ? t("once") : t("{n} times", { n: m.n })}</span>
                </li>
              ))}
            </ul>
          )}
          {p.counts.scans > 0 && <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-ink-3">{t("About {a} kg sorted, {b} kg of it kept out of the landfill. Estimated from typical item weights.", { a: n(p.impact.sorted_kg, 1), b: n(p.impact.kept_from_landfill_kg, 1) })}</p>}
        </Card>

        <Card>
          <h2 className="text-[15px] font-semibold text-ink">{t("Badges")}</h2>
          <ul className="mt-3 grid grid-cols-2 gap-2.5">
            {p.badges.map((b) => (
              <li key={b.key} title={t(b.how)} className={cx("rounded-xl border p-3", b.earned ? "border-accent/40 bg-accent/10" : "border-line bg-raised/50")}>
                <div className="flex items-center gap-2"><Award className={cx("size-4 shrink-0", b.earned ? "text-accent" : "text-ink-3")} /><span className={cx("truncate text-sm font-medium", b.earned ? "text-ink" : "text-ink-2")}>{t(b.name)}</span></div>
                <div className="mt-1 text-xs leading-snug text-ink-3">{t(b.how)}</div>
                {!b.earned && <div className="mt-2 flex items-center gap-2"><span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line"><span className="block h-full rounded-full bg-accent" style={{ width: `${(b.have / b.need) * 100}%` }} /></span><span className="num text-[11px] text-ink-3">{b.have}/{b.need}</span></div>}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <h2 className="text-[15px] font-semibold text-ink">{t("Recently")}</h2>
        {p.recent.length === 0 ? <p className="mt-3 text-sm text-ink-3">{t("Nothing yet.")}</p> : (
          <ul className="mt-2 divide-y divide-line/70">
            {p.recent.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2.5 text-sm">
                <MaterialDot material={r.material} />
                <span className="min-w-0 flex-1 truncate text-ink">{r.kind === "scan" ? t(r.name) : r.kind === "resin" ? t("Looked up plastic code {n}", { n: r.item }) : r.kind === "quiz" ? t("Daily quiz: {s} right", { s: r.method ?? "" }) : r.kind === "report" ? t("Reported a problem") : t("Read an upcycling idea")}</span>
                {r.verdict && <span className="hidden text-xs sm:block" style={{ color: VERDICT[r.verdict].color }}>{t(VERDICT[r.verdict].title)}</span>}
                <span className="num w-10 text-right text-xs text-accent">{r.points > 0 ? `+${r.points}` : ""}</span>
                <span className="w-20 text-right text-xs text-ink-3">{ago(r.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </ResidentPage>
  );
}
