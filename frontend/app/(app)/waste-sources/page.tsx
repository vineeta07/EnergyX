"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { Button, ErrorBox, Input, Loading, PageHeader, Panel, Select, SimTag, Status, Td, Th } from "@/components/ui";
import { NetworkMap } from "@/components/map/NetworkMap";
import { BUSINESS_LABEL, kwh, n, dateTime } from "@/lib/format";

export default function WasteSources() {
  const role = useAuth((s) => s.user?.role);
  const [f, setF] = useState({ q: "", type: "", status: "", city: "", min_kg: "" });
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as any).toString();
  const { data, isLoading, error } = useQuery({ queryKey: ["sources", qs], queryFn: () => api.get<any[]>(`/waste-sources?${qs}`) });
  const total = (data ?? []).reduce((a, s) => a + (s.recent_avg_kg ?? s.avg_daily_kg), 0);
  const potential = (data ?? []).reduce((a, s) => a + (s.energy_potential_kwh_day ?? 0), 0);

  return (
    <div className="space-y-5">
      <PageHeader title="Waste Network" subtitle="Every registered waste generator, its daily generation, next pickup and estimated energy potential."
        actions={(role === "generator" || role === "admin") && <Link href="/waste-sources/new"><Button variant="primary"><Plus className="size-4" />Add Waste Source</Button></Link>} />
      <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
        <Panel bodyClass="p-0" title={<span className="flex items-center gap-2">{data?.length ?? 0} sources · {n(total / 1000, 1)} t/day · ~{kwh(potential)}/day potential <SimTag /></span>}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative"><Search className="absolute left-2 top-2.5 size-3.5 text-ink-3" /><Input placeholder="Search" className="h-8 w-36 pl-7 text-xs" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></div>
              <Select className="h-8 w-36 text-xs" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
                <option value="">All types</option>
                {Object.entries(BUSINESS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                <option value="food_organic">Waste: food/organic</option><option value="packaging_mixed">Waste: packaging</option><option value="agricultural">Waste: agricultural</option><option value="municipal_mixed">Waste: municipal</option>
              </Select>
              <Select className="h-8 w-28 text-xs" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })}><option value="">All cities</option><option>Delhi</option><option>Gurugram</option></Select>
              <Select className="h-8 w-28 text-xs" value={f.min_kg} onChange={(e) => setF({ ...f, min_kg: e.target.value })}><option value="">Any qty</option><option value="500">≥ 500 kg</option><option value="1000">≥ 1 t</option><option value="2000">≥ 2 t</option></Select>
              <Select className="h-8 w-28 text-xs" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">Any status</option><option value="active">Active</option><option value="paused">Paused</option></Select>
            </div>
          }>
          {isLoading ? <Loading /> : error ? <div className="p-4"><ErrorBox error={error} /></div> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead><tr><Th>Source</Th><Th>Type</Th><Th right>Daily waste</Th><Th>Location</Th><Th>Status</Th><Th>Next pickup</Th><Th right>Energy potential</Th></tr></thead>
                <tbody>
                  {data!.map((s) => (
                    <tr key={s.id} className="hover:bg-raised/40">
                      <Td><Link href={`/waste-sources/${s.id}`} className="font-medium text-ink hover:text-accent">{s.name}</Link></Td>
                      <Td>{BUSINESS_LABEL[s.business_type]} <span className="text-ink-3">· {s.waste_type.replace(/_/g, " ")}</span></Td>
                      <Td right mono className="text-ink">{n(s.recent_avg_kg ?? s.avg_daily_kg)} kg/day</Td>
                      <Td>{s.city}</Td>
                      <Td><Status s={s.status} /></Td>
                      <Td>{s.next_pickup ? dateTime(s.next_pickup) : <span className="text-ink-3">—</span>}</Td>
                      <Td right mono>~{kwh(s.energy_potential_kwh_day)}<span className="text-ink-3">/day</span></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <NetworkMap height={560} layers={{ sources: true, hubs: true, facilities: false, vehicles: false, routes: false }} />
      </div>
      <p className="text-[11px] text-ink-3">Energy potential = recent daily kg × average lab-audited composition for the business type × best observed facility yield per stream (data-derived, not a fixed constant).</p>
    </div>
  );
}
