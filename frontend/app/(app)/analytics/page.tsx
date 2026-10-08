"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ErrorBox, Kpi, Loading, PageHeader, Panel, Select, SimTag, Td, Th, Meter } from "@/components/ui";
import { HBars, PredictedVsActual, SimpleBars, TrendArea } from "@/components/charts";
import { BUSINESS_LABEL, inr, kg, kwh, n, pct, TECH_LABEL } from "@/lib/format";

export default function Analytics() {
  const [days, setDays] = useState("60");
  const { data, isLoading, error } = useQuery({ queryKey: ["analytics", days], queryFn: () => api.get<any>(`/analytics?days=${days}`) });
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const s = data.summary;
  const co2Daily = data.timeseries.energy.map((e: any) => ({ date: e.date, co2: Math.round(e.actual_kwh * data.kpis.factors.grid_kg_co2_per_kwh) }));
  return (
    <div className="space-y-5">
      <PageHeader title={<span className="flex items-center gap-3">Analytics <SimTag /></span>} subtitle="Whole-chain performance: generation, collection, conversion, cost, carbon and model accuracy."
        actions={<Select className="w-36" value={days} onChange={(e) => setDays(e.target.value)}><option value="30">30 days</option><option value="60">60 days</option><option value="120">120 days</option></Select>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Kpi label="Waste generated" value={n(s.waste_generated_kg / 1000, 1)} unit="t" />
        <Kpi label="Waste collected" value={n(s.waste_collected_kg / 1000, 1)} unit="t" sub="→ diverted from landfill" />
        <Kpi label="Energy generated" value={n(s.energy_kwh)} unit="kWh" accent />
        <Kpi label="Energy per kg" value={n(s.energy_per_kg, 3)} unit="kWh/kg" />
        <Kpi label="Transport cost" value={inr(s.transport_cost_inr)} sub={`${n(s.route_km)} km driven`} />
        <Kpi label="Cost per kWh" value={s.cost_per_kwh_inr != null ? `₹${n(s.cost_per_kwh_inr, 2)}` : "—"} sub="transport + gate fees" />
        <Kpi label="Transport CO₂" value={n(s.transport_co2_kg)} unit="kg" />
        <Kpi label="CO₂ avoided (30d)" value={n(s.co2_avoided_kg / 1000, 1)} unit="t" />
        <Kpi label="AI prediction accuracy" value={pct(data.kpis.prediction_accuracy, 1)} sub="100 − MAPE" />
        <Kpi label="Route efficiency" value={s.route_efficiency != null ? n(s.route_efficiency) : "—"} unit="/100" sub={s.baseline_km ? `${pct((1 - s.route_km / s.baseline_km) * 100)} shorter than solo trips` : ""} />
        <Kpi label="Avg facility utilization" value={pct(data.facilities.reduce((a: number, f: any) => a + f.utilization_pct, 0) / data.facilities.length)} />
        <Kpi label="Open alerts" value={data.kpis.open_alerts} />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Waste trend (kg/day recorded at sources)"><TrendArea data={data.timeseries.waste} dataKey="kg" name="Waste" unit=" kg" color="var(--s-paper)" /></Panel>
        <Panel title="Energy trend (kWh/day)"><TrendArea data={data.timeseries.energy} dataKey="actual_kwh" name="Energy" unit=" kWh" color="var(--s-organic)" /></Panel>
        <Panel title="Waste generation by source type"><HBars data={data.waste_by_type.map((w: any) => ({ label: BUSINESS_LABEL[w.business_type], kg: Math.round(w.kg) }))} dataKey="kg" nameKey="label" unit=" kg" colorFor={() => "var(--s-paper)"} /></Panel>
        <Panel title="Grid CO₂ displaced (kg/day)"><SimpleBars data={co2Daily} dataKey="co2" name="CO₂ displaced" unit=" kg" color="var(--s-plastic)" /></Panel>
        <Panel title="Predicted vs actual"><PredictedVsActual data={data.timeseries.energy} height={220} /></Panel>
        <Panel title="Model accuracy by week (MAPE %)"><SimpleBars data={data.accuracy.map((a: any) => ({ week: a.week?.slice(5, 10), mape: Math.round(a.mape * 10) / 10 }))} xKey="week" dataKey="mape" name="MAPE" unit="%" color="var(--s-metal)" /></Panel>
      </div>
      <Panel title="Facility performance (30 days)" bodyClass="p-0">
        <div className="overflow-x-auto"><table className="w-full min-w-[800px]"><thead><tr><Th>Facility</Th><Th>Technology</Th><Th right>Input</Th><Th right>Energy</Th><Th right>Measured eff.</Th><Th>Utilization</Th><Th right>Prediction error</Th></tr></thead>
          <tbody>{data.facilities.map((f: any) => <tr key={f.id}><Td className="text-ink">{f.label} <span className="text-ink-3">{f.name}</span></Td><Td>{TECH_LABEL[f.technology]}</Td><Td right mono>{kg(f.kg_30d)}</Td><Td right mono className="text-ink">{kwh(f.kwh_30d)}</Td><Td right mono>{pct(f.measured_efficiency, 1)}</Td>
            <Td><div className="flex items-center gap-2"><Meter className="w-24" value={f.utilization_pct} tone={f.utilization_pct >= 85 ? "crit" : "green"} /><span className="num text-xs">{pct(f.utilization_pct)}</span></div></Td><Td right mono>{f.mape != null ? pct(f.mape, 1) : "—"}</Td></tr>)}</tbody></table></div>
      </Panel>
    </div>
  );
}
