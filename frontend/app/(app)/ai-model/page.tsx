"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Database, ShieldCheck, Filter, Cog, Split, Cpu, BarChart, Tag, Rocket, Server, MessageSquareReply, Repeat } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { Badge, Button, ErrorBox, Loading, PageHeader, Panel, Status, Td, Th } from "@/components/ui";
import { cx, dateTime, n, pct, NONE } from "@/lib/format";

import { t, tEnum } from "@/lib/i18n";
const PIPE = [
  ["Raw data", Database], ["Validation", ShieldCheck], ["Cleaning", Filter], ["Missing values", Filter], ["Outliers", Filter], ["Features", Cog],
  ["Train, validate, test split", Split], ["Training", Cpu], ["Evaluation", BarChart], ["Versioning", Tag], ["Deployment", Rocket], ["Prediction API", Server],
  ["Production feedback", MessageSquareReply], ["Retraining set", Database], ["Periodic retraining", Repeat],
] as const;

const NAMES: Record<string, string> = { forecast: "Model 1: Waste forecast", classifier: "Model 2: Load composition", energy: "Model 3: Energy yield" };

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
      <PageHeader title={t("Model performance")} subtitle={t("Models are trained offline, saved as numbered versions and tested on days they never saw, against simple baselines. Real results flow back as training rows. A model only changes when a retraining run is started, and every run is logged.")}
        actions={role === "admin" && <Button variant="primary" loading={retrain.isPending || running} onClick={() => retrain.mutate("all")}><RefreshCw className="size-4" />{running ? t("Training…") : t("Retrain all models")}</Button>} />
      {retrain.error && <ErrorBox error={retrain.error} />}

      <Panel title={t("Training pipeline")} subtitle={t("ml/pipelines/train.py. The same code runs locally and as a SageMaker training job.")}>
        <div className="flex flex-wrap items-center gap-1.5">
          {PIPE.map(([l, I], i) => (
            <div key={l} className="flex items-center gap-1.5">
              <span className={cx("flex items-center gap-1.5 rounded border px-2 py-1 text-xs", i >= 12 ? "border-accent/30 bg-accent/10 text-accent" : "border-line-2 bg-raised text-ink-2")}><I className="size-3" />{t(l)}</span>
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
            <Panel key={key} title={t(NAMES[key])} subtitle={v ? v.algorithm : t("Not trained yet")} actions={role === "admin" && <Button size="sm" loading={retrain.isPending && retrain.variables === key} disabled={running} onClick={() => retrain.mutate(key)}>{t("Retrain")}</Button>}>
              {!v ? <div className="text-sm text-ink-3">{t("Waiting for the first training run…")}</div> : (
                <>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                    <dt className="text-ink-3">{t("Model version")}</dt><dd className="num text-right text-ink">{v.version}</dd>
                    <dt className="text-ink-3">{t("Training date")}</dt><dd className="text-right">{dateTime(v.trained_at)}</dd>
                    <dt className="text-ink-3">{t("Dataset size")}</dt><dd className="num text-right">{t("{n} rows", { n: n(v.dataset_size) })}</dd>
                    <dt className="text-ink-3">{t("Test rows")}</dt><dd className="num text-right">{n(m.n)}</dd>
                  </dl>
                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3">
                    {key !== "classifier" ? <>
                      <Metric l={t("Mean absolute error")} v={`${n(m.mae, 1)} ${key === "energy" ? "kWh" : "kg"}`} />
                      <Metric l={t("RMSE")} v={n(m.rmse, 1)} />
                      <Metric l={t("R²")} v={n(m.r2, 3)} />
                      <Metric l={t("Average percentage error")} v={pct(m.mape * 100, 1)} accent />
                      <Metric l={t("Same for a naive baseline")} v={pct((m.baseline_mape_seasonal_naive ?? m.baseline_mape_hist_yield) * 100, 1)} />
                      <Metric l={t("Accuracy")} v={pct((1 - m.mape) * 100, 1)} />
                    </> : <>
                      <Metric l={t("Composition error")} v={t("{n} percentage points", { n: n(m.mae * 100, 2) })} accent />
                      <Metric l={t("Precision")} v={n(m.precision, 3)} />
                      <Metric l={t("Recall")} v={n(m.recall, 3)} />
                      <Metric l={t("F1 score")} v={n(m.f1, 3)} />
                      <Metric l={t("Accuracy")} v={pct(m.accuracy * 100, 1)} />
                      <Metric l={t("Moisture error")} v={t("{n} percentage points", { n: n(m.moisture_mae_pp, 1) })} />
                    </>}
                  </div>
                  {key === "classifier" && <p className="mt-2 text-xs text-ink-3">{t("Precision, recall and F1 are scored on the main stream of each load. Most test loads are mostly organic, so the composition error is the better number to watch.")}</p>}
                  {key === "energy" && fb("energy") && <p className="mt-2 text-xs text-ink-3">{t("Live feedback: {a} rows, {b} not yet used in training, live error {c}", { a: fb("energy").total, b: fb("energy").pending, c: pct(fb("energy").mape, 1) })}</p>}
                  {key === "classifier" && fb("classification") && <p className="mt-2 text-xs text-ink-3">{t("Operator labels: {a} ({b} waiting for the next run)", { a: fb("classification").total, b: fb("classification").pending })}</p>}
                </>
              )}
            </Panel>
          );
        })}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title={t("Model 4: Plant choice")} subtitle={t("A weighted score (weights are in Settings) plus a Monte-Carlo check that the winner holds")}><p className="text-sm text-ink-2">{t("Uses the Model 3 prediction for every plant that can take the load. It is not trained. The weights fully define what it does, so every result can be checked by hand.")}</p></Panel>
        <Panel title={t("Model 5: Routing")} subtitle={t("Google OR-Tools with weight limits and soft time windows")}><p className="text-sm text-ink-2">{t("Solver: {s}. Each route is scored on the distance saved against separate trips, how full the truck was and how many stops were on time.", { s: data.service?.models?.router?.algorithm ?? "OR-Tools" })}</p></Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
        <Panel title={t("Latest feedback from real use")} subtitle={t("Every finished conversion and every operator correction becomes a training row")} bodyClass="p-0">
          <div className="max-h-96 overflow-y-auto"><table className="w-full"><thead><tr><Th>#</Th><Th>{t("Kind")}</Th><Th>{t("Plant")}</Th><Th right>{t("Quantity")}</Th><Th right>{t("Predicted")}</Th><Th right>{t("Metered")}</Th><Th right>{t("Error")}</Th><Th>{t("Used in run")}</Th></tr></thead>
            <tbody>{data.recent_feedback.map((f: any) => (
              <tr key={f.id}><Td mono>{f.id}</Td><Td><Badge tone={f.kind === "energy" ? "green" : "blue"}>{tEnum(f.kind)}</Badge></Td><Td>{f.facility_label ?? NONE}</Td><Td right mono>{f.waste_quantity_kg ? `${n(f.waste_quantity_kg)} kg` : NONE}</Td>
                <Td right mono>{f.predicted_kwh != null ? n(f.predicted_kwh) : f.ai_label ? t("organic {n}%", { n: n(f.ai_label.organic * 100) }) : NONE}</Td>
                <Td right mono className="text-ink">{f.actual_kwh != null ? n(f.actual_kwh) : f.human_label ? t("organic {n}%", { n: n(f.human_label.organic * 100) }) : NONE}</Td>
                <Td right mono>{f.error_pct != null ? `${n(f.error_pct, 1)}%` : NONE}</Td><Td>{f.training_run_id ? <span className="num text-accent">#{f.training_run_id}</span> : <span className="text-ink-3">{t("Pending")}</span>}</Td></tr>
            ))}</tbody></table></div>
          {data.recent_feedback.length === 0 && <div className="p-4 text-sm text-ink-3">{t("No feedback yet. Run a full load first.")}</div>}
        </Panel>
        <Panel title={t("Training runs")} bodyClass="p-0">
          <div className="max-h-96 overflow-y-auto"><table className="w-full"><thead><tr><Th>{t("Run")}</Th><Th>{t("Model")}</Th><Th>{t("Trigger")}</Th><Th right>{t("Rows")}</Th><Th>{t("Status")}</Th><Th>{t("Started")}</Th></tr></thead>
            <tbody>{data.runs.map((r: any) => <tr key={r.id}><Td mono>#{r.id}</Td><Td>{tEnum(r.model_key)}</Td><Td>{tEnum(r.trigger)}</Td><Td right mono>{r.dataset_size ?? NONE}</Td><Td><Status s={r.status} /></Td><Td>{dateTime(r.started_at)}</Td></tr>)}</tbody></table></div>
        </Panel>
      </div>
      <Panel title={t("Data quality in the last run")} subtitle={t("Validation and cleaning report from each model's latest training run")}>
        <div className="grid gap-4 md:grid-cols-3">
          {(["forecast", "classifier", "energy"] as const).map((k) => {
            const run = data.runs.find((r: any) => r.model_key === k && r.status === "completed");
            const log = run?.log ?? {};
            return <div key={k} className="rounded-lg border border-line p-3 text-xs"><div className="mb-1 font-medium text-ink">{tEnum(k)}</div>
              <div className="text-ink-3">{t("Rows before and after")}: <span className="num text-ink-2">{log.validation?.rows_in} / {log.validation?.rows_out}</span></div>
              {log.cleaning && Object.entries(log.cleaning).map(([a, b]) => <div key={a} className="text-ink-3">{tEnum(a)}: <span className="num text-ink-2">{String(b)}</span></div>)}
              {log.split && <div className="text-ink-3">{t("Split")}: <span className="text-ink-2">{log.split.strategy}</span></div>}
              {log.snapshot && <div className="text-ink-3">{t("Snapshot")}: <span className="num text-ink-2">{log.snapshot}</span></div>}
            </div>;
          })}
        </div>
      </Panel>
    </div>
  );
}

function Metric({ l, v, accent }: { l: string; v: string; accent?: boolean }) {
  return <div><div className="text-xs text-ink-3">{l}</div><div className={cx("num text-sm font-semibold", accent ? "text-accent" : "text-ink")}>{v}</div></div>;
}
