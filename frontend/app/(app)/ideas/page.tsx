"use client";
import { useState } from "react";
import { ArrowLeft, Check, Clock, Lightbulb } from "lucide-react";
import { api } from "@/lib/api";
import { cx } from "@/lib/format";
import { t } from "@/lib/i18n";
import { IDEAS, IDEA_CATEGORY, type Idea } from "@/lib/ideas";
import { param, useApplyReward, type Reward } from "@/lib/resident";
import { Card, ResidentPage, showReward } from "@/features/resident/ui";

const SEEN_KEY = "wattcycle-ideas-read";
const loadSeen = (): string[] => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]"); } catch { return []; } };

export default function Ideas() {
  const apply = useApplyReward();
  // Arriving from a scan result (/ideas?m=pet_bottle) or the demo (/ideas?read=<slug>). This screen only ever renders in the browser, after sign-in.
  const [cat, setCat] = useState<string | null>(() => { const m = param("m"); return m && IDEA_CATEGORY[m] ? m : null; });
  const [open, setOpen] = useState<Idea | null>(() => IDEAS.find((i) => i.slug === param("read")) ?? null);
  const [seen, setSeen] = useState<string[]>(loadSeen);

  async function read(idea: Idea) {
    setOpen(idea);
    window.scrollTo({ top: 0 });
    if (!seen.includes(idea.slug)) {
      const next = [...seen, idea.slug];
      setSeen(next);
      try { localStorage.setItem(SEEN_KEY, JSON.stringify(next)); } catch { /* storage can be blocked */ }
    }
    // The server gives the points once per idea, however often it is opened.
    try { const r = await api.post<Reward>("/citizen/guide", { slug: idea.slug }); apply(r); showReward(r); } catch { /* reading still works offline */ }
  }

  if (open) {
    return (
      <ResidentPage title={<span data-notr>{open.title}</span>} subtitle={<span data-notr>{open.blurb}</span>}
        actions={<button onClick={() => setOpen(null)} className="inline-flex items-center gap-1.5 rounded-full border border-line-2 px-4 py-2 text-sm text-ink hover:border-ink-3"><ArrowLeft className="size-4" />{t("All ideas")}</button>}>
        <div className="flex flex-wrap gap-2 text-sm text-ink-2">
          <span className="rounded-full bg-raised px-3 py-1.5">{t(IDEA_CATEGORY[open.category])}</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-raised px-3 py-1.5"><Clock className="size-4" />{t("{n} minutes", { n: open.minutes })}</span>
          <span className="rounded-full bg-raised px-3 py-1.5">{t(open.level)}</span>
        </div>
        <Card>
          <h2 className="text-[15px] font-semibold text-ink">{t("You will need")}</h2>
          <ul data-notr className="mt-2 grid gap-1.5 text-[15px] text-ink-2 sm:grid-cols-2">{open.need.map((x) => <li key={x} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />{x}</li>)}</ul>
        </Card>
        <Card>
          <h2 className="text-[15px] font-semibold text-ink">{t("Steps")}</h2>
          <ol data-notr className="mt-3 space-y-4">
            {open.steps.map((s, i) => (
              <li key={i} className="flex gap-3.5">
                <span className="num grid size-8 shrink-0 place-items-center rounded-full bg-accent-dim text-sm font-semibold text-accent">{i + 1}</span>
                <p className="pt-1 text-[15px] leading-relaxed text-ink-2">{s}</p>
              </li>
            ))}
          </ol>
        </Card>
        <Card className="flex gap-3 bg-raised/60"><Lightbulb className="mt-0.5 size-5 shrink-0 text-gold" /><p data-notr className="text-[15px] leading-relaxed text-ink-2">{open.tip}</p></Card>
      </ResidentPage>
    );
  }

  const cats = Object.keys(IDEA_CATEGORY).filter((c) => IDEAS.some((i) => i.category === c));
  const list = IDEAS.filter((i) => !cat || i.category === cat);
  return (
    <ResidentPage wide title={t("Upcycling ideas")} subtitle={t("Things worth making from what would otherwise go in the bin. Each one uses tools you already have at home.")}>
      <div className="flex flex-wrap gap-2">
        {[null, ...cats].map((c) => (
          <button key={c ?? "all"} onClick={() => setCat(c)} className={cx("rounded-full border px-3.5 py-2 text-sm transition-colors", cat === c ? "border-accent bg-accent/10 text-ink" : "border-line-2 text-ink-2 hover:border-ink-3")}>
            {c ? t(IDEA_CATEGORY[c]) : t("All")}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((i) => (
          <button key={i.slug} onClick={() => read(i)} className="group flex flex-col rounded-2xl border border-line bg-panel p-5 text-left shadow-[var(--shadow)] transition-all hover:-translate-y-0.5 hover:border-line-2">
            <div className="flex items-center justify-between text-xs text-ink-3">
              <span>{t(IDEA_CATEGORY[i.category])}</span>
              {seen.includes(i.slug) && <span className="inline-flex items-center gap-1 text-accent"><Check className="size-3.5" />{t("Read")}</span>}
            </div>
            <h2 data-notr className="mt-2 font-serif text-xl font-medium leading-snug text-ink">{i.title}</h2>
            <p data-notr className="mt-1.5 flex-1 text-sm leading-relaxed text-ink-2">{i.blurb}</p>
            <div className="mt-4 flex items-center gap-3 text-xs text-ink-3"><span className="inline-flex items-center gap-1"><Clock className="size-3.5" />{t("{n} minutes", { n: i.minutes })}</span><span>{t(i.level)}</span><span className="ml-auto text-accent group-hover:underline">{t("Read")}</span></div>
          </button>
        ))}
      </div>
    </ResidentPage>
  );
}
