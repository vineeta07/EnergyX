"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ErrorBox, Kpi, Loading, PageHeader, Panel, Select, SimTag, Td, Th, Meter } from "@/components/ui";
import { HBars, PredictedVsActual, SimpleBars, TrendArea } from "@/components/charts";
import { BUSINESS_LABEL, inr, kg, kwh, n, pct, TECH_LABEL, NONE } from "@/lib/format";

import { t } from "@/lib/i18n";
export default function Analytics() {
  const [days, setDays] = useState("60");
  const { data, isLoading, error } = useQuery({ queryKey: ["analytics", days], queryFn: () => api.get<any>(`/analytics?days=${days}`) });
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const s = data.summary;
  const co2Daily = data.timeseries.energy.map((e: any) => ({ date: e.date, co2: Math.round(e.actual_kwh * data.kpis.factors.grid_kg_co2_per_kwh) }));
  return (
    <div className="space-y-5">
      <PageHeader title={<span className="flex items-center gap-3">{t("Analytics")} <SimTag /></span>} subtitle={t("The whole chain in numbers: waste made, collected and converted, what it cost, the carbon effect and how accurate the models are.")}
        actions={<Select className="w-36" value={days} onChange={(e) => setDays(e.target.value)}><option value="30">{t("30 days")}</option><option value="60">{t("60 days")}</option><option value="120">{t("120 days")}</option></Select>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Kpi label={t("Waste generated")} value={n(s.waste_generated_kg / 1000, 1)} unit="t" />
        <Kpi label={t("Waste collected")} value={n(s.waste_collected_kg / 1000, 1)} unit="t" sub={t("kept out of landfill")} />
        <Kpi label={t("Energy generated")} value={n(s.energy_kwh)} unit="kWh" accent />
        <Kpi label={t("Energy per kg")} value={n(s.energy_per_kg, 3)} unit="kWh/kg" />
        <Kpi label={t("Transport cost")} value={inr(s.transport_cost_inr)} sub={t("{n} km driven", { n: n(s.route_km) })} />
        <Kpi label={t("Cost per kWh")} value={s.cost_per_kwh_inr != null ? `₹${n(s.cost_per_kwh_inr, 2)}` : NONE} sub={t("transport plus gate fees")} />
        <Kpi label={t("Transport CO₂")} value={n(s.transport_co2_kg)} unit="kg" />
        <Kpi label={t("CO₂ avoided (30d)")} value={n(s.co2_avoided_kg / 1000, 1)} unit="t" />
        <Kpi label={t("Prediction accuracy")} value={pct(data.kpis.prediction_accuracy, 1)} sub={t("100 minus the average error")} />
        <Kpi label={t("Route efficiency")} value={s.route_efficiency != null ? n(s.route_efficiency) : NONE} unit="/100" sub={s.baseline_km ? t("{n} shorter than separate trips", { n: pct((1 - s.route_km / s.baseline_km) * 100) }) : ""} />
        <Kpi label={t("Average plant utilization")} value={pct(data.facilities.reduce((a: number, f: any) => a + f.utilization_pct, 0) / data.facilities.length)} />
        <Kpi label={t("Open alerts")} value={data.kpis.open_alerts} />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title={t("Waste trend (kg/day at sources)")}><TrendArea data={data.timeseries.waste} dataKey="kg" name={t("Waste")} unit=" kg" color="var(--s-paper)" /></Panel>
        <Panel title={t("Energy trend (kWh/day)")}><TrendArea data={data.timeseries.energy} dataKey="actual_kwh" name={t("Energy")} unit=" kWh" color="var(--gold)" /></Panel>
        <Panel title={t("Waste generation by source type")}><HBars data={data.waste_by_type.map((w: any) => ({ label: BUSINESS_LABEL[w.business_type], kg: Math.round(w.kg) }))} dataKey="kg" nameKey="label" unit=" kg" colorFor={() => "var(--s-paper)"} /></Panel>
        <Panel title={t("Grid CO₂ displaced (kg/day)")}><SimpleBars data={co2Daily} dataKey="co2" name={t("CO₂ displaced")} unit=" kg" color="var(--s-plastic)" /></Panel>
        <Panel title={t("Predicted and metered")}><PredictedVsActual data={data.timeseries.energy} height={220} /></Panel>
        <Panel title={t("Model error by week (%)")}><SimpleBars data={data.accuracy.map((a: any) => ({ week: a.week?.slice(5, 10), mape: Math.round(a.mape * 10) / 10 }))} xKey="week" dataKey="mape" name={t("Average error")} unit="%" color="var(--s-metal)" /></Panel>
      </div>
      <Panel title={t("Plant performance, last 30 days")} bodyClass="p-0">
        <div className="overflow-x-auto"><table className="w-full min-w-[800px]"><thead><tr><Th>{t("Plant")}</Th><Th>{t("Technology")}</Th><Th right>{t("Input")}</Th><Th right>{t("Energy")}</Th><Th right>{t("Measured efficiency")}</Th><Th>{t("Utilization")}</Th><Th right>{t("Prediction error")}</Th></tr></thead>
          <tbody>{data.facilities.map((f: any) => <tr key={f.id}><Td className="text-ink">{f.label} <span className="text-ink-3">{f.name}</span></Td><Td>{TECH_LABEL[f.technology]}</Td><Td right mono>{kg(f.kg_30d)}</Td><Td right mono className="text-ink">{kwh(f.kwh_30d)}</Td><Td right mono>{pct(f.measured_efficiency, 1)}</Td>
            <Td><div className="flex items-center gap-2"><Meter className="w-24" value={f.utilization_pct} tone={f.utilization_pct >= 85 ? "crit" : "green"} /><span className="num text-xs">{pct(f.utilization_pct)}</span></div></Td><Td right mono>{f.mape != null ? pct(f.mape, 1) : NONE}</Td></tr>)}</tbody></table></div>
      </Panel>
    </div>
  );
}
