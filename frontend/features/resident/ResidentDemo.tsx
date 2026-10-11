"use client";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, Play, RotateCcw, Square, X } from "lucide-react";
import { useAuth } from "@/store/auth";
import { cx, n } from "@/lib/format";
import { t } from "@/lib/i18n";
import { DEMO_EMAIL, DEMO_STEPS, closeResidentDemo, startResidentDemo, stopResidentDemo, useResidentDemo } from "./demo";
import { showReward } from "./ui";

/** The demo runs only on the demo resident account, which the server can safely reset. */
export function useCanPlayDemo() {
  const user = useAuth((s) => s.user);
  return user?.role === "citizen" && user.email.toLowerCase() === DEMO_EMAIL;
}

function useStart() {
  const router = useRouter();
  const qc = useQueryClient();
  return () => { void startResidentDemo({ push: router.push, qc, show: showReward }); };
}

/** Header button: the resident counterpart of "Run a full load". */
export function ResidentDemoButton() {
  const can = useCanPlayDemo();
  const running = useResidentDemo((s) => s.running);
  const at = useResidentDemo((s) => s.at);
  const start = useStart();
  if (!can) return null;
  if (running) {
    return (
      <button onClick={() => useResidentDemo.setState({ open: true })} className="flex h-8 items-center gap-1.5 rounded-md border border-accent/50 px-2.5 text-xs font-medium text-accent">
        <span className="live-dot size-1.5 rounded-full bg-accent" />{t("Demo step {a} of {b}", { a: Math.min(DEMO_STEPS.length, at + 1), b: DEMO_STEPS.length })}
      </button>
    );
  }
  return (
    <button data-tour="resident-demo" onClick={start} className="flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-xs font-medium text-on-accent hover:opacity-90">
      <Play className="size-3.5 fill-current" /><span className="hidden sm:inline">{t("Play the demo")}</span><span className="sm:hidden">{t("Demo")}</span>
    </button>
  );
}

/** Quiet invitation on the home screen. */
export function ResidentDemoLink({ className }: { className?: string }) {
  const can = useCanPlayDemo();
  const running = useResidentDemo((s) => s.running);
  const start = useStart();
  if (!can || running) return null;
  return (
    <button onClick={start} className={cx("inline-flex items-center gap-1.5 text-sm text-accent underline-offset-4 hover:underline", className)}>
      <Play className="size-3.5 fill-current" />{t("Watch a 30-second demo")}
    </button>
  );
}

/** Narration of the resident demo. Each line is the result of a real API call. */
export function ResidentDemoPanel() {
  const d = useResidentDemo();
  const start = useStart();
  if (!d.open) return null;
  const stopped = !d.running && !d.done && !d.error;
  const s = d.summary;

  return (
    <section aria-label={t("Resident demo")} className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 overflow-hidden rounded-2xl border border-line-2 bg-panel shadow-[var(--popover-shadow)] lg:inset-x-auto lg:bottom-4 lg:right-4 lg:w-[400px]">
      <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium text-ink">{t("One bottle, start to finish")}</h2>
          <p className="text-xs leading-snug text-ink-3">{t("Real screens and real points on the demo account. About 30 seconds.")}</p>
        </div>
        {d.running ? (
          <button onClick={stopResidentDemo} className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-line-2 px-2.5 text-xs text-ink-2 hover:border-ink-3 hover:text-ink"><Square className="size-3 fill-current" />{t("Stop")}</button>
        ) : (
          <button onClick={closeResidentDemo} className="shrink-0 text-ink-3 hover:text-ink" aria-label={t("Close")}><X className="size-4" /></button>
        )}
      </header>

      <div className="flex gap-1 px-4 pt-3" aria-hidden>
        {DEMO_STEPS.map((step, i) => (
          <span key={step.key} className={cx("h-1 flex-1 rounded-full transition-colors", d.done || i < d.at ? "bg-accent" : i === d.at && d.running ? "bg-accent/45" : "bg-line")} />
        ))}
      </div>

      <ol className="max-h-[34vh] overflow-y-auto px-4 py-3 lg:max-h-[56vh]" aria-live="polite">
        {DEMO_STEPS.map((step, i) => {
          const state = d.done || i < d.at ? "done" : i === d.at && d.running ? "active" : "todo";
          const note = d.notes[step.key];
          return (
            // On phones only the step in progress is shown, so the screen behind stays visible.
            <li key={step.key} className={cx("relative flex gap-3 pb-3 last:pb-0", state !== "active" && "max-lg:hidden")}>
              {i < DEMO_STEPS.length - 1 && <span className={cx("absolute left-[7px] top-5 h-[calc(100%-12px)] w-px max-lg:hidden", state === "done" ? "bg-accent/50" : "bg-line-2")} />}
              <span className="relative mt-0.5">
                {state === "done" ? <CheckCircle2 className="size-4 text-accent" /> : state === "active" ? <Loader2 className="size-4 animate-spin text-accent" /> : <CircleDashed className="size-4 text-ink-3" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className={cx("text-xs font-medium", state === "todo" ? "text-ink-3" : "text-ink")}>
                  <span className="num mr-1 text-ink-3 lg:hidden">{i + 1}/{DEMO_STEPS.length}</span>{t(step.title)}
                </div>
                {note && <div data-notr className="mt-0.5 text-xs leading-snug text-ink-2">{note}</div>}
              </div>
            </li>
          );
        })}
      </ol>

      {d.error && (
        <div className="flex items-start gap-2 border-t border-line bg-crit/10 px-4 py-2.5 text-xs text-crit"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{t(d.error)}</div>
      )}
      {s && (
        <div className="grid grid-cols-3 gap-2 border-t border-line bg-raised px-4 py-3 text-center">
          <div><div className="text-xs text-ink-3">{t("Points")}</div><div className="num text-sm font-medium text-ink">+{n(s.gained)}</div></div>
          <div><div className="text-xs text-ink-3">{t("Level")}</div><div className="text-sm font-medium text-ink">{t(s.to.level.name)}</div></div>
          <div><div className="text-xs text-ink-3">{t("Rank")}</div><div className="num text-sm font-medium text-ink">{s.from.rank && s.to.rank && s.from.rank !== s.to.rank ? `${s.from.rank} → ${s.to.rank}` : s.to.rank ?? "–"}</div></div>
        </div>
      )}
      {(d.done || d.error || stopped) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
          <button onClick={start} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-xs font-medium text-on-accent hover:opacity-90"><RotateCcw className="size-3.5" />{d.done ? t("Play again") : t("Start again")}</button>
          <button onClick={closeResidentDemo} className="inline-flex h-8 items-center rounded-md border border-line-2 px-3 text-xs text-ink-2 hover:border-ink-3 hover:text-ink">{t("Close")}</button>
          {stopped && <span className="text-xs text-ink-3">{t("Stopped. Points earned so far stay on the demo account.")}</span>}
        </div>
      )}
    </section>
  );
}
