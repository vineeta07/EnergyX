"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Route as RouteIcon } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { Badge, Button, ErrorBox, Loading, PageHeader, Panel, Select, Status, Td, Th } from "@/components/ui";
import { RequestPickup } from "@/features/pickups/RequestPickup";
import { ago, inr, kg, n, dateTime, cx, NONE } from "@/lib/format";

import { t, tEnum } from "@/lib/i18n";
const FLOW = ["REQUESTED", "ASSIGNED", "EN_ROUTE", "COLLECTED", "DELIVERED"];

export default function Pickups() {
  const role = useAuth((s) => s.user?.role);
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [req, setReq] = useState<any>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ["pickups", status], queryFn: () => api.get<any[]>(`/pickups${status ? `?status=${status}` : ""}`), refetchInterval: 15_000 });
  const sources = useQuery({ queryKey: ["sources"], queryFn: () => api.get<any[]>("/waste-sources"), enabled: role === "generator" || role === "admin" });
  const assign = useMutation({ mutationFn: (id: number) => api.post(`/pickups/${id}/assign`), onSuccess: () => qc.invalidateQueries() });
  const counts = Object.fromEntries(FLOW.map((s) => [s, (data ?? []).filter((p) => p.status === s).length]));

  return (
    <div className="space-y-5">
      <PageHeader title={t("Collection")} subtitle={t("A pickup goes from requested to assigned, on the way, collected and delivered. Assigning a truck runs the route solver.")}
        actions={<>
          {(role === "generator" || role === "admin") && sources.data?.length ? (
            <Select className="w-56" value="" onChange={(e) => { const s = sources.data!.find((x) => x.id === Number(e.target.value)); if (s) setReq(s); }}>
              <option value="">{t("Request a pickup for…")}</option>{sources.data.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          ) : null}
          {(role === "fleet" || role === "admin") && <Link href="/routes"><Button variant="primary"><RouteIcon className="size-4" />{t("Plan routes for open pickups")}</Button></Link>}
        </>} />
      <div className="grid grid-cols-5 overflow-hidden rounded-md border border-line">
        {FLOW.map((s, i) => (
          <button key={s} onClick={() => setStatus(status === s ? "" : s)} className={cx("relative border-line px-4 py-3 text-left", i > 0 && "border-l", status === s ? "bg-raised" : "bg-panel hover:bg-raised/60")}>
            <div className="text-xs text-ink-3">{tEnum(s)}</div>
            <div className="num mt-1 text-xl font-medium">{status && status !== s ? "·" : counts[s]}</div>
            {i < FLOW.length - 1 && <span className="absolute right-1 top-1/2 hidden -translate-y-1/2 text-ink-3 sm:block">›</span>}
          </button>
        ))}
      </div>
      <Panel bodyClass="p-0">
        {isLoading ? <Loading /> : error ? <div className="p-4"><ErrorBox error={error} /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead><tr><Th>{t("Pickup")}</Th><Th>{t("Source")}</Th><Th right>{t("Quantity")}</Th><Th>{t("Urgency")}</Th><Th>{t("Window")}</Th><Th>{t("Vehicle and route")}</Th><Th right>{t("Estimated cost")}</Th><Th right>{t("Estimated CO₂")}</Th><Th>{t("Status")}</Th><Th /></tr></thead>
              <tbody>
                {data!.map((p) => (
                  <tr key={p.id} className="hover:bg-raised/40">
                    <Td><Link href={`/pickups/${p.id}`} className="num text-ink hover:text-accent">{p.code}</Link><div className="text-xs text-ink-3">{ago(p.created_at)}</div></Td>
                    <Td className="text-ink">{p.source_name}{p.notes && <div className="text-xs text-ink-3">{p.notes}</div>}</Td>
                    <Td right mono>{kg(p.quantity_kg)}</Td>
                    <Td><Badge tone={p.urgency === "critical" ? "crit" : p.urgency === "high" ? "warn" : "neutral"}>{tEnum(p.urgency)}</Badge></Td>
                    <Td className="text-xs">{p.window_start ? dateTime(p.window_start) : NONE}</Td>
                    <Td className="text-xs">{p.vehicle_code ? `${p.vehicle_code} · ${p.route_code ?? ""}` : NONE}</Td>
                    <Td right mono>{inr(p.estimated_cost)}</Td>
                    <Td right mono>{p.estimated_co2 != null ? `${n(p.estimated_co2, 1)} kg` : NONE}</Td>
                    <Td><Status s={p.status} /></Td>
                    <Td>{p.status === "REQUESTED" && (role === "fleet" || role === "admin") && <Button size="sm" loading={assign.isPending && assign.variables === p.id} onClick={() => assign.mutate(p.id)}>{t("Assign")}</Button>}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {assign.error && <div className="p-3"><ErrorBox error={assign.error} /></div>}
      </Panel>
      {req && <RequestPickup source={req} defaultKg={req.recent_avg_kg ?? req.avg_daily_kg} onClose={() => setReq(null)} />}
    </div>
  );
}
