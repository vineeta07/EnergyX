"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Inbox, Cog, CheckCheck, Scale } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { Empty, Kpi, Loading, PageHeader, Panel, Status } from "@/components/ui";
import { ShipmentTable } from "@/features/hub/ShipmentTable";
import { kg, kwh, n } from "@/lib/format";

import { t, tEnum } from "@/lib/i18n";
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
      <PageHeader title={t("Processing hub")} subtitle={t("Weigh each load, run the sort, confirm or correct it, then approve the plant for each stream.")}
        actions={<Link href="/hub/incoming" className="text-sm text-accent">{t("All incoming loads")}</Link>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t("Loads arriving")} value={incoming.length} sub={kg(incoming.reduce((a, s) => a + (s.measured_kg ?? s.total_kg), 0))} icon={<Inbox className="size-4" />} />
        <Kpi label={t("Being sorted")} value={active.length} sub={t("sorted or dispatched")} icon={<Cog className="size-4" />} />
        <Kpi label={t("Finished, last 48 hours")} value={done.length} sub={t("energy reading saved")} icon={<CheckCheck className="size-4" />} />
        <Kpi label={t("Plants to approve")} value={dec.data?.length ?? 0} sub={t("waiting for you")} icon={<Scale className="size-4" />} accent />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {hubs.data?.map((h) => (
          <div key={h.id} className="rounded-md border border-line bg-panel p-4">
            <div className="flex items-center justify-between"><span className="text-sm font-semibold">{h.code} · {h.name}</span><Status s={h.status} /></div>
            <div className="mt-2 flex justify-between text-xs text-ink-3"><span>{t("On site")}</span><span className="num text-ink">{kg(h.current_load_kg)}</span></div>
            <div className="flex justify-between text-xs text-ink-3"><span>{t("Queue")}</span><span className="num text-ink">{t("{n} shipments", { n: h.queued })}</span></div>
            <div className="flex justify-between text-xs text-ink-3"><span>{t("Capacity")}</span><span className="num text-ink">{t("{n} t/day", { n: h.capacity_tpd })}</span></div>
          </div>
        ))}
      </div>
      <Panel title={t("Incoming loads")} subtitle={t("Sorting a load runs the composition model on its source mix.")} bodyClass="p-0">
        {incoming.length ? <ShipmentTable rows={incoming} canAct={canAct} /> : <div className="p-4"><Empty>{t("No loads are waiting. New ones arrive when a collection route finishes.")}</Empty></div>}
      </Panel>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title={t("Being sorted")} bodyClass="p-0">{active.length ? <ShipmentTable rows={active} canAct={canAct} /> : <div className="p-4 text-sm text-ink-3">{t("None")}</div>}</Panel>
        <Panel title={t("Plants waiting for approval")}>
          <div className="space-y-2">
            {(dec.data ?? []).map((d) => (
              <Link key={d.id} href={`/ai-decisions/${d.id}`} className="flex items-center justify-between rounded border border-line bg-raised/60 px-3 py-2 hover:border-accent/40">
                <div><div className="text-sm text-ink">{d.subject}</div><div className="text-xs text-ink-3">{d.code} · {d.shipment_code} · {d.output?.expected_kwh != null ? kwh(d.output.expected_kwh) : tEnum(d.output?.pathway)}</div></div>
                <span className="num text-sm text-accent">{d.score != null ? n(d.score) : t("Rule")}</span>
              </Link>
            ))}
            {!dec.data?.length && <div className="text-sm text-ink-3">{t("Nothing waiting.")}</div>}
          </div>
        </Panel>
      </div>
      <Panel title={t("Finished loads")} bodyClass="p-0">{done.length ? <ShipmentTable rows={done} canAct={false} /> : <div className="p-4 text-sm text-ink-3">{t("None in the last 48 hours")}</div>}</Panel>
    </div>
  );
}
