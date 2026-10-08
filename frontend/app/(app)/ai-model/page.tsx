"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Database, ShieldCheck, Filter, Wand2, Split, Cpu, BarChart, Tag, Rocket, Server, MessageSquareReply, Repeat } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { Badge, Button, ErrorBox, Loading, PageHeader, Panel, Status, Td, Th } from "@/components/ui";
import { cx, dateTime, n, pct } from "@/lib/format";

const PIPE = [
  ["Raw data", Database], ["Validation", ShieldCheck], ["Cleaning", Filter], ["Missing values", Filter], ["Outliers", Filter], ["Features", Wand2],
  ["Train/val/test split", Split], ["Training", Cpu], ["Evaluation", BarChart], ["Versioning", Tag], ["Deployment", Rocket], ["Prediction API", Server],
  ["Production feedback", MessageSquareReply], ["Retraining set", Database], ["Periodic retraining", Repeat],
] as const;

const NAMES: Record<string, string> = { forecast: "Model 1 · Waste generation forecast", classifier: "Model 2 · Waste composition", energy: "Model 3 · Energy yield" };

export default function AiModel() {
  const role = useAuth((s) => s.user?.role);
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["models"], queryFn: () => api.get<any>("/models"), refetchInterval: 8000 });
  const retrain = useMutation({ mutationFn: (key: string) => api.post(`/models/${key}/retrain`), onSuccess: () => qc.invalidateQueries({ queryKey: ["models"] }) });
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const active = (key: string) => data.versions.find((v: any) => v.model_key === key && v.status === "active");
  const fb = (kind: string) => data.feedback.find((f: any) => f.kind === kind);
  const running = data.runs.some((r: any) => r.status === "running");

  return (
    <div className="space-y-5">
      <PageHeader title="AI Model Performance" subtitle="Offline-trained models with versioned artifacts, held-out evaluation against naive baselines, and a production feedback loop that feeds retraining. Models do not 'self-train' — retraining is an explicit, logged pipeline run."
        actions={role === "admin" && <Button variant="primary" loading={retrain.isPending || running} onClick={() => retrain.mutate("all")}><RefreshCw className="size-4" />{running ? "Training…" : "Retrain all models"}</Button>} />
      {retrain.error && <ErrorBox error={retrain.error} />}

      <Panel title="Training pipeline" subtitle="ml/pipelines/train.py — same code runs locally and as a SageMaker training job">
        <div className="flex flex-wrap items-center gap-1.5">
          {PIPE.map(([l, I], i) => (
            <div key={l} className="flex items-center gap-1.5">
              <span className={cx("flex items-center gap-1.5 rounded border px-2 py-1 text-[11px]", i >= 12 ? "border-accent/30 bg-accent/10 text-accent" : "border-line-2 bg-raised text-ink-2")}><I className="size-3" />{l}</span>
              {i < PIPE.length - 1 && <span className="text-ink-3">→</span>}
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-3">
        {(["forecast", "classifier", "energy"] as const).map((key) => {
          const v = active(key);
          const m = v?.metrics ?? {};
          return (
            <Panel key={key} title={NAMES[key]} subtitle={v ? v.algorithm : "not trained yet"} actions={role === "admin" && <Button size="sm" loading={retrain.isPending && retrain.variables === key} disabled={running} onClick={() => retrain.mutate(key)}>Retrain</Button>}>
              {!v ? <div className="text-sm text-ink-3">Waiting for bootstrap training…</div> : (
                <>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                    <dt className="text-ink-3">Model version</dt><dd className="num text-right text-ink">{v.version}</dd>
                    <dt className="text-ink-3">Training date</dt><dd className="text-right">{dateTime(v.trained_at)}</dd>
                    <dt className="text-ink-3">Dataset size</dt><dd className="num text-right">{n(v.dataset_size)} rows</dd>
                    <dt className="text-ink-3">Test rows</dt><dd className="num text-right">{n(m.n)}</dd>
                  </dl>
                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3">
                    {key !== "classifier" ? <>
                      <Metric l="MAE" v={`${n(m.mae, 1)} ${key === "energy" ? "kWh" : "kg"}`} />
                      <Metric l="RMSE" v={n(m.rmse, 1)} />
                      <Metric l="R²" v={n(m.r2, 3)} />
                      <Metric l="Prediction error (MAPE)" v={pct(m.mape * 100, 1)} accent />
                      <Metric l="Naive baseline MAPE" v={pct((m.baseline_mape_seasonal_naive ?? m.baseline_mape_hist_yield) * 100, 1)} />
                      <Metric l="Accuracy" v={pct((1 - m.mape) * 100, 1)} />
                    </> : <>
                      <Metric l="Composition MAE" v={`${n(m.mae * 100, 2)} pp`} accent />
                      <Metric l="Precision" v={n(m.precision, 3)} />
                      <Metric l="Recall" v={n(m.recall, 3)} />
                      <Metric l="F1 score" v={n(m.f1, 3)} />
                      <Metric l="Accuracy" v={pct(m.accuracy * 100, 1)} />
                      <Metric l="Moisture MAE" v={`${n(m.moisture_mae_pp, 1)} pp`} />
                    </>}
                  </div>
                  {key === "classifier" && <p className="mt-2 text-[11px] text-ink-3">P/R/F1 are on the dominant-stream label (macro). The test set is dominated by organic-rich loads, so composition MAE is the more informative metric.</p>}
                  {key === "energy" && fb("energy") && <p className="mt-2 text-[11px] text-ink-3">Live feedback: {fb("energy").total} rows · {fb("energy").pending} not yet used in training · live MAPE {pct(fb("energy").mape, 1)}</p>}
                  {key === "classifier" && fb("classification") && <p className="mt-2 text-[11px] text-ink-3">Operator labels: {fb("classification").total} ({fb("classification").pending} pending for next run)</p>}
                </>
              )}
            </Panel>
          );
        })}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Model 4 · Destination optimization" subtitle="Weighted multi-criteria utility (configurable in Settings) + Monte-Carlo decision stability"><p className="text-sm text-ink-2">Uses Model 3 predictions for every eligible facility. Not trained — its behaviour is fully specified by the weights, so it is auditable by construction.</p></Panel>
        <Panel title="Model 5 · Route optimization" subtitle="Google OR-Tools CVRP with soft time windows"><p className="text-sm text-ink-2">Solver: {data.service?.models?.router?.algorithm ?? "OR-Tools"}. Quality is measured per route as distance saved vs individual trips, truck fill and on-time stops.</p></Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
        <Panel title="Production feedback (latest)" subtitle="Every completed conversion and every operator correction becomes a training row" bodyClass="p-0">
          <div className="max-h-96 overflow-y-auto"><table className="w-full"><thead><tr><Th>#</Th><Th>Kind</Th><Th>Facility</Th><Th right>Qty</Th><Th right>Predicted</Th><Th right>Actual</Th><Th right>Error</Th><Th>Used in run</Th></tr></thead>
            <tbody>{data.recent_feedback.map((f: any) => (
              <tr key={f.id}><Td mono>{f.id}</Td><Td><Badge tone={f.kind === "energy" ? "green" : "cyan"}>{f.kind}</Badge></Td><Td>{f.facility_label ?? "—"}</Td><Td right mono>{f.waste_quantity_kg ? `${n(f.waste_quantity_kg)} kg` : "—"}</Td>
                <Td right mono>{f.predicted_kwh != null ? n(f.predicted_kwh) : f.ai_label ? `org ${n(f.ai_label.organic * 100)}%` : "—"}</Td>
                <Td right mono className="text-ink">{f.actual_kwh != null ? n(f.actual_kwh) : f.human_label ? `org ${n(f.human_label.organic * 100)}%` : "—"}</Td>
                <Td right mono>{f.error_pct != null ? `${n(f.error_pct, 1)}%` : "—"}</Td><Td>{f.training_run_id ? <span className="num text-accent">#{f.training_run_id}</span> : <span className="text-ink-3">pending</span>}</Td></tr>
            ))}</tbody></table></div>
          {data.recent_feedback.length === 0 && <div className="p-4 text-sm text-ink-3">No live feedback yet — run the demo.</div>}
        </Panel>
        <Panel title="Training runs" bodyClass="p-0">
          <div className="max-h-96 overflow-y-auto"><table className="w-full"><thead><tr><Th>Run</Th><Th>Model</Th><Th>Trigger</Th><Th right>Rows</Th><Th>Status</Th><Th>Started</Th></tr></thead>
            <tbody>{data.runs.map((r: any) => <tr key={r.id}><Td mono>#{r.id}</Td><Td>{r.model_key}</Td><Td>{r.trigger}</Td><Td right mono>{r.dataset_size ?? "—"}</Td><Td><Status s={r.status} /></Td><Td>{dateTime(r.started_at)}</Td></tr>)}</tbody></table></div>
        </Panel>
      </div>
      <Panel title="Data quality (last run)" subtitle="Validation & cleaning report from each model's latest training run">
        <div className="grid gap-4 md:grid-cols-3">
          {(["forecast", "classifier", "energy"] as const).map((k) => {
            const run = data.runs.find((r: any) => r.model_key === k && r.status === "completed");
            const log = run?.log ?? {};
            return <div key={k} className="rounded border border-line p-3 text-xs"><div className="mb-1 font-semibold text-ink">{k}</div>
              <div className="text-ink-3">rows in → out: <span className="num text-ink-2">{log.validation?.rows_in} → {log.validation?.rows_out}</span></div>
              {log.cleaning && Object.entries(log.cleaning).map(([a, b]) => <div key={a} className="text-ink-3">{a.replace(/_/g, " ")}: <span className="num text-ink-2">{String(b)}</span></div>)}
              {log.split && <div className="text-ink-3">split: <span className="text-ink-2">{log.split.strategy}</span></div>}
              {log.snapshot && <div className="text-ink-3">snapshot: <span className="num text-ink-2">{log.snapshot}</span></div>}
            </div>;
          })}
        </div>
      </Panel>
    </div>
  );
}

function Metric({ l, v, accent }: { l: string; v: string; accent?: boolean }) {
  return <div><div className="text-[10px] uppercase tracking-wider text-ink-3">{l}</div><div className={cx("num text-sm font-semibold", accent ? "text-accent" : "text-ink")}>{v}</div></div>;
}
