"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { Button, Empty, Loading, PageHeader, Panel, Select, SeverityIcon, Status } from "@/components/ui";
import { ago, cx } from "@/lib/format";

export default function Alerts() {
  const role = useAuth((s) => s.user?.role);
  const qc = useQueryClient();
  const [status, setStatus] = useState("open,acknowledged");
  const { data, isLoading } = useQuery({ queryKey: ["alerts", status], queryFn: () => api.get<any[]>(`/alerts?status=${status}`), refetchInterval: 15_000 });
  const act = useMutation({ mutationFn: ({ id, action }: { id: number; action: string }) => api.post(`/alerts/${id}/${action}`), onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }) });
  return (
    <div className="space-y-5">
      <PageHeader title="Alerts" subtitle="Capacity, delays, overdue pickups, composition anomalies, energy deviations, model drift and low-confidence classifications — raised automatically by the pipeline and sweeps."
        actions={<Select className="w-44" value={status} onChange={(e) => setStatus(e.target.value)}><option value="open,acknowledged">Open & acknowledged</option><option value="open">Open</option><option value="resolved">Resolved</option></Select>} />
      <Panel bodyClass="p-0">
        {isLoading ? <Loading /> : !data?.length ? <div className="p-4"><Empty>No alerts.</Empty></div> : (
          <ul>
            {data.map((a) => (
              <li key={a.id} className={cx("flex gap-4 border-b border-line px-4 py-4", a.severity === "critical" && "bg-crit/5")}>
                <SeverityIcon s={a.severity} className="mt-0.5 size-5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold uppercase tracking-wide text-ink">{a.title}</span><span className="text-[11px] text-ink-3">{a.severity} · {a.type.replace(/_/g, " ")} · {ago(a.created_at)}</span><Status s={a.status} /></div>
                  <p className="mt-1 text-sm text-ink-2">{a.message}</p>
                  {a.causes?.length > 0 && <div className="mt-2 text-xs text-ink-3">Possible causes:<ul className="mt-1 space-y-0.5">{a.causes.map((c: string) => <li key={c}>– {c}</li>)}</ul></div>}
                </div>
                {role !== "generator" && a.status !== "resolved" && (
                  <div className="flex shrink-0 flex-col gap-1.5">
                    {a.status === "open" && <Button size="sm" onClick={() => act.mutate({ id: a.id, action: "acknowledge" })}>Acknowledge</Button>}
                    <Button size="sm" variant="ghost" onClick={() => act.mutate({ id: a.id, action: "resolve" })}>Resolve</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
