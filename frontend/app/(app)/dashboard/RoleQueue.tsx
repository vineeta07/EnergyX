"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Plus } from "lucide-react";
import { api } from "@/lib/api";
import type { Role } from "@/store/auth";
import { Panel, Status, Td, Th, Empty, Badge } from "@/components/ui";
import { ago, kg, kwh, n, dateTime } from "@/lib/format";

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
      <Panel title="My waste sources" actions={<Link href="/waste-sources/new" className="flex items-center gap-1 text-xs text-accent"><Plus className="size-3.5" />Add source</Link>}>
        <div className="space-y-2">
          {(sources.data ?? []).map((s) => (
            <Link key={s.id} href={`/waste-sources/${s.id}`} className="flex items-center justify-between rounded border border-line bg-raised/50 px-3 py-2.5 hover:border-line-2">
              <div><div className="text-sm text-ink">{s.name}</div><div className="text-xs text-ink-3">{n(s.recent_avg_kg ?? s.avg_daily_kg)} kg/day · ~{kwh(s.energy_potential_kwh_day)}/day potential</div></div>
              <span className="flex items-center gap-1 text-xs text-accent">Forecast & pickup <ArrowRight className="size-3" /></span>
            </Link>
          ))}
          {sources.data?.length === 0 && <Empty>Register your first waste source to get forecasts and pickups.</Empty>}
        </div>
      </Panel>
      <Panel title="My pickups" actions={<Link href="/pickups" className="text-xs text-ink-3">All →</Link>} bodyClass="p-0">
        <table className="w-full"><thead><tr><Th>Pickup</Th><Th>Source</Th><Th right>Qty</Th><Th>Status</Th></tr></thead>
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
      <Panel title={`Unassigned pickups (${pickups.data?.length ?? 0})`} actions={<Link href="/routes" className="flex items-center gap-1 text-xs text-accent">Optimize routes <ArrowRight className="size-3" /></Link>} bodyClass="p-0">
        <table className="w-full"><thead><tr><Th>Source</Th><Th right>Qty</Th><Th>Urgency</Th><Th>Requested</Th></tr></thead>
          <tbody>{(pickups.data ?? []).slice(0, 6).map((p) => <tr key={p.id}><Td><Link href={`/pickups/${p.id}`} className="text-ink hover:text-accent">{p.source_name}</Link></Td><Td right mono>{kg(p.quantity_kg)}</Td><Td><Badge tone={p.urgency === "critical" ? "crit" : p.urgency === "high" ? "warn" : "neutral"}>{p.urgency}</Badge></Td><Td>{ago(p.created_at)}</Td></tr>)}</tbody></table>
      </Panel>
      <Panel title="Active routes" bodyClass="p-0">
        <table className="w-full"><thead><tr><Th>Route</Th><Th>Vehicle</Th><Th right>km</Th><Th>Progress</Th></tr></thead>
          <tbody>{(routes.data ?? []).slice(0, 6).map((r) => <tr key={r.id}><Td mono>{r.code}</Td><Td>{r.vehicle_code}</Td><Td right mono>{n(r.total_km, 1)}</Td><Td><div className="flex items-center gap-2"><div className="h-1.5 w-20 rounded bg-line"><div className="h-full rounded bg-cyan" style={{ width: `${r.progress * 100}%` }} /></div><Status s={r.status} /></div></Td></tr>)}</tbody></table>
      </Panel>
    </div>
  );
}

function HubQueue() {
  const ships = useQuery({ queryKey: ["shipments", "queue"], queryFn: () => api.get<any[]>("/hub/shipments?status=awaiting_classification,classified,in_transit") });
  const dec = useQuery({ queryKey: ["decisions", "proposed"], queryFn: () => api.get<any[]>("/ai-decisions?status=proposed") });
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title="Hub queue" actions={<Link href="/hub" className="text-xs text-accent">Processing hub →</Link>} bodyClass="p-0">
        <table className="w-full"><thead><tr><Th>Shipment</Th><Th>Source</Th><Th right>Weight</Th><Th>Status</Th></tr></thead>
          <tbody>{(ships.data ?? []).slice(0, 6).map((s) => <tr key={s.id}><Td><Link href={`/hub/classification/${s.id}`} className="num text-ink hover:text-accent">{s.code}</Link></Td><Td className="max-w-[200px] truncate">{s.source_label}</Td><Td right mono>{kg(s.measured_kg ?? s.total_kg)}</Td><Td><Status s={s.status} /></Td></tr>)}</tbody></table>
      </Panel>
      <Panel title={`Destinations awaiting approval (${dec.data?.length ?? 0})`} bodyClass="p-0">
        <table className="w-full"><thead><tr><Th>Decision</Th><Th>Subject</Th><Th right>Score</Th></tr></thead>
          <tbody>{(dec.data ?? []).slice(0, 6).map((d) => <tr key={d.id}><Td><Link href={`/ai-decisions/${d.id}`} className="num text-ink hover:text-accent">{d.code}</Link></Td><Td>{d.subject}</Td><Td right mono>{d.score != null ? n(d.score) : "—"}</Td></tr>)}</tbody></table>
      </Panel>
    </div>
  );
}

function FacilityQueue() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<any>("/auth/me") });
  const fid = me.data?.facility_id;
  const fac = useQuery({ queryKey: ["facility", fid], queryFn: () => api.get<any>(`/facilities/${fid}`), enabled: !!fid });
  return (
    <Panel title={`${fac.data?.facility.label ?? "Your facility"} — loads awaiting output report`} actions={fid && <Link href={`/facilities/${fid}`} className="text-xs text-accent">Facility console →</Link>} bodyClass="p-0">
      <table className="w-full"><thead><tr><Th>Shipment</Th><Th>Stream</Th><Th right>Input</Th><Th right>Predicted</Th><Th>Since</Th></tr></thead>
        <tbody>{(fac.data?.awaiting_output ?? []).map((p: any) => <tr key={p.id}><Td mono>{p.shipment_code}</Td><Td>{p.stream}</Td><Td right mono>{kg(p.quantity_kg)}</Td><Td right mono>{kwh(p.predicted_kwh)}</Td><Td>{dateTime(p.created_at)}</Td></tr>)}</tbody></table>
      {fac.data?.awaiting_output?.length === 0 && <div className="p-4 text-sm text-ink-3">No loads awaiting an output report.</div>}
    </Panel>
  );
}
