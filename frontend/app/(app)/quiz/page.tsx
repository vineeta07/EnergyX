"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronRight, RotateCcw, X } from "lucide-react";
import { api } from "@/lib/api";
import { ErrorBox, Loading } from "@/components/ui";
import { cx } from "@/lib/format";
import { t } from "@/lib/i18n";
import { BIN, BIN_CHOICE, MATERIAL_LABEL, useApplyReward, useCatalogue, type Item, type Reward } from "@/lib/resident";
import { BigButton, Card, MaterialDot, ResidentPage, showReward } from "@/features/resident/ui";

interface Quiz { day: string; items: string[]; done: { score: number; points: number } | null; points_per_right: number }
type Result = Reward & { score: number; already: boolean; results: { item: string; answer: string | null; bin: string; right: boolean }[] };

export default function DailyQuiz() {
  const cat = useCatalogue();
  const q = useQuery({ queryKey: ["resident", "quiz"], queryFn: () => api.get<Quiz>("/citizen/quiz") });
  const apply = useApplyReward();
  const [playing, setPlaying] = useState(false);
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Item["bin"]>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [err, setErr] = useState<unknown>(null);

  if (cat.isLoading || q.isLoading) return <Loading />;
  if (cat.error || q.error || !cat.data || !q.data) return <ErrorBox error={cat.error ?? q.error} />;
  const items = q.data.items.map((k) => cat.data.items.find((x) => x.key === k)!).filter(Boolean);
  const cur = items[i];
  const picked = cur ? answers[cur.key] : undefined;
  const per = q.data.points_per_right;

  function start() { setAnswers({}); setI(0); setResult(null); setErr(null); setPlaying(true); }
  async function finish() {
    try {
      const r = await api.post<Result>("/citizen/quiz", { answers });
      apply(r); showReward(r); setResult(r); setPlaying(false);
      q.refetch();
    } catch (e) { setErr(e); }
  }

  return (
    <ResidentPage title={t("Daily quiz")} subtitle={t("Five household items. Pick where each one goes. {n} points for every right answer, once a day.", { n: per })}>
      {err != null && <ErrorBox error={err} />}

      {!playing && !result && (
        <Card className="text-center">
          {q.data.done ? (
            <>
              <p className="font-serif text-2xl font-medium text-ink">{t("{a} of {b} right today", { a: q.data.done.score, b: items.length })}</p>
              <p className="mt-1 text-[15px] text-ink-2">{t("Come back tomorrow for five new items. You can practise today's again, without points.")}</p>
              <BigButton tone="quiet" className="mt-5" onClick={start}><RotateCcw className="size-4" />{t("Practise again")}</BigButton>
            </>
          ) : (
            <>
              <div className="mx-auto flex justify-center gap-2" aria-hidden>
                {items.map((it) => <span key={it.key} className="grid size-10 place-items-center rounded-full bg-raised"><MaterialDot material={it.material} className="size-3" /></span>)}
              </div>
              <p className="mt-4 text-[15px] text-ink-2">{t("Today's five are ready. It takes about a minute.")}</p>
              <BigButton className="mt-5" onClick={start}>{t("Start the quiz")}</BigButton>
            </>
          )}
        </Card>
      )}

      {playing && cur && (
        <Card>
          <div className="flex items-center justify-between">
            <div className="flex gap-1.5" aria-label={t("Question {a} of {b}", { a: i + 1, b: items.length })}>
              {items.map((it, j) => (
                <span key={it.key} className={cx("h-1.5 w-8 rounded-full", j < i ? (answers[it.key] === it.bin ? "bg-accent" : "bg-warn") : j === i ? "bg-ink-3" : "bg-line")} />
              ))}
            </div>
            <span className="num text-sm text-ink-3">{i + 1}/{items.length}</span>
          </div>

          <div className="mt-5 flex items-center gap-2 text-xs text-ink-3"><MaterialDot material={cur.material} />{t(MATERIAL_LABEL[cur.material] ?? cur.material)}</div>
          <h2 className="mt-1 font-serif text-[26px] font-medium leading-tight text-ink">{t(cur.name)}</h2>
          <p className="mt-1 text-[15px] text-ink-2">{t("Where does it go?")}</p>

          <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
            {BIN_CHOICE.map((c) => {
              const right = picked && c.bin === cur.bin;
              const wrong = picked === c.bin && c.bin !== cur.bin;
              return (
                <button key={c.bin} disabled={!!picked} onClick={() => setAnswers((a) => ({ ...a, [cur.key]: c.bin }))}
                  className={cx("flex min-h-14 items-center gap-3 rounded-2xl border px-4 py-3 text-left text-[15px] transition-all",
                    !picked && "border-line hover:-translate-y-0.5 hover:border-line-2",
                    right && "border-accent bg-accent/10", wrong && "border-warn bg-warn/10", picked && !right && !wrong && "border-line opacity-55")}>
                  <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: c.color }} />
                  <span className="flex-1 text-ink">{t(c.label)}</span>
                  {right && <Check className="size-5 text-accent" />}
                  {wrong && <X className="size-5 text-warn" />}
                </button>
              );
            })}
          </div>

          {picked && (
            <div className="mt-4 rounded-xl bg-raised/70 p-4 text-sm">
              <p className={cx("font-medium", picked === cur.bin ? "text-accent" : "text-warn")}>
                {picked === cur.bin ? t("Right.") : t("Not quite. It goes in: {bin}", { bin: t(BIN[cur.bin]).toLowerCase() })}
              </p>
              <p data-notr className="mt-1 leading-relaxed text-ink-2">{cur.why}</p>
              <div className="mt-3 flex justify-end">
                {i + 1 < items.length
                  ? <BigButton onClick={() => setI(i + 1)}>{t("Next")}<ChevronRight className="size-4" /></BigButton>
                  : <BigButton onClick={finish}>{t("See my score")}</BigButton>}
              </div>
            </div>
          )}
        </Card>
      )}

      {result && (
        <Card>
          <div className="text-center">
            <p className="font-serif text-3xl font-medium text-ink">{t("{a} of {b} right", { a: result.score, b: result.results.length })}</p>
            <p className="mt-1 text-[15px] text-ink-2">
              {result.already ? t("Practice round. Points are given for the first try of the day.") : result.awarded > 0 ? t("{n} points added to your plant.", { n: result.awarded }) : t("No points this time. Tomorrow brings five new items.")}
            </p>
          </div>
          <ul className="mt-4 divide-y divide-line/70">
            {result.results.map((r) => {
              const it = cat.data.items.find((x) => x.key === r.item)!;
              return (
                <li key={r.item} className="flex items-center gap-3 py-2.5 text-sm">
                  {r.right ? <Check className="size-4 shrink-0 text-accent" /> : <X className="size-4 shrink-0 text-warn" />}
                  <span className="min-w-0 flex-1 truncate text-ink">{t(it.name)}</span>
                  <span className="text-xs text-ink-3">{t(BIN[it.bin as Item["bin"]])}</span>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Link href="/home" className="inline-flex h-12 items-center rounded-full bg-accent px-6 text-[15px] font-medium text-on-accent hover:opacity-90">{t("Back home")}</Link>
            <BigButton tone="quiet" onClick={start}><RotateCcw className="size-4" />{t("Practise again")}</BigButton>
          </div>
        </Card>
      )}
    </ResidentPage>
  );
}
