"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Upload, Check } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { Badge, Button, ErrorBox, Loading, PageHeader, Panel, SimTag, Status, Td, Th } from "@/components/ui";
import { CompositionBar } from "@/components/charts";
import { DecisionView } from "@/features/decisions/DecisionView";
import { BUSINESS_LABEL, cx, kg, kwh, n, pct, STREAM_COLOR, STREAM_LABEL, STREAMS, TECH_LABEL, dateTime, NONE } from "@/lib/format";

import { t, tEnum } from "@/lib/i18n";
export function Classification({ id }: { id: string }) {
  const role = useAuth((s) => s.user?.role);
  const canAct = role === "hub" || role === "admin";
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["shipment", id], queryFn: () => api.get<any>(`/hub/shipments/${id}`), refetchInterval: 8000 });
  const [imgs, setImgs] = useState<{ key: string; url: string }[]>([]);
  const [pathways, setPathways] = useState<any>(null);
  const inv = () => qc.invalidateQueries();

  // Sample audit: each photo = one randomly picked item from the load (max 20).
  const upload = useMutation({
    mutationFn: async (files: File[]) => Promise.all(files.slice(0, 20 - imgs.length).map(async (file) => {
      const fd = new FormData(); fd.append("file", file);
      const r = await api.upload<{ key: string }>("/uploads", fd);
      return { key: r.key, url: URL.createObjectURL(file) };
    })),
    onSuccess: (added) => setImgs((cur) => [...cur, ...added]),
  });
  const classify = useMutation({ mutationFn: () => api.post("/ai/classify", { shipment_id: Number(id), image_keys: imgs.map((i) => i.key) }), onSuccess: inv });
  const predict = useMutation({ mutationFn: () => api.post("/ai/predict-energy", { shipment_id: Number(id) }), onSuccess: setPathways });
  const optimize = useMutation({ mutationFn: () => api.post("/ai/optimize-destination", { shipment_id: Number(id) }), onSuccess: inv });

  const cls = data?.classifications?.find((c: any) => c.status !== "rejected");
  useEffect(() => { if (cls && cls.status !== "pending_review" && !pathways && !predict.isPending) predict.mutate(); }, [cls?.id, cls?.status]); // eslint-disable-line

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const sh = data.shipment;
  const total = sh.measured_kg ?? sh.total_kg;
  const comp = cls ? (cls.corrected ?? cls.composition) : null;
  const facDecision = data.decisions.find((d: any) => d.kind === "facility_selection" && d.inputs.stream === "organic") ?? data.decisions.find((d: any) => d.kind === "facility_selection");
  const others = data.decisions.filter((d: any) => d !== facDecision);
  const fbFor = (d: any) => data.feedback.find((f: any) => f.decision_id === d.id || (f.kind === "energy" && f.stream === d.inputs.stream));

  return (
    <div className="space-y-5">
      <PageHeader crumb={<Link href="/hub">{t("Processing hub")}</Link>} title={<span className="flex items-center gap-3"><span className="num">{sh.code}</span><Status s={sh.status} />{sh.is_simulated && <SimTag />}</span>}
        subtitle={t("{s} · {h} · arrived {d}", { s: sh.source_label, h: `${sh.hub_code} ${sh.hub_name}`, d: dateTime(sh.arrived_at) })} />

      <Steps sh={sh} cls={cls} decided={data.decisions.length > 0} />

      <div className="grid gap-5 xl:grid-cols-[1fr_1.2fr]">
        <Panel title={t("Received load")}>
          <div className="grid grid-cols-3 gap-3">
            <div><div className="text-xs text-ink-3">{t("Weighbridge")}</div><div className="num font-serif text-2xl font-medium">{n(total)} <span className="text-sm text-ink-3">kg</span></div></div>
            <div><div className="text-xs text-ink-3">{t("Moisture, estimated")}</div><div className="num font-serif text-2xl font-medium">{sh.moisture_pct != null ? pct(sh.moisture_pct) : NONE}</div></div>
            <div><div className="text-xs text-ink-3">{t("Sources")}</div><div className="num font-serif text-2xl font-medium">{sh.source_mix.length}</div></div>
          </div>
          <table className="mt-4 w-full"><thead><tr><Th>{t("Source")}</Th><Th>{t("Type")}</Th><Th right>{t("Declared")}</Th></tr></thead>
            <tbody>{sh.source_mix.map((m: any, i: number) => <tr key={i}><Td className="text-ink">{m.name}</Td><Td>{BUSINESS_LABEL[m.business_type] ?? m.business_type}</Td><Td right mono>{kg(m.kg)}</Td></tr>)}</tbody></table>
          {!cls && canAct && (
            <div className="mt-4 space-y-3 border-t border-line pt-4">
              <div className="text-sm font-medium">{t("Sort this load")}</div>
              <label className="flex cursor-pointer items-center gap-3 rounded border border-dashed border-line-2 p-3 text-sm text-ink-2 hover:border-ink-3">
                <Upload className="size-5 shrink-0" />
                <span>{upload.isPending ? t("Uploading…") : imgs.length ? t("{n} sample photos attached. You can add up to 20.", { n: imgs.length }) : t("Optional: photograph 5 to 20 items picked at random from the load")}</span>
                <input type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.length && upload.mutate(Array.from(e.target.files))} />
              </label>
              {imgs.length > 0 && <div className="flex flex-wrap gap-1.5">{imgs.map((i) => <img key={i.key} src={i.url} alt={t("Sample item")} className="size-12 rounded object-cover" />)}</div>}
              <p className="flex gap-1.5 text-xs text-ink-3">{t("The first estimate comes from the source mix, load size and season. Photos are read by an image model (EfficientNetB0, 30 item types sorted into streams) and move that estimate. A photo under 50% confidence is ignored and flagged for review. On real photos it was right 62 to 79% of the time overall, and 79 to 91% on the confident ones.")}</p>
              <Button variant="primary" loading={classify.isPending} onClick={() => classify.mutate()}>{t("Sort this load")}</Button>
              {(classify.error || upload.error) && <ErrorBox error={classify.error ?? upload.error} />}
            </div>
          )}
        </Panel>

        {cls ? <ClassificationPanel cls={cls} total={total} canAct={canAct} /> : <Panel title={t("Sort result")}><div className="py-10 text-center text-sm text-ink-3">{t("This load has not been sorted yet.")}</div></Panel>}
      </div>

      {comp && cls.status !== "pending_review" && (
        <Panel title={t("Energy prediction")} subtitle={t("Expected useful energy for each stream and technology. The model assumes an average plant, and figures taken from the literature are flagged.")}
          actions={!pathways && <Button size="sm" loading={predict.isPending} onClick={() => predict.mutate()}>{t("Predict energy")}</Button>}>
          {predict.error && <ErrorBox error={predict.error} />}
          {pathways ? <Pathways p={pathways} /> : predict.isPending ? <Loading label={t("Predicting")} /> : null}
          {pathways && data.decisions.length === 0 && canAct && (
            <div className="mt-4 flex items-center gap-3 border-t border-line pt-4">
              <Button variant="primary" loading={optimize.isPending} onClick={() => optimize.mutate()}>{t("Compare plants and pick one")}</Button>
              <span className="text-xs text-ink-3">{t("Scores every eligible plant for each stream, using the weights in Settings.")}</span>
            </div>
          )}
          {optimize.error && <ErrorBox error={optimize.error} />}
        </Panel>
      )}

      {facDecision && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-ink-2">{t("Choice of plant")}</h2>
          <DecisionView d={{ ...facDecision, origin_lat: sh.lat, origin_lng: sh.lng }} outcome={fbFor(facDecision)} />
        </div>
      )}
      {others.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {others.map((d: any) => <DecisionView key={d.id} d={{ ...d, origin_lat: sh.lat, origin_lng: sh.lng }} outcome={fbFor(d)} compact />)}
        </div>
      )}

      {data.predictions.length > 0 && (
        <Panel title={t("Prediction record")} subtitle={t("Predicted kWh, metered kWh and the training row they produce")} bodyClass="p-0">
          <table className="w-full"><thead><tr><Th>{t("Stream")}</Th><Th>{t("Plant")}</Th><Th>{t("Technology")}</Th><Th right>{t("Input")}</Th><Th right>{t("Predicted")}</Th><Th right>{t("90% range")}</Th><Th right>{t("Metered")}</Th><Th right>{t("Error")}</Th><Th>{t("Model")}</Th></tr></thead>
            <tbody>{data.predictions.map((p: any) => {
              const err = p.actual_kwh != null ? ((p.actual_kwh - p.predicted_kwh) / p.predicted_kwh) * 100 : null;
              return <tr key={p.id}><Td><span className="inline-block size-2 rounded-sm" style={{ background: STREAM_COLOR[p.stream] }} /> {STREAM_LABEL[p.stream]}</Td><Td className="text-ink">{p.facility_label}</Td><Td>{TECH_LABEL[p.technology]}</Td><Td right mono>{kg(p.quantity_kg)}</Td><Td right mono className="text-ink">{kwh(p.predicted_kwh)}</Td><Td right mono>{n(p.interval_low)}–{n(p.interval_high)}</Td><Td right mono className="text-gold">{p.actual_kwh != null ? kwh(p.actual_kwh) : t(t("Pending"))}</Td><Td right mono>{err != null ? `${err > 0 ? "+" : ""}${err.toFixed(1)}%` : NONE}</Td><Td className="num text-xs">{p.model_version}</Td></tr>;
            })}</tbody></table>
        </Panel>
      )}
    </div>
  );
}

