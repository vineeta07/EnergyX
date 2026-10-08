"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Zap, Gauge, Leaf, Recycle } from "lucide-react";
import { api } from "@/lib/api";
import { ErrorBox, Kpi, Loading, PageHeader, Panel, Select, SimTag, Td, Th } from "@/components/ui";
import { CalibrationScatter, HBars, InputOutputPair, PredictedVsActual } from "@/components/charts";
import { kwh, n, pct, STREAM_COLOR, STREAM_LABEL, TECH_LABEL } from "@/lib/format";

export default function Energy() {
  const [days, setDays] = useState("30");
  const { data, isLoading, error } = useQuery({ queryKey: ["energy", days], queryFn: () => api.get<any>(`/energy/analytics?days=${days}`), refetchInterval: 20_000 });
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const t = data.totals;
  const k = data.kpis;
  return (
    <div className="space-y-5">
      <PageHeader title={<span className="flex items-center gap-3">Energy Generation <SimTag label="SIMULATED METERS" /></span>} subtitle="Metered output from every facility, broken down by stream and technology, against model predictions."
        actions={<Select className="w-36" value={days} onChange={(e) => setDays(e.target.value)}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></Select>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Today" value={n(t.today)} unit="kWh" icon={<Zap className="size-4" />} />
        <Kpi label="This week" value={n(t.week)} unit="kWh" />
        <Kpi label="This month" value={n(t.month)} unit="kWh" accent />
        <Kpi label="All time" value={n(t.all_time)} unit="kWh" />
        <Kpi label="Energy generated (30d)" value={n(k.energy_kwh_30d)} unit="kWh" sub={`${n(t.month / Math.max(1, t.input_kg_30d), 3)} kWh per kg input`} />
        <Kpi label="Energy efficiency" value={pct(t.efficiency, 1)} sub="actual ÷ theoretical potential" icon={<Gauge className="size-4" />} />
        <Kpi label="CO₂ avoided (30d)" value={n(k.co2_avoided_kg_30d / 1000, 1)} unit="t" icon={<Leaf className="size-4" />} />
        <Kpi label="Diverted from landfill (30d)" value={n(k.waste_diverted_kg_30d / 1000, 1)} unit="t" icon={<Recycle className="size-4" />} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_1.4fr]">
        <Panel title="By waste stream">
          <HBars data={data.timeseries.by_stream.map((s: any) => ({ ...s, label: STREAM_LABEL[s.stream] }))} dataKey="kwh" nameKey="label" unit=" kWh" height={170} colorFor={(d) => STREAM_COLOR[d.stream]} />
          <table className="mt-3 w-full"><thead><tr><Th>Stream</Th><Th right>Input</Th><Th right>Energy</Th><Th right>kWh/kg</Th></tr></thead>
            <tbody>{data.timeseries.by_stream.map((s: any) => <tr key={s.stream}><Td><span className="mr-1.5 inline-block size-2 rounded-sm" style={{ background: STREAM_COLOR[s.stream] }} />{STREAM_LABEL[s.stream]}</Td><Td right mono>{n(s.kg)} kg</Td><Td right mono className="text-ink">{kwh(s.kwh)}</Td><Td right mono>{n(s.kwh_per_kg, 3)}</Td></tr>)}</tbody></table>
        </Panel>
        <Panel title="Waste input vs energy output" subtitle="Two panels on a shared timeline (no dual axis)"><InputOutputPair data={data.timeseries.energy} /></Panel>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Predicted vs actual over time" subtitle="Days with a model prediction"><PredictedVsActual data={data.timeseries.energy} /></Panel>
        <Panel title="Prediction calibration" subtitle={`Each dot is one conversion batch; dashed line = perfect prediction · accuracy ${pct(k.prediction_accuracy, 1)}`}><CalibrationScatter data={data.predicted_vs_actual} /></Panel>
      </div>
      <Panel title="By technology" bodyClass="p-0">
        <table className="w-full"><thead><tr><Th>Technology</Th><Th right>Input</Th><Th right>Energy</Th><Th right>kWh/kg</Th></tr></thead>
          <tbody>{data.by_technology.map((r: any) => <tr key={r.technology}><Td className="text-ink">{TECH_LABEL[r.technology]}</Td><Td right mono>{n(r.kg)} kg</Td><Td right mono className="text-ink">{kwh(r.kwh)}</Td><Td right mono>{n(r.kwh / r.kg, 3)}</Td></tr>)}</tbody></table>
      </Panel>
    </div>
  );
}
