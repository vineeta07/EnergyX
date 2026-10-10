"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Zap, Gauge, Leaf, Recycle } from "lucide-react";
import { api } from "@/lib/api";
import { ErrorBox, Kpi, Loading, PageHeader, Panel, Select, SimTag, Td, Th } from "@/components/ui";
import { CalibrationScatter, HBars, InputOutputPair, PredictedVsActual } from "@/components/charts";
import { kwh, n, pct, STREAM_COLOR, STREAM_LABEL, TECH_LABEL } from "@/lib/format";

import { t } from "@/lib/i18n";
export default function Energy() {
  const [days, setDays] = useState("30");
  const { data, isLoading, error } = useQuery({ queryKey: ["energy", days], queryFn: () => api.get<any>(`/energy/analytics?days=${days}`), refetchInterval: 20_000 });
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const tot = data.totals;
  const k = data.kpis;
  return (
    <div className="space-y-5">
      <PageHeader title={<span className="flex flex-wrap items-center gap-3">{t("Energy generated")} <SimTag label={t("Simulated meters")} /></span>} subtitle={t("What every plant has put out, split by waste stream and technology, next to what the model predicted.")}
        actions={<Select className="w-36" value={days} onChange={(e) => setDays(e.target.value)}><option value="7">{t("Last 7 days")}</option><option value="30">{t("Last 30 days")}</option><option value="90">{t("Last 90 days")}</option></Select>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t("Today")} value={n(tot.today)} unit="kWh" icon={<Zap className="size-4" />} />
        <Kpi label={t("This week")} value={n(tot.week)} unit="kWh" />
        <Kpi label={t("This month")} value={n(tot.month)} unit="kWh" accent />
        <Kpi label={t("All time")} value={n(tot.all_time)} unit="kWh" />
        <Kpi label={t("Energy, last 30 days")} value={n(k.energy_kwh_30d)} unit="kWh" sub={t("{n} kWh per kg of input", { n: n(tot.month / Math.max(1, tot.input_kg_30d), 3) })} />
        <Kpi label={t("Energy efficiency")} value={pct(tot.efficiency, 1)} sub={t("metered output divided by theoretical potential")} icon={<Gauge className="size-4" />} />
        <Kpi label={t("CO₂ avoided, 30 days")} value={n(k.co2_avoided_kg_30d / 1000, 1)} unit="t" icon={<Leaf className="size-4" />} />
        <Kpi label={t("Kept out of landfill, 30 days")} value={n(k.waste_diverted_kg_30d / 1000, 1)} unit="t" icon={<Recycle className="size-4" />} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_1.4fr]">
        <Panel title={t("By waste stream")}>
          <HBars data={data.timeseries.by_stream.map((s: any) => ({ ...s, label: STREAM_LABEL[s.stream] }))} dataKey="kwh" nameKey="label" unit=" kWh" height={170} colorFor={(d) => STREAM_COLOR[d.stream]} />
          <table className="mt-3 w-full"><thead><tr><Th>{t("Stream")}</Th><Th right>{t("Input")}</Th><Th right>{t("Energy")}</Th><Th right>{t("kWh/kg")}</Th></tr></thead>
            <tbody>{data.timeseries.by_stream.map((s: any) => <tr key={s.stream}><Td><span className="mr-1.5 inline-block size-2 rounded-sm" style={{ background: STREAM_COLOR[s.stream] }} />{STREAM_LABEL[s.stream]}</Td><Td right mono>{n(s.kg)} kg</Td><Td right mono className="text-ink">{kwh(s.kwh)}</Td><Td right mono>{n(s.kwh_per_kg, 3)}</Td></tr>)}</tbody></table>
        </Panel>
        <Panel title={t("Waste in, energy out")} subtitle={t("Two charts side by side, one for kg and one for kWh")}><InputOutputPair data={data.timeseries.energy} /></Panel>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title={t("Predicted and metered over time")} subtitle={t("Days that have a prediction")}><PredictedVsActual data={data.timeseries.energy} /></Panel>
        <Panel title={t("Prediction calibration")} subtitle={t("Each dot is one batch. The dashed line is a perfect prediction. Accuracy {a}.", { a: pct(k.prediction_accuracy, 1) })}><CalibrationScatter data={data.predicted_vs_actual} /></Panel>
      </div>
      <Panel title={t("By technology")} bodyClass="p-0">
        <table className="w-full"><thead><tr><Th>{t("Technology")}</Th><Th right>{t("Input")}</Th><Th right>{t("Energy")}</Th><Th right>{t("kWh/kg")}</Th></tr></thead>
          <tbody>{data.by_technology.map((r: any) => <tr key={r.technology}><Td className="text-ink">{TECH_LABEL[r.technology]}</Td><Td right mono>{n(r.kg)} kg</Td><Td right mono className="text-ink">{kwh(r.kwh)}</Td><Td right mono>{n(r.kwh / r.kg, 3)}</Td></tr>)}</tbody></table>
      </Panel>
    </div>
  );
}
