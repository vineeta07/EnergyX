"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { ScanSearch, Upload, Check, Pencil, X, Zap, Scale, Info } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { Badge, Button, ErrorBox, Loading, PageHeader, Panel, SimTag, Status, Td, Th } from "@/components/ui";
import { CompositionBar } from "@/components/charts";
import { DecisionView } from "@/features/decisions/DecisionView";
import { cx, kg, kwh, n, pct, STREAM_COLOR, STREAM_LABEL, STREAMS, TECH_LABEL, dateTime } from "@/lib/format";

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
      <PageHeader crumb={<Link href="/hub">Processing Hub</Link>} title={<span className="flex items-center gap-3"><span className="num">{sh.code}</span><Status s={sh.status} />{sh.is_simulated && <SimTag />}</span>}
        subtitle={`${sh.source_label} · ${sh.hub_code} ${sh.hub_name} · arrived ${dateTime(sh.arrived_at)}`} />

      <Steps sh={sh} cls={cls} decided={data.decisions.length > 0} />

      <div className="grid gap-5 xl:grid-cols-[1fr_1.2fr]">
        <Panel title={<span className="flex items-center gap-2"><Scale className="size-4 text-warn" />Received load</span>}>
          <div className="grid grid-cols-3 gap-3">
            <div><div className="text-[10px] uppercase tracking-wider text-ink-3">Weighbridge</div><div className="num text-2xl font-semibold">{n(total)} <span className="text-sm text-ink-3">kg</span></div></div>
            <div><div className="text-[10px] uppercase tracking-wider text-ink-3">Moisture (est.)</div><div className="num text-2xl font-semibold">{sh.moisture_pct != null ? pct(sh.moisture_pct) : "—"}</div></div>
            <div><div className="text-[10px] uppercase tracking-wider text-ink-3">Sources</div><div className="num text-2xl font-semibold">{sh.source_mix.length}</div></div>
          </div>
          <table className="mt-4 w-full"><thead><tr><Th>Source</Th><Th>Type</Th><Th right>Declared</Th></tr></thead>
            <tbody>{sh.source_mix.map((m: any, i: number) => <tr key={i}><Td className="text-ink">{m.name}</Td><Td>{m.business_type}</Td><Td right mono>{kg(m.kg)}</Td></tr>)}</tbody></table>
          {!cls && canAct && (
            <div className="mt-4 space-y-3 border-t border-line pt-4">
              <div className="text-sm font-medium">AI waste classification</div>
              <label className="flex cursor-pointer items-center gap-3 rounded border border-dashed border-line-2 p-3 text-sm text-ink-2 hover:border-ink-3">
                <Upload className="size-5 shrink-0" />
                <span>{upload.isPending ? "Uploading…" : imgs.length ? `${imgs.length} sample photo${imgs.length > 1 ? "s" : ""} attached — add more (max 20)` : "Add sample photos (optional): photograph 5–20 randomly picked items from the load"}</span>
                <input type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.length && upload.mutate(Array.from(e.target.files))} />
              </label>
              {imgs.length > 0 && <div className="flex flex-wrap gap-1.5">{imgs.map((i) => <img key={i.key} src={i.url} alt="Sample item" className="size-12 rounded object-cover" />)}</div>}
              <p className="flex gap-1.5 text-[11px] text-ink-3"><Info className="mt-0.5 size-3 shrink-0" />Composition starts from the tabular model (source mix, load size, season). Photos are classified by the EfficientNetB0 vision model (30 item types → streams) and update that estimate; photos under 50% confidence are ignored and flagged for review. Real-photo test accuracy: 62–79% overall, 79–91% on confident photos.</p>
              <Button variant="primary" loading={classify.isPending} onClick={() => classify.mutate()}><ScanSearch className="size-4" />Analyze Waste</Button>
              {(classify.error || upload.error) && <ErrorBox error={classify.error ?? upload.error} />}
            </div>
          )}
        </Panel>

        {cls ? <ClassificationPanel cls={cls} total={total} canAct={canAct} /> : <Panel title="AI classification"><div className="py-10 text-center text-sm text-ink-3">Not analyzed yet.</div></Panel>}
      </div>

      {comp && cls.status !== "pending_review" && (
        <Panel title={<span className="flex items-center gap-2"><Zap className="size-4 text-accent" />AI energy prediction</span>} subtitle="Expected useful energy per pathway for each stream (ML model at network-average facility; literature factors flagged)"
          actions={!pathways && <Button size="sm" loading={predict.isPending} onClick={() => predict.mutate()}>Predict energy</Button>}>
          {predict.error && <ErrorBox error={predict.error} />}
          {pathways ? <Pathways p={pathways} /> : predict.isPending ? <Loading label="Predicting" /> : null}
          {pathways && data.decisions.length === 0 && canAct && (
            <div className="mt-4 flex items-center gap-3 border-t border-line pt-4">
              <Button variant="primary" loading={optimize.isPending} onClick={() => optimize.mutate()}>Evaluate facilities &amp; optimize destination</Button>
              <span className="text-xs text-ink-3">Ranks every eligible facility per stream with the configurable utility function.</span>
            </div>
          )}
          {optimize.error && <ErrorBox error={optimize.error} />}
        </Panel>
      )}

      {facDecision && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-3">Facility optimization</h2>
          <DecisionView d={{ ...facDecision, origin_lat: sh.lat, origin_lng: sh.lng }} outcome={fbFor(facDecision)} />
        </div>
      )}
      {others.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {others.map((d: any) => <DecisionView key={d.id} d={{ ...d, origin_lat: sh.lat, origin_lng: sh.lng }} outcome={fbFor(d)} compact />)}
        </div>
      )}

      {data.predictions.length > 0 && (
        <Panel title="Closed-loop record" subtitle="Prediction → actual → feedback row for retraining" bodyClass="p-0">
          <table className="w-full"><thead><tr><Th>Stream</Th><Th>Facility</Th><Th>Technology</Th><Th right>Input</Th><Th right>Predicted</Th><Th right>90% interval</Th><Th right>Actual</Th><Th right>Error</Th><Th>Model</Th></tr></thead>
            <tbody>{data.predictions.map((p: any) => {
              const err = p.actual_kwh != null ? ((p.actual_kwh - p.predicted_kwh) / p.predicted_kwh) * 100 : null;
              return <tr key={p.id}><Td><span className="inline-block size-2 rounded-sm" style={{ background: STREAM_COLOR[p.stream] }} /> {STREAM_LABEL[p.stream]}</Td><Td className="text-ink">{p.facility_label}</Td><Td>{TECH_LABEL[p.technology]}</Td><Td right mono>{kg(p.quantity_kg)}</Td><Td right mono className="text-ink">{kwh(p.predicted_kwh)}</Td><Td right mono>{n(p.interval_low)}–{n(p.interval_high)}</Td><Td right mono className="text-accent">{p.actual_kwh != null ? kwh(p.actual_kwh) : "pending"}</Td><Td right mono>{err != null ? `${err > 0 ? "+" : ""}${err.toFixed(1)}%` : "—"}</Td><Td className="num text-[11px]">{p.model_version}</Td></tr>;
            })}</tbody></table>
        </Panel>
      )}
    </div>
  );
}

