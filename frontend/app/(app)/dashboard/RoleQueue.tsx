"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
import type { Role } from "@/store/auth";
import { Panel, Status, Td, Th, Empty, Badge } from "@/components/ui";
import { ago, kg, kwh, n, dateTime, NONE, STREAM_LABEL } from "@/lib/format";
import { t, tEnum } from "@/lib/i18n";

/** The first thing each role needs to act on. */
export function RoleQueue({ role }: { role: Role }) {
  if (role === "generator") return <GeneratorQueue />;
  if (role === "fleet") return <FleetQueue />;
  if (role === "hub") return <HubQueue />;
  if (role === "facility") return <FacilityQueue />;
  return null;
}

function GeneratorQueue() {
  const sources = useQuery({ queryKey: ["sources"], queryFn: () => api.get<any[]>("/waste-sources") });
  const pickups = useQuery({ queryKey: ["pickups", "mine"], queryFn: () => api.get<any[]>("/pickups") });
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title={t("My waste sources")} actions={<Link href="/waste-sources/new" className="flex items-center gap-1 text-xs text-accent"><Plus className="size-3.5" />{t("Add a source")}</Link>}>
        <div className="space-y-2">
          {(sources.data ?? []).map((s) => (
            <Link key={s.id} href={`/waste-sources/${s.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-raised/60 px-3 py-2.5 hover:border-line-2">
              <div><div className="text-sm text-ink">{s.name}</div><div className="text-xs text-ink-3">{t("{a} kg/day, about {b}/day of energy", { a: n(s.recent_avg_kg ?? s.avg_daily_kg), b: kwh(s.energy_potential_kwh_day) })}</div></div>
              <span className="shrink-0 text-xs text-accent">{t("Forecast and pickup")}</span>
            </Link>
          ))}
          {sources.data?.length === 0 && <Empty>{t("Add your first waste source to get a forecast and book pickups.")}</Empty>}
        </div>
      </Panel>
      <Panel title={t("My pickups")} actions={<Link href="/pickups" className="text-xs text-ink-3">{t("See all")}</Link>} bodyClass="p-0">
        <table className="w-full"><thead><tr><Th>{t("Pickup")}</Th><Th>{t("Source")}</Th><Th right>{t("Quantity")}</Th><Th>{t("Status")}</Th></tr></thead>
          <tbody>{(pickups.data ?? []).slice(0, 6).map((p) => <tr key={p.id}><Td><Link href={`/pickups/${p.id}`} className="num text-ink hover:text-accent">{p.code}</Link></Td><Td>{p.source_name}</Td><Td right mono>{kg(p.quantity_kg)}</Td><Td><Status s={p.status} /></Td></tr>)}</tbody></table>
      </Panel>
    </div>
  );
}

function FleetQueue() {
  const pickups = useQuery({ queryKey: ["pickups", "open"], queryFn: () => api.get<any[]>("/pickups?status=REQUESTED") });
  const routes = useQuery({ queryKey: ["routes", "active"], queryFn: () => api.get<any[]>("/routes?status=planned,active") });
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title={t("Pickups with no truck ({n})", { n: pickups.data?.length ?? 0 })} actions={<Link href="/routes" className="text-xs text-accent">{t("Plan routes")}</Link>} bodyClass="p-0">
        <table className="w-full"><thead><tr><Th>{t("Source")}</Th><Th right>{t("Quantity")}</Th><Th>{t("Urgency")}</Th><Th>{t("Asked")}</Th></tr></thead>
          <tbody>{(pickups.data ?? []).slice(0, 6).map((p) => <tr key={p.id}><Td><Link href={`/pickups/${p.id}`} className="text-ink hover:text-accent">{p.source_name}</Link></Td><Td right mono>{kg(p.quantity_kg)}</Td><Td><Badge tone={p.urgency === "critical" ? "crit" : p.urgency === "high" ? "warn" : "neutral"}>{tEnum(p.urgency)}</Badge></Td><Td>{ago(p.created_at)}</Td></tr>)}</tbody></table>
      </Panel>
      <Panel title={t("Routes on the road")} bodyClass="p-0">
        <table className="w-full"><thead><tr><Th>{t("Route")}</Th><Th>{t("Vehicle")}</Th><Th right>km</Th><Th>{t("Progress")}</Th></tr></thead>
          <tbody>{(routes.data ?? []).slice(0, 6).map((r) => <tr key={r.id}><Td mono>{r.code}</Td><Td>{r.vehicle_code}</Td><Td right mono>{n(r.total_km, 1)}</Td><Td><div className="flex items-center gap-2"><div className="h-1.5 w-20 rounded bg-line"><div className="h-full rounded bg-blue" style={{ width: `${r.progress * 100}%` }} /></div><Status s={r.status} /></div></Td></tr>)}</tbody></table>
      </Panel>
    </div>
  );
}

function HubQueue() {
  const ships = useQuery({ queryKey: ["shipments", "queue"], queryFn: () => api.get<any[]>("/hub/shipments?status=awaiting_classification,classified,in_transit") });
  const dec = useQuery({ queryKey: ["decisions", "proposed"], queryFn: () => api.get<any[]>("/ai-decisions?status=proposed") });
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title={t("Hub queue")} actions={<Link href="/hub" className="text-xs text-accent">{t("Open the hub")}</Link>} bodyClass="p-0">
        <table className="w-full"><thead><tr><Th>{t("Shipment")}</Th><Th>{t("Source")}</Th><Th right>{t("Weight")}</Th><Th>{t("Status")}</Th></tr></thead>
          <tbody>{(ships.data ?? []).slice(0, 6).map((s) => <tr key={s.id}><Td><Link href={`/hub/classification/${s.id}`} className="num text-ink hover:text-accent">{s.code}</Link></Td><Td className="max-w-[200px] truncate">{s.source_label}</Td><Td right mono>{kg(s.measured_kg ?? s.total_kg)}</Td><Td><Status s={s.status} /></Td></tr>)}</tbody></table>
      </Panel>
      <Panel title={t("Plants waiting for your approval ({n})", { n: dec.data?.length ?? 0 })} bodyClass="p-0">
        <table className="w-full"><thead><tr><Th>{t("Decision")}</Th><Th>{t("Subject")}</Th><Th right>{t("Score")}</Th></tr></thead>
          <tbody>{(dec.data ?? []).slice(0, 6).map((d) => <tr key={d.id}><Td><Link href={`/ai-decisions/${d.id}`} className="num text-ink hover:text-accent">{d.code}</Link></Td><Td>{d.subject}</Td><Td right mono>{d.score != null ? n(d.score) : NONE}</Td></tr>)}</tbody></table>
      </Panel>
    </div>
  );
}

function FacilityQueue() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<any>("/auth/me") });
  const fid = me.data?.facility_id;
  const fac = useQuery({ queryKey: ["facility", fid], queryFn: () => api.get<any>(`/facilities/${fid}`), enabled: !!fid });
  return (
    <Panel title={t("{p}: loads waiting for a meter reading", { p: fac.data?.facility.label ?? t("Your plant") })} actions={fid && <Link href={`/facilities/${fid}`} className="text-xs text-accent">{t("Plant console")}</Link>} bodyClass="p-0">
      <table className="w-full"><thead><tr><Th>{t("Shipment")}</Th><Th>{t("Stream")}</Th><Th right>{t("Received")}</Th><Th right>{t("Predicted")}</Th><Th>{t("Since")}</Th></tr></thead>
        <tbody>{(fac.data?.awaiting_output ?? []).map((p: any) => <tr key={p.id}><Td mono>{p.shipment_code}</Td><Td>{STREAM_LABEL[p.stream] ?? p.stream}</Td><Td right mono>{kg(p.quantity_kg)}</Td><Td right mono>{kwh(p.predicted_kwh)}</Td><Td>{dateTime(p.created_at)}</Td></tr>)}</tbody></table>
      {fac.data?.awaiting_output?.length === 0 && <div className="p-4 text-sm text-ink-3">{t("No loads are waiting for a reading.")}</div>}
    </Panel>
  );
}
