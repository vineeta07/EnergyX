"use client";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle2, Loader2, CircleDashed, AlertTriangle } from "lucide-react";
import { useLive } from "@/store/live";
import { cx, kwh, n, STREAM_COLOR, STREAM_LABEL, NONE } from "@/lib/format";

import { t } from "@/lib/i18n";
const STAGES = [
  "Waste found", "Pickups requested", "Pickup routes planned", "Waste collected", "Load sorted", "Energy predicted",
  "Plants compared", "Plant chosen", "Delivery route set", "Energy generated", "Result saved",
];

/** Live narration of "Run a full load". Every line is a real API result streamed over the WebSocket. */
export function DemoOverlay() {
  const demo = useLive((s) => s.demo);
  if (!demo.open) return null;
  const byStage = new Map(demo.stages.map((s) => [s.stage, s]));
  const current = demo.running ? Math.max(-1, ...demo.stages.map((s) => s.stage)) + 1 : -1;
  const sel = byStage.get(7)?.data?.decision;
  const fb = byStage.get(10)?.data?.feedback?.find((f: any) => f?.stream === "organic");
  const comp = byStage.get(4)?.data?.classification?.composition;

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[min(460px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-line-2 bg-panel shadow-[var(--popover-shadow)]">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <div>
          <div className="text-sm font-medium text-ink">{t("One full load, start to finish")}</div>
          <div className="text-xs text-ink-3">{t("MCD Central, South and West zones, a 10 t transfer load. Real Delhi plants, simulated trucks and meters.")}</div>
        </div>
        <button onClick={() => useLive.getState().demoOpen(false)} className="text-ink-3 hover:text-ink" aria-label={t("Hide")}><X className="size-4" /></button>
      </div>
      <ol className="max-h-[52vh] space-y-0 overflow-y-auto px-4 py-3">
        {STAGES.map((label, i) => {
          const st = byStage.get(i);
          const state = st ? "done" : i === current ? "active" : "todo";
          return (
            <li key={i} className="relative flex gap-3 pb-3 last:pb-0">
              {i < STAGES.length - 1 && <span className={cx("absolute left-[7px] top-5 h-[calc(100%-12px)] w-px", st ? "bg-accent/50" : "bg-line-2")} />}
              <span className="relative mt-0.5">
                {state === "done" ? <CheckCircle2 className="size-4 text-accent" /> : state === "active" ? <Loader2 className="size-4 animate-spin text-blue" /> : <CircleDashed className="size-4 text-ink-3" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className={cx("text-xs font-medium", st ? "text-ink" : state === "active" ? "text-blue" : "text-ink-3")}>{t(label)}</div>
                <AnimatePresence>
                  {st && <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-0.5 text-xs leading-snug text-ink-2">{st.message}</motion.div>}
                </AnimatePresence>
                {i === 4 && comp && (
                  <div className="mt-1.5 flex h-2 overflow-hidden rounded-sm" aria-label={t("Composition")}>
                    {Object.entries(comp).map(([k, v]: any) => <div key={k} title={`${STREAM_LABEL[k]} ${Math.round(v * 100)}%`} style={{ width: `${v * 100}%`, background: STREAM_COLOR[k] }} className="border-r-2 border-panel last:border-r-0" />)}
                  </div>
                )}
                {i === 6 && st?.data?.ranking && (
                  <div className="mt-1.5 space-y-1">
                    {st.data.ranking.filter((r: any) => r.eligible).map((r: any) => (
                      <div key={r.facility_id} className="grid grid-cols-[72px_1fr_44px] items-center gap-2 text-xs">
                        <span className="text-ink-2">{r.label}</span>
                        <div className="h-1.5 rounded-sm bg-line"><div className="h-full rounded-sm bg-accent" style={{ width: `${r.score}%`, opacity: r.rank === 1 ? 1 : 0.45 }} /></div>
                        <span className="num text-right text-ink">{n(r.score)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {demo.error && <div className="flex items-center gap-2 border-t border-line bg-crit/10 px-4 py-2 text-xs text-crit"><AlertTriangle className="size-3.5" />{demo.error}</div>}
      {demo.done && (
        <div className="border-t border-line bg-raised px-4 py-3">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div><div className="text-xs text-ink-3">{t("Predicted")}</div><div className="num text-sm font-medium">{kwh(fb?.predicted_kwh)}</div></div>
            <div><div className="text-xs text-ink-3">{t("Metered")}</div><div className="num text-sm font-medium text-gold">{kwh(fb?.actual_kwh)}</div></div>
            <div><div className="text-xs text-ink-3">{t("Error")}</div><div className="num text-sm font-medium">{fb ? `${Math.abs(fb.error_pct).toFixed(1)}%` : NONE}</div></div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {demo.decisionId && <Link href={`/ai-decisions/${demo.decisionId}`} className="inline-flex items-center rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-on-accent">{t("See the plant decision")}</Link>}
            {demo.shipmentId && <Link href={`/hub/classification/${demo.shipmentId}`} className="inline-flex items-center rounded-md border border-line-2 px-2.5 py-1.5 text-xs text-ink-2 hover:text-ink">{t("Shipment trace")}</Link>}
            <Link href="/ai-model" className="inline-flex items-center rounded-md border border-line-2 px-2.5 py-1.5 text-xs text-ink-2 hover:text-ink">{t("Feedback")}</Link>
          </div>
          {sel && <p className="mt-2 text-xs text-ink-3">{sel.explanation?.vs_nearest}</p>}
        </div>
      )}
    </div>
  );
}