function Steps({ sh, cls, decided }: { sh: any; cls: any; decided: boolean }) {
  const steps = [
    ["Weighed", true], ["Sorted", !!cls], ["Checked by operator", cls && cls.status !== "pending_review"], ["Plant chosen", decided],
    ["Dispatched", ["dispatched", "processed"].includes(sh.status)], ["Energy reading saved", sh.status === "processed"],
  ] as const;
  return (
    <div className="flex flex-wrap gap-2">
      {steps.map(([l, ok], i) => <Badge key={l} tone={ok ? "green" : "neutral"}>{ok ? <Check className="size-3" /> : <span className="num">{i + 1}</span>}{t(l)}</Badge>)}
    </div>
  );
}

function ClassificationPanel({ cls, total, canAct }: { cls: any; total: number; canAct: boolean }) {
  const qc = useQueryClient();
  const [edit, setEdit] = useState(false);
  const base = cls.corrected ?? cls.composition;
  const [draft, setDraft] = useState<Record<string, number>>(() => Object.fromEntries(STREAMS.map((s) => [s, Math.round(base[s] * 1000) / 10])));
  const review = useMutation({
    mutationFn: (action: "confirm" | "edit" | "reject") => api.post(`/hub/classifications/${cls.id}/review`, { action, corrected: action === "edit" ? Object.fromEntries(STREAMS.map((s) => [s, draft[s] / 100])) : undefined }),
    onSuccess: () => { setEdit(false); qc.invalidateQueries(); },
  });
  const comp = base;
  const sum = STREAMS.reduce((a, s) => a + (draft[s] ?? 0), 0);
  const pie = STREAMS.map((s) => ({ name: STREAM_LABEL[s], key: s, value: comp[s] }));

  return (
    <Panel title={<span className="flex items-center gap-2">{t("Sort result")} <Status s={cls.status} /></span>}
      subtitle={t("{m} · model {v}", { m: cls.method, v: cls.model_version })}>
      <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
        <div className="relative h-[180px]">
          <ResponsiveContainer><PieChart><Pie data={pie} dataKey="value" innerRadius={58} outerRadius={84} stroke="var(--panel)" strokeWidth={2} isAnimationActive={false}>{pie.map((p) => <Cell key={p.key} fill={STREAM_COLOR[p.key]} />)}</Pie>
            <Tooltip formatter={(v: any) => `${(v * 100).toFixed(1)}%`} contentStyle={{ background: "var(--raised)", border: "1px solid var(--line-2)", borderRadius: 6, fontSize: 12 }} /></PieChart></ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center"><div><div className="num text-xl font-medium">{(cls.confidence * 100).toFixed(1)}%</div><div className="text-xs text-ink-3">{t("Confidence")}</div></div></div>
        </div>
        <div>
          <table className="w-full"><thead><tr><Th>{t("Detected")}</Th><Th right>{t("Share")}</Th><Th right>{t("Mass")}</Th><Th right>{t("Spread")}</Th></tr></thead>
            <tbody>{STREAMS.map((s) => (
              <tr key={s}><Td><span className="mr-1.5 inline-block size-2 rounded-sm" style={{ background: STREAM_COLOR[s] }} />{STREAM_LABEL[s]}</Td>
                <Td right mono className="text-ink">{edit ? <input type="number" step="0.1" min={0} max={100} value={draft[s]} onChange={(e) => setDraft({ ...draft, [s]: Number(e.target.value) })} className="num h-7 w-20 rounded border border-line-2 bg-canvas px-1.5 text-right" /> : `${(comp[s] * 100).toFixed(1)}%`}</Td>
                <Td right mono>{kg((edit ? draft[s] / 100 : comp[s]) * total)}</Td>
                <Td right mono className="text-ink-3">{cls.uncertainty?.[s] != null ? t("{n} points", { n: (cls.uncertainty[s] * 100).toFixed(1) }) : NONE}</Td></tr>
            ))}</tbody></table>
          {edit && <div className={cx("mt-2 text-xs", Math.abs(sum - 100) > 2 ? "text-crit" : "text-ink-3")}>{t("Total {n}%. It must be 100%.", { n: sum.toFixed(1) })}</div>}
        </div>
      </div>
      <div className="mt-4"><CompositionBar comp={edit ? Object.fromEntries(STREAMS.map((s) => [s, Math.max(0, draft[s]) / Math.max(1, sum)])) : comp} totalKg={total} /></div>
      {cls.vision?.photos?.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <div className="mb-2 text-xs text-ink-3">{t("Photo sample: {a} photos, {b} flagged for review", { a: cls.vision.photos.length, b: cls.vision.flagged_for_review })}</div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {cls.vision.photos.map((p: any, i: number) => (
              <div key={i} className={cx("flex items-center justify-between rounded border px-2 py-1.5 text-xs", p.needs_review ? "border-warn/40 bg-warn/5" : "border-line")}>
                <span className="truncate"><span className="num text-ink-3">#{i + 1}</span> {tEnum(p.top[0].label)} <span className="text-ink-3">· {STREAM_LABEL[p.stream] ?? p.stream}</span></span>
                <span className="num shrink-0 pl-2">{(p.confidence * 100).toFixed(0)}%{p.needs_review ? ` · ${t("review")}` : p.weight < 1 ? ` · ${t("half weight")}` : ""}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-3">{t("Before the photos, the source-mix model put organic at {a}%. The photos moved it to {b}%.", { a: (cls.vision.prior_composition.organic * 100).toFixed(1), b: (cls.composition.organic * 100).toFixed(1) })}</p>
        </div>
      )}
      {cls.status === "corrected" && <p className="mt-3 text-xs text-blue">{t("Correction saved as training data. The model said organic {a}%, the operator said {b}%.", { a: (cls.composition.organic * 100).toFixed(0), b: (cls.corrected.organic * 100).toFixed(0) })}%).</p>}
      {canAct && cls.status === "pending_review" && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
          {!edit ? <>
            <Button variant="primary" loading={review.isPending && review.variables === "confirm"} onClick={() => review.mutate("confirm")}>{t("Confirm")}</Button>
            <Button onClick={() => setEdit(true)}>{t("Edit")}</Button>
            <Button variant="danger" loading={review.isPending && review.variables === "reject"} onClick={() => review.mutate("reject")}>{t("Reject")}</Button>
          </> : <>
            <Button variant="primary" disabled={Math.abs(sum - 100) > 2} loading={review.isPending} onClick={() => review.mutate("edit")}>{t("Save the correction")}</Button>
            <Button variant="ghost" onClick={() => setEdit(false)}>{t("Cancel")}</Button>
          </>}
        </div>
      )}
      {review.error && <div className="mt-2"><ErrorBox error={review.error} /></div>}
    </Panel>
  );
}

