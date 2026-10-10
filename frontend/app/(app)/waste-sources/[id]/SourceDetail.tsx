"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Truck, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { Button, ErrorBox, Kpi, Loading, PageHeader, Panel, SimTag, Status, Td, Th } from "@/components/ui";
import { ForecastChart, CompositionBar } from "@/components/charts";
import { RequestPickup } from "@/features/pickups/RequestPickup";
import { BUSINESS_LABEL, kg, kwh, n, pct, dateTime } from "@/lib/format";

export function SourceDetail({ id }: { id: string }) {
  const role = useAuth((s) => s.user?.role);
  const [req, setReq] = useState(false);
  const { data, isLoading, error } = useQuery({ queryKey: ["sources", id], queryFn: () => api.get<any>(`/waste-sources/${id}`) });
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const { source: s, forecast: fc, history, pickups, impact } = data;
  const f = fc?.forecast ?? [];

  return (
    <div className="space-y-5">
      <PageHeader crumb={<Link href="/waste-sources">Waste Network</Link>} title={<span className="flex items-center gap-3">{s.name} <Status s={s.status} />{s.is_simulated && <SimTag />}</span>}
        subtitle={<>
          {BUSINESS_LABEL[s.business_type]} · {s.waste_type.replace(/_/g, " ")} · {s.address ?? s.city}{s.wards ? ` · ${s.wards} wards` : ""}
          {s.current_disposal && <span className="mt-1 block text-xs text-ink-3">Today this zone&apos;s waste goes to: <span className="text-ink-2">{s.current_disposal}</span> (MCD/DPCC). Daily history below is simulated around the published average.</span>}
          {s.data_source && <a href={s.data_source} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-cyan hover:underline">Source of published figures ↗</a>}
        </>}
        actions={(role === "generator" || role === "admin" || role === "fleet") && <Button variant="primary" onClick={() => setReq(true)}><Truck className="size-4" />Request Pickup</Button>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Average quantity" value={n(s.avg_daily_kg)} unit="kg/day" sub={s.frequency} />
        <Kpi label="Forecast today" value={f[0] ? n(f[0].kg) : "—"} unit="kg" sub={f[0] ? `${n(f[0].low)}–${n(f[0].high)} kg (80%)` : fc?.error} accent />
        <Kpi label="Forecast tomorrow" value={f[1] ? n(f[1].kg) : "—"} unit="kg" />
        <Kpi label="Next 7 days" value={fc?.total_kg ? n(fc.total_kg / 1000, 2) : "—"} unit="t predicted" sub={fc?.model_version ? `model ${fc.model_version}` : ""} />
        <Kpi label="Energy potential" value={`~${n(data.energy_potential_kwh_day)}`} unit="kWh/day" sub={`storage ${kg(s.storage_capacity_kg)} · contamination ${pct(s.contamination_pct)}`} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <Panel title={<span className="flex items-center gap-2"><Sparkles className="size-4 text-cyan" />AI waste availability forecast</span>}
          subtitle={fc?.method ? `${fc.method} · test MAPE ${pct((fc.test_mape ?? 0) * 100, 1)} vs seasonal-naive ${pct((fc.baseline_mape ?? 0) * 100, 1)}` : ""}>
          {fc?.error ? <ErrorBox error={fc.error} /> : <ForecastChart history={history} forecast={f} />}
        </Panel>
        <Panel title="Typical composition" subtitle="Average of lab-audited loads containing this business type">
          {data.typical_composition ? <CompositionBar comp={data.typical_composition} totalKg={s.avg_daily_kg} /> : <div className="text-sm text-ink-3">No audits yet</div>}
          <div className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4">
            <div><div className="text-[10px] uppercase tracking-wider text-ink-3">Delivered</div><div className="num text-lg font-semibold">{kg(impact.delivered_kg)}</div><div className="text-[11px] text-ink-3">{impact.pickups} pickups</div></div>
            <div><div className="text-[10px] uppercase tracking-wider text-ink-3">Energy enabled</div><div className="num text-lg font-semibold text-accent">{kwh(impact.est_energy_kwh)}</div></div>
            <div><div className="text-[10px] uppercase tracking-wider text-ink-3">CO₂ avoided</div><div className="num text-lg font-semibold">{kg(impact.est_co2_avoided_kg)}</div></div>
          </div>
        </Panel>
      </div>

      <Panel title="Pickup history" bodyClass="p-0">
        <table className="w-full"><thead><tr><Th>Pickup</Th><Th right>Quantity</Th><Th>Urgency</Th><Th>Status</Th><Th>Requested</Th><Th right>Est. cost</Th></tr></thead>
          <tbody>{pickups.map((p: any) => (
            <tr key={p.id}><Td><Link href={`/pickups/${p.id}`} className="num text-ink hover:text-accent">{p.code}</Link></Td><Td right mono>{kg(p.quantity_kg)}</Td><Td>{p.urgency}</Td><Td><Status s={p.status} /></Td><Td>{dateTime(p.created_at)}</Td><Td right mono>{p.estimated_cost ? `₹${n(p.estimated_cost)}` : "—"}</Td></tr>
          ))}</tbody></table>
      </Panel>
      {req && <RequestPickup source={s} defaultKg={f[0]?.kg ?? s.avg_daily_kg} onClose={() => setReq(false)} />}
    </div>
  );
}