function Steps({ sh, cls, decided }: { sh: any; cls: any; decided: boolean }) {
  const steps = [
    ["Weighed", true], ["AI classified", !!cls], ["Operator reviewed", cls && cls.status !== "pending_review"], ["Destination decided", decided],
    ["Dispatched", ["dispatched", "processed"].includes(sh.status)], ["Energy recorded", sh.status === "processed"],
  ] as const;
  return (
    <div className="flex flex-wrap gap-2">
      {steps.map(([l, ok], i) => <Badge key={l} tone={ok ? "green" : "neutral"}>{ok ? <Check className="size-3" /> : <span className="num">{i + 1}</span>}{l}</Badge>)}
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
    <Panel title={<span className="flex items-center gap-2"><ScanSearch className="size-4 text-cyan" />AI classification <Status s={cls.status} /></span>}
      subtitle={`${cls.method} · model ${cls.model_version}`}>
      <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
        <div className="relative h-[180px]">
          <ResponsiveContainer><PieChart><Pie data={pie} dataKey="value" innerRadius={58} outerRadius={84} stroke="var(--panel)" strokeWidth={2} isAnimationActive={false}>{pie.map((p) => <Cell key={p.key} fill={STREAM_COLOR[p.key]} />)}</Pie>
            <Tooltip formatter={(v: any) => `${(v * 100).toFixed(1)}%`} contentStyle={{ background: "var(--raised)", border: "1px solid var(--line-2)", borderRadius: 6, fontSize: 12 }} /></PieChart></ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center"><div><div className="num text-xl font-semibold">{(cls.confidence * 100).toFixed(1)}%</div><div className="text-[10px] uppercase tracking-wider text-ink-3">AI confidence</div></div></div>
        </div>
        <div>
          <table className="w-full"><thead><tr><Th>Detected</Th><Th right>Share</Th><Th right>Mass</Th><Th right>± (1σ)</Th></tr></thead>
            <tbody>{STREAMS.map((s) => (
              <tr key={s}><Td><span className="mr-1.5 inline-block size-2 rounded-sm" style={{ background: STREAM_COLOR[s] }} />{STREAM_LABEL[s]}</Td>
                <Td right mono className="text-ink">{edit ? <input type="number" step="0.1" min={0} max={100} value={draft[s]} onChange={(e) => setDraft({ ...draft, [s]: Number(e.target.value) })} className="num h-7 w-20 rounded border border-line-2 bg-canvas px-1.5 text-right" /> : `${(comp[s] * 100).toFixed(1)}%`}</Td>
                <Td right mono>{kg((edit ? draft[s] / 100 : comp[s]) * total)}</Td>
                <Td right mono className="text-ink-3">{cls.uncertainty?.[s] != null ? `${(cls.uncertainty[s] * 100).toFixed(1)} pp` : "—"}</Td></tr>
            ))}</tbody></table>
          {edit && <div className={cx("mt-2 text-xs", Math.abs(sum - 100) > 2 ? "text-crit" : "text-ink-3")}>Total {sum.toFixed(1)}% (must be 100%)</div>}
        </div>
      </div>
      <div className="mt-4"><CompositionBar comp={edit ? Object.fromEntries(STREAMS.map((s) => [s, Math.max(0, draft[s]) / Math.max(1, sum)])) : comp} totalKg={total} /></div>
      {cls.vision?.photos?.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <div className="mb-2 text-[11px] uppercase tracking-wider text-ink-3">Photo sample audit · {cls.vision.photos.length} photos · {cls.vision.flagged_for_review} flagged for review</div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {cls.vision.photos.map((p: any, i: number) => (
              <div key={i} className={cx("flex items-center justify-between rounded border px-2 py-1.5 text-xs", p.needs_review ? "border-warn/40 bg-warn/5" : "border-line")}>
                <span className="truncate"><span className="num text-ink-3">#{i + 1}</span> {p.top[0].label.replace(/_/g, " ")} <span className="text-ink-3">→ {p.stream}</span></span>
                <span className="num shrink-0 pl-2">{(p.confidence * 100).toFixed(0)}%{p.needs_review ? " · review" : p.weight < 1 ? " · ½ weight" : ""}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-ink-3">Before photos the tabular model estimated organic {(cls.vision.prior_composition.organic * 100).toFixed(1)}%; the photo evidence moved it to {(cls.composition.organic * 100).toFixed(1)}%.</p>
        </div>
      )}
      {cls.status === "corrected" && <p className="mt-3 text-xs text-cyan">Operator correction stored as labelled training data (AI said organic {(cls.composition.organic * 100).toFixed(0)}%, operator {(cls.corrected.organic * 100).toFixed(0)}%).</p>}
      {canAct && cls.status === "pending_review" && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
          {!edit ? <>
            <Button variant="primary" loading={review.isPending && review.variables === "confirm"} onClick={() => review.mutate("confirm")}><Check className="size-4" />Confirm</Button>
            <Button onClick={() => setEdit(true)}><Pencil className="size-4" />Edit</Button>
            <Button variant="danger" loading={review.isPending && review.variables === "reject"} onClick={() => review.mutate("reject")}><X className="size-4" />Reject</Button>
          </> : <>
            <Button variant="primary" disabled={Math.abs(sum - 100) > 2} loading={review.isPending} onClick={() => review.mutate("edit")}>Save correction → training data</Button>
            <Button variant="ghost" onClick={() => setEdit(false)}>Cancel</Button>
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
        <div className="grid gap-4 rounded-md border border-accent/30 bg-accent/5 p-4 md:grid-cols-[1.2fr_2fr]">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-ink-3">Waste quantity</div>
            <div className="num text-lg font-semibold">{n(org.kg)} kg organic</div>
            <div className="mt-2 text-[11px] uppercase tracking-wider text-ink-3">Recommended technology</div>
            <div className="text-lg font-semibold text-accent">{TECH_LABEL[org.recommended].toUpperCase()}</div>
            <p className="mt-2 text-xs text-ink-2">{org.reason}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Mini label="Biogas" value={rec.biogas_m3 != null ? `${n(rec.biogas_m3)} m³` : "—"} />
            <Mini label="Electricity" value={kwh(rec.electricity_kwh)} />
            <Mini label="Heat" value={kwh(rec.heat_kwh)} />
            <Mini label="Confidence" value={rec.confidence != null ? pct(rec.confidence * 100) : "—"} sub={rec.interval ? `${n(rec.interval[0])}–${n(rec.interval[1])} kWh` : ""} />
          </div>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {streams.map((s: any) => (
          <div key={s.stream} className="rounded-md border border-line p-3">
            <div className="mb-2 flex items-center justify-between text-sm"><span className="flex items-center gap-2"><span className="size-2 rounded-sm" style={{ background: STREAM_COLOR[s.stream] }} /><b>{STREAM_LABEL[s.stream]}</b> <span className="num text-ink-3">{kg(s.kg)}</span></span><span className="text-xs text-accent">→ {TECH_LABEL[s.recommended] ?? "—"}</span></div>
            <div className="space-y-1.5">
              {s.options.map((o: any, i: number) => (
                <div key={o.technology} className={cx("grid grid-cols-[18px_1fr_90px] items-center gap-2 rounded px-2 py-1.5 text-xs", o.technology === s.recommended ? "bg-accent/10" : "")}>
                  <span className="num text-ink-3">{String.fromCharCode(65 + i)}</span>
                  <span><span className="text-ink">{TECH_LABEL[o.technology]}</span>{!o.available && <span className="ml-1 text-ink-3">(no facility)</span>}<div className="text-[10px] text-ink-3">{o.basis}</div></span>
                  <span className="num text-right text-ink">{o.technology === "material_recovery" ? "material" : kwh(o.expected_kwh)}</span>
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
  return <div><div className="text-[10px] uppercase tracking-wider text-ink-3">{label}</div><div className="num text-base font-semibold">{value}</div>{sub && <div className="num text-[10px] text-ink-3">{sub}</div>}</div>;
}