function Pathways({ p }: { p: any }) {
  const order = ["organic", "plastic", "paper", "metal", "other"];
  const streams = [...p.streams].sort((a: any, b: any) => order.indexOf(a.stream) - order.indexOf(b.stream));
  const org = streams.find((s: any) => s.stream === "organic");
  const rec = org?.options.find((o: any) => o.technology === org.recommended);
  return (
    <div className="space-y-5">
      {org && rec && (
        <div className="grid gap-4 rounded-lg border border-line-2 bg-raised/60 p-4 md:grid-cols-[1.2fr_2fr]">
          <div>
            <div className="text-xs text-ink-3">{t("Quantity")}</div>
            <div className="num text-lg font-semibold">{t("{n} kg organic", { n: n(org.kg) })}</div>
            <div className="mt-2 text-xs text-ink-3">{t("Recommended technology")}</div>
            <div className="text-lg font-medium text-accent">{TECH_LABEL[org.recommended]}</div>
            <p className="mt-2 text-xs text-ink-2">{org.reason}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Mini label={t("Biogas")} value={rec.biogas_m3 != null ? `${n(rec.biogas_m3)} m³` : NONE} />
            <Mini label={t("Electricity")} value={kwh(rec.electricity_kwh)} />
            <Mini label={t("Heat")} value={kwh(rec.heat_kwh)} />
            <Mini label={t("Confidence")} value={rec.confidence != null ? pct(rec.confidence * 100) : NONE} sub={rec.interval ? t("{a} to {b} kWh", { a: n(rec.interval[0]), b: n(rec.interval[1]) }) : ""} />
          </div>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {streams.map((s: any) => (
          <div key={s.stream} className="rounded-md border border-line p-3">
            <div className="mb-2 flex items-center justify-between text-sm"><span className="flex items-center gap-2"><span className="size-2 rounded-sm" style={{ background: STREAM_COLOR[s.stream] }} /><span className="font-medium">{STREAM_LABEL[s.stream]}</span> <span className="num text-ink-3">{kg(s.kg)}</span></span><span className="text-xs text-accent">→ {TECH_LABEL[s.recommended] ?? NONE}</span></div>
            <div className="space-y-1.5">
              {s.options.map((o: any, i: number) => (
                <div key={o.technology} className={cx("grid grid-cols-[18px_1fr_90px] items-center gap-2 rounded px-2 py-1.5 text-xs", o.technology === s.recommended ? "bg-accent/10" : "")}>
                  <span className="num text-ink-3">{String.fromCharCode(65 + i)}</span>
                  <span><span className="text-ink">{TECH_LABEL[o.technology]}</span>{!o.available && <span className="ml-1 text-ink-3">{t("(no plant)")}</span>}<div className="text-xs text-ink-3">{o.basis}</div></span>
                  <span className="num text-right text-ink">{o.technology === "material_recovery" ? t("Material") : kwh(o.expected_kwh)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Mini({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div><div className="text-xs text-ink-3">{label}</div><div className="num text-base font-semibold">{value}</div>{sub && <div className="num text-xs text-ink-3">{sub}</div>}</div>;
}
