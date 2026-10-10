"use client";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle2, Loader2, CircleDashed, ArrowRight, AlertTriangle } from "lucide-react";
import { useLive } from "@/store/live";
import { cx, kwh, n, STREAM_COLOR, STREAM_LABEL } from "@/lib/format";

const STAGES = [
  "Waste discovered", "Pickups requested", "Pickup route optimized", "Waste collected", "AI classification", "Energy prediction",
  "Facilities evaluated", "Best destination selected", "Route generated", "Energy generated", "Feedback recorded",
];

/** Live narration of "Run Full Optimization" — every line is a real API result streamed over the WebSocket. */
export function DemoOverlay() {
  const demo = useLive((s) => s.demo);
  if (!demo.open) return null;
  const byStage = new Map(demo.stages.map((s) => [s.stage, s]));
  const current = demo.running ? Math.max(-1, ...demo.stages.map((s) => s.stage)) + 1 : -1;
  const sel = byStage.get(7)?.data?.decision;
  const fb = byStage.get(10)?.data?.feedback?.find((f: any) => f?.stream === "organic");
  const comp = byStage.get(4)?.data?.classification?.composition;

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[min(460px,calc(100vw-2rem))] overflow-hidden rounded-md border border-line-2 bg-panel/95 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <div>
          <div className="text-xs font-semibold text-ink">Full optimization run — hero scenario</div>
          <div className="text-[11px] text-ink-3">MCD Central + South + West zones · 10 t transfer load · real Delhi facilities, simulated trucks &amp; meters</div>
        </div>
        <button onClick={() => useLive.getState().demoOpen(false)} className="text-ink-3 hover:text-ink" aria-label="Hide"><X className="size-4" /></button>
      </div>
      <ol className="max-h-[52vh] space-y-0 overflow-y-auto px-4 py-3">
        {STAGES.map((label, i) => {
          const st = byStage.get(i);
          const state = st ? "done" : i === current ? "active" : "todo";
          return (
            <li key={i} className="relative flex gap-3 pb-3 last:pb-0">
              {i < STAGES.length - 1 && <span className={cx("absolute left-[7px] top-5 h-[calc(100%-12px)] w-px", st ? "bg-accent/50" : "bg-line-2")} />}
              <span className="relative mt-0.5">
                {state === "done" ? <CheckCircle2 className="size-4 text-accent" /> : state === "active" ? <Loader2 className="size-4 animate-spin text-cyan" /> : <CircleDashed className="size-4 text-ink-3" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className={cx("text-xs font-medium", st ? "text-ink" : state === "active" ? "text-cyan" : "text-ink-3")}>{label}</div>
                <AnimatePresence>
                  {st && <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-0.5 text-[11px] leading-snug text-ink-2">{st.message}</motion.div>}
                </AnimatePresence>
                {i === 4 && comp && (
                  <div className="mt-1.5 flex h-2 overflow-hidden rounded-sm" aria-label="composition">
                    {Object.entries(comp).map(([k, v]: any) => <div key={k} title={`${STREAM_LABEL[k]} ${Math.round(v * 100)}%`} style={{ width: `${v * 100}%`, background: STREAM_COLOR[k] }} className="border-r-2 border-panel last:border-r-0" />)}
                  </div>
                )}
                {i === 6 && st?.data?.ranking && (
                  <div className="mt-1.5 space-y-1">
                    {st.data.ranking.filter((r: any) => r.eligible).map((r: any) => (
                      <div key={r.facility_id} className="grid grid-cols-[72px_1fr_44px] items-center gap-2 text-[11px]">
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
        <div className="border-t border-line bg-accent/5 px-4 py-3">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div><div className="text-[10px] uppercase tracking-wider text-ink-3">Predicted</div><div className="num text-sm font-semibold">{kwh(fb?.predicted_kwh)}</div></div>
            <div><div className="text-[10px] uppercase tracking-wider text-ink-3">Actual</div><div className="num text-sm font-semibold text-accent">{kwh(fb?.actual_kwh)}</div></div>
            <div><div className="text-[10px] uppercase tracking-wider text-ink-3">Error</div><div className="num text-sm font-semibold">{fb ? `${Math.abs(fb.error_pct).toFixed(1)}%` : "—"}</div></div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {demo.decisionId && <Link href={`/ai-decisions/${demo.decisionId}`} className="inline-flex items-center gap-1 rounded bg-accent px-2.5 py-1.5 text-xs font-semibold text-[#04140b]">Inspect AI decision <ArrowRight className="size-3" /></Link>}
            {demo.shipmentId && <Link href={`/hub/classification/${demo.shipmentId}`} className="inline-flex items-center gap-1 rounded border border-line-2 px-2.5 py-1.5 text-xs text-ink-2 hover:text-ink">Shipment trace</Link>}
            <Link href="/ai-model" className="inline-flex items-center gap-1 rounded border border-line-2 px-2.5 py-1.5 text-xs text-ink-2 hover:text-ink">Feedback loop</Link>
          </div>
          {sel && <p className="mt-2 text-[11px] text-ink-3">{sel.explanation?.vs_nearest}</p>}
        </div>
      )}
    </div>
  );
}
