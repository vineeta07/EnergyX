"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Inbox, Cog, CheckCheck, BrainCircuit } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { Empty, Kpi, Loading, PageHeader, Panel, Status } from "@/components/ui";
import { ShipmentTable } from "@/features/hub/ShipmentTable";
import { kg, kwh, n } from "@/lib/format";

export default function Hub() {
  const role = useAuth((s) => s.user?.role);
  const ships = useQuery({ queryKey: ["shipments"], queryFn: () => api.get<any[]>("/hub/shipments"), refetchInterval: 10_000 });
  const hubs = useQuery({ queryKey: ["hubs"], queryFn: () => api.get<any[]>("/hubs") });
  const dec = useQuery({ queryKey: ["decisions", "proposed"], queryFn: () => api.get<any[]>("/ai-decisions?status=proposed") });
  if (ships.isLoading) return <Loading />;
  const all = ships.data ?? [];
  const incoming = all.filter((s) => s.status === "awaiting_classification" || s.status === "in_transit");
  const active = all.filter((s) => s.status === "classified" || s.status === "dispatched");
  const done = all.filter((s) => s.status === "processed");
  const canAct = role === "hub" || role === "admin";

  return (
    <div className="space-y-5">
      <PageHeader title="Processing Hub" subtitle="Receive and weigh loads, run AI characterization, confirm or correct it, then approve the optimal destination for each stream."
        actions={<Link href="/hub/incoming" className="text-sm text-accent">All incoming →</Link>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Incoming shipments" value={incoming.length} sub={kg(incoming.reduce((a, s) => a + (s.measured_kg ?? s.total_kg), 0))} icon={<Inbox className="size-4" />} />
        <Kpi label="Active sorting jobs" value={active.length} sub="classified / dispatched" icon={<Cog className="size-4" />} />
        <Kpi label="Completed (48h)" value={done.length} sub="energy recorded" icon={<CheckCheck className="size-4" />} />
        <Kpi label="AI recommendations" value={dec.data?.length ?? 0} sub="awaiting approval" icon={<BrainCircuit className="size-4" />} accent />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {hubs.data?.map((h) => (
          <div key={h.id} className="rounded-md border border-line bg-panel p-4">
            <div className="flex items-center justify-between"><span className="text-sm font-semibold">{h.code} · {h.name}</span><Status s={h.status} /></div>
            <div className="mt-2 flex justify-between text-xs text-ink-3"><span>On site</span><span className="num text-ink">{kg(h.current_load_kg)}</span></div>
            <div className="flex justify-between text-xs text-ink-3"><span>Queue</span><span className="num text-ink">{h.queued} shipments</span></div>
            <div className="flex justify-between text-xs text-ink-3"><span>Capacity</span><span className="num text-ink">{h.capacity_tpd} t/day</span></div>
          </div>
        ))}
      </div>
      <Panel title="Incoming shipments" subtitle="Analyze Waste runs the composition model on the load's source mix" bodyClass="p-0">
        {incoming.length ? <ShipmentTable rows={incoming} canAct={canAct} /> : <div className="p-4"><Empty>No shipments waiting. New loads arrive when collection routes complete.</Empty></div>}
      </Panel>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Active sorting jobs" bodyClass="p-0">{active.length ? <ShipmentTable rows={active} canAct={canAct} /> : <div className="p-4 text-sm text-ink-3">None</div>}</Panel>
        <Panel title="AI recommendations awaiting approval">
          <div className="space-y-2">
            {(dec.data ?? []).map((d) => (
              <Link key={d.id} href={`/ai-decisions/${d.id}`} className="flex items-center justify-between rounded border border-line bg-raised/50 px-3 py-2 hover:border-accent/40">
                <div><div className="text-sm text-ink">{d.subject}</div><div className="text-[11px] text-ink-3">{d.code} · {d.shipment_code} · {d.output?.expected_kwh != null ? kwh(d.output.expected_kwh) : d.output?.pathway}</div></div>
                <span className="num text-sm text-accent">{d.score != null ? n(d.score) : "rule"}</span>
              </Link>
            ))}
            {!dec.data?.length && <div className="text-sm text-ink-3">Nothing pending.</div>}
          </div>
        </Panel>
      </div>
      <Panel title="Completed jobs" bodyClass="p-0">{done.length ? <ShipmentTable rows={done} canAct={false} /> : <div className="p-4 text-sm text-ink-3">None in the last 48 h</div>}</Panel>
    </div>
  );
}
