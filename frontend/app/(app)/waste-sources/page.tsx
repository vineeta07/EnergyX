"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { Button, ErrorBox, Input, Loading, PageHeader, Panel, Select, SimTag, Status, Td, Th } from "@/components/ui";
import { NetworkMap } from "@/components/map/NetworkMap";
import { BUSINESS_LABEL, kwh, n, dateTime, NONE } from "@/lib/format";

import { t, tEnum } from "@/lib/i18n";
export default function WasteSources() {
  const role = useAuth((s) => s.user?.role);
  const [f, setF] = useState({ q: "", type: "", status: "", city: "", min_kg: "" });
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as any).toString();
  const { data, isLoading, error } = useQuery({ queryKey: ["sources", qs], queryFn: () => api.get<any[]>(`/waste-sources?${qs}`) });
  const total = (data ?? []).reduce((a, s) => a + (s.recent_avg_kg ?? s.avg_daily_kg), 0);
  const potential = (data ?? []).reduce((a, s) => a + (s.energy_potential_kwh_day ?? 0), 0);

  return (
    <div className="space-y-5">
      <PageHeader title={t("Waste network")} subtitle={t("Every registered source with its daily weight, next pickup and the energy it could give back.")}
        actions={(role === "generator" || role === "admin") && <Link href="/waste-sources/new"><Button variant="primary"><Plus className="size-4" />{t("Add a waste source")}</Button></Link>} />
      <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
        <Panel bodyClass="p-0" title={<span className="flex items-center gap-2">{t("{a} sources, {b} t/day, about {c}/day of energy", { a: data?.length ?? 0, b: n(total / 1000, 1), c: kwh(potential) })} <SimTag /></span>}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative"><Search className="absolute left-2 top-2.5 size-3.5 text-ink-3" /><Input placeholder={t("Search")} className="h-8 w-36 pl-7 text-xs" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></div>
              <Select className="h-8 w-36 text-xs" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
                <option value="">{t("All types")}</option>
                {Object.entries(BUSINESS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                <option value="food_organic">{t("Food and organic waste")}</option><option value="packaging_mixed">{t("Packaging waste")}</option><option value="agricultural">{t("Agricultural waste")}</option><option value="municipal_mixed">{t("Municipal waste")}</option>
              </Select>
              <Select className="h-8 w-28 text-xs" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })}><option value="">{t("All cities")}</option><option value="Delhi">{t("Delhi")}</option><option value="Gurugram">{t("Gurugram")}</option></Select>
              <Select className="h-8 w-28 text-xs" value={f.min_kg} onChange={(e) => setF({ ...f, min_kg: e.target.value })}><option value="">{t("Any qty")}</option><option value="500">{t("500 kg or more")}</option><option value="1000">{t("1 t or more")}</option><option value="2000">{t("2 t or more")}</option></Select>
              <Select className="h-8 w-28 text-xs" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">{t("Any status")}</option><option value="active">{t("Active")}</option><option value="paused">{t("Paused")}</option></Select>
            </div>
          }>
          {isLoading ? <Loading /> : error ? <div className="p-4"><ErrorBox error={error} /></div> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead><tr><Th>{t("Source")}</Th><Th>{t("Type")}</Th><Th right>{t("Daily waste")}</Th><Th>{t("Location")}</Th><Th>{t("Status")}</Th><Th>{t("Next pickup")}</Th><Th right>{t("Energy potential")}</Th></tr></thead>
                <tbody>
                  {data!.map((s) => (
                    <tr key={s.id} className="hover:bg-raised/40">
                      <Td><Link href={`/waste-sources/${s.id}`} className="font-medium text-ink hover:text-accent">{s.name}</Link></Td>
                      <Td>{BUSINESS_LABEL[s.business_type]} <span className="text-ink-3">· {tEnum(s.waste_type)}</span></Td>
                      <Td right mono className="text-ink">{t("{a} kg/day", { a: n(s.recent_avg_kg ?? s.avg_daily_kg) })}</Td>
                      <Td>{s.city}</Td>
                      <Td><Status s={s.status} /></Td>
                      <Td>{s.next_pickup ? dateTime(s.next_pickup) : <span className="text-ink-3">{NONE}</span>}</Td>
                      <Td right mono>{t("about {a}/day", { a: kwh(s.energy_potential_kwh_day) })}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <NetworkMap height={560} layers={{ sources: true, hubs: true, facilities: false, vehicles: false, routes: false }} />
      </div>
      <p className="text-xs text-ink-3">{t("Energy potential is recent daily kg, times the average lab-audited mix for that type of business, times the best yield seen at any plant for each stream. It is worked out from records, not a fixed constant.")}</p>
    </div>
  );
}
