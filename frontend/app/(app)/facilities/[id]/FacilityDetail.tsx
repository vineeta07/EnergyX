"use client";
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gauge } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { Button, ErrorBox, Input, Kpi, Loading, PageHeader, Panel, SimTag, Status, Td, Th, Select } from "@/components/ui";
import { PredictedVsActual, SimpleBars, TrendArea } from "@/components/charts";
import { dateTime, kg, kwh, n, pct, STREAM_LABEL, TECH_LABEL } from "@/lib/format";

export function FacilityDetail({ id }: { id: string }) {
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["facility", id], queryFn: () => api.get<any>(`/facilities/${id}`), refetchInterval: 10_000 });
  const [manual, setManual] = useState<Record<number, string>>({});
  const report = useMutation({ mutationFn: (b: any) => api.post("/energy/output", b), onSuccess: () => qc.invalidateQueries() });
  const patch = useMutation({ mutationFn: (b: any) => api.patch(`/facilities/${id}`, b), onSuccess: () => qc.invalidateQueries() });
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const { facility: f, stats, daily, capabilities, incoming, awaiting_output: pending, recent_outputs: recent } = data;
  const mine = user?.role === "admin" || (user?.role === "facility" && user.facility_id === f.id);

  return (
    <div className="space-y-5">
      <PageHeader crumb={<Link href="/facilities">Facilities</Link>} title={<span className="flex items-center gap-3">{f.label} — {f.name}<Status s={f.status} />{f.simulated_meter && <SimTag label="SIMULATED METER" />}</span>}
        subtitle={`${TECH_LABEL[f.technology]} · ${f.lat.toFixed(4)}, ${f.lng.toFixed(4)} · gate fee ₹${n(f.gate_fee_inr_per_t)}/t`}
        actions={mine && <Select className="w-40" value={f.status} onChange={(e) => patch.mutate({ status: e.target.value })}><option value="online">Online</option><option value="maintenance">Maintenance</option><option value="offline">Offline</option></Select>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Kpi label="Technology" value={<span className="text-base">{TECH_LABEL[f.technology]}</span>} />
        <Kpi label="Capacity" value={n(f.capacity_tpd)} unit="t/day" />
        <Kpi label="Utilization" value={pct(f.utilization_pct)} sub={`${n(f.capacity_tpd * (1 - f.utilization_pct / 100), 1)} t/day free`} />
        <Kpi label="Avg efficiency" value={pct(stats.avg_efficiency_pct ?? f.efficiency_pct, 1)} sub={`rated ${pct(f.efficiency_pct)}`} />
        <Kpi label="Historical yield" value={stats.historical_yield_kwh_per_kg != null ? n(stats.historical_yield_kwh_per_kg, 2) : "—"} unit="kWh/kg" sub={`${stats.readings} readings`} accent />
        <Kpi label="Carbon intensity" value={n(f.carbon_intensity, 2)} unit="kg CO₂/kWh" />
      </div>
      <div className="flex flex-wrap gap-2 text-xs">Compatible: {capabilities.map((c: any) => <span key={c.stream} className="rounded border border-line-2 px-2 py-0.5">{STREAM_LABEL[c.stream]} · {c.compatibility_pct}%{c.max_moisture_pct ? ` · ≤${c.max_moisture_pct}% moisture` : ""}</span>)}</div>

      {mine && (
        <Panel title={<span className="flex items-center gap-2"><Gauge className="size-4 text-accent" />Report actual energy output</span>} subtitle="Each report closes the loop: error vs prediction is computed and stored as a training row." bodyClass="p-0">
          {pending.length === 0 ? <div className="p-4 text-sm text-ink-3">No delivered loads awaiting an output report.</div> : (
            <table className="w-full"><thead><tr><Th>Shipment</Th><Th>Stream</Th><Th right>Input</Th><Th right>Predicted</Th><Th>Decision</Th><Th>Actual kWh</Th><Th /></tr></thead>
              <tbody>{pending.map((p: any) => (
                <tr key={p.id}><Td mono>{p.shipment_code}</Td><Td>{STREAM_LABEL[p.stream]}</Td><Td right mono>{kg(p.quantity_kg)}</Td><Td right mono className="text-ink">{kwh(p.predicted_kwh)}</Td><Td>{p.decision_code} {p.decision_status && <Status s={p.decision_status} />}</Td>
                  <Td><Input className="h-8 w-28" type="number" min={0} placeholder="meter kWh" value={manual[p.id] ?? ""} onChange={(e) => setManual({ ...manual, [p.id]: e.target.value })} /></Td>
                  <Td><div className="flex gap-1.5">
                    <Button size="sm" variant="primary" disabled={!manual[p.id]} loading={report.isPending} onClick={() => report.mutate({ prediction_id: p.id, actual_kwh: Number(manual[p.id]) })}>Submit</Button>
                    {f.simulated_meter && <Button size="sm" loading={report.isPending} onClick={() => report.mutate({ prediction_id: p.id, simulate: true })}>Read simulated meter</Button>}
                  </div></Td></tr>
              ))}</tbody></table>
          )}
          {(report.error || patch.error) && <div className="p-3"><ErrorBox error={report.error ?? patch.error} /></div>}
        </Panel>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Daily throughput (kg)"><SimpleBars data={daily} dataKey="kg" name="Throughput" unit=" kg" color="var(--s-paper)" /></Panel>
        <Panel title="Energy output (kWh)"><SimpleBars data={daily} dataKey="kwh" name="Energy" unit=" kWh" color="var(--s-organic)" /></Panel>
        <Panel title="Measured efficiency (%)" subtitle="Actual output ÷ theoretical potential of the input"><TrendArea data={daily.filter((d: any) => d.efficiency != null)} dataKey="efficiency" name="Efficiency" unit="%" color="var(--s-plastic)" /></Panel>
        <Panel title="Predicted vs actual (kWh)"><PredictedVsActual data={daily.map((d: any) => ({ date: d.date, predicted_kwh: d.predicted, matched_actual_kwh: d.matched_actual }))} height={220} /></Panel>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Incoming shipments" bodyClass="p-0">
          <table className="w-full"><thead><tr><Th>Route</Th><Th>Vehicle</Th><Th right>Load</Th><Th>Status</Th><Th>Created</Th></tr></thead>
            <tbody>{incoming.map((r: any) => <tr key={r.id}><Td mono>{r.code}</Td><Td>{r.vehicle_code}</Td><Td right mono>{kg(r.load_kg)}</Td><Td><Status s={r.status} /></Td><Td>{dateTime(r.created_at)}</Td></tr>)}</tbody></table>
          {!incoming.length && <div className="p-4 text-sm text-ink-3">No dispatches yet.</div>}
        </Panel>
        <Panel title="Recent meter readings" bodyClass="p-0">
          <table className="w-full"><thead><tr><Th>When</Th><Th>Stream</Th><Th right>Input</Th><Th right>Predicted</Th><Th right>Actual</Th><Th>Source</Th></tr></thead>
            <tbody>{recent.map((o: any) => <tr key={o.id}><Td>{dateTime(o.recorded_at)}</Td><Td>{STREAM_LABEL[o.stream]}</Td><Td right mono>{kg(o.input_kg)}</Td><Td right mono>{o.predicted_kwh != null ? kwh(o.predicted_kwh) : "—"}</Td><Td right mono className="text-ink">{kwh(o.actual_kwh)}</Td><Td className="text-[11px]">{o.source}</Td></tr>)}</tbody></table>
        </Panel>
      </div>
    </div>
  );
}
