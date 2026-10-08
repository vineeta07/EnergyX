"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Badge, BarList, Empty, Loading, PageHeader, Panel, Select, Status, Td, Th } from "@/components/ui";
import { DecisionView } from "@/features/decisions/DecisionView";
import { cx, dateTime, kwh, n, pct } from "@/lib/format";

export default function Decisions() {
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("facility_selection");
  const list = useQuery({ queryKey: ["decisions", status, kind], queryFn: () => api.get<any[]>(`/ai-decisions?${new URLSearchParams({ ...(status && { status }), ...(kind && { kind }) })}`) });
  const [sel, setSel] = useState<number | null>(null);
  const current = list.data?.find((d) => d.id === sel) ?? list.data?.[0];
  const opt = useQuery({ queryKey: ["optimizer"], queryFn: () => api.get<any>("/settings/optimizer") });
  const outcomes = (list.data ?? []).filter((d) => d.outcome?.actual_kwh != null);
  const mape = outcomes.length ? outcomes.reduce((a, d) => a + Math.abs(d.outcome.error_pct), 0) / outcomes.length : null;

  return (
    <div className="space-y-5">
      <PageHeader title="AI Decision Engine" subtitle="Every destination decision with its inputs, model output, ranking of all facilities, and the reasons — traceable to model versions and weights."
        actions={<>
          <Select className="w-44" value={kind} onChange={(e) => setKind(e.target.value)}><option value="facility_selection">Facility selection</option><option value="pathway">Material pathways</option><option value="">All decisions</option></Select>
          <Select className="w-36" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any status</option><option value="proposed">Proposed</option><option value="approved">Approved</option><option value="overridden">Overridden</option></Select>
        </>} />
      <div className="grid gap-4 md:grid-cols-3">
        <Panel title="Decisions"><div className="num text-3xl font-semibold">{list.data?.length ?? "—"}</div><div className="text-xs text-ink-3">{(list.data ?? []).filter((d) => d.status === "overridden").length} human overrides</div></Panel>
        <Panel title="Live outcome error"><div className="num text-3xl font-semibold">{mape != null ? `${n(mape, 1)}%` : "—"}</div><div className="text-xs text-ink-3">mean |predicted − actual| over {outcomes.length} decisions with metered output</div></Panel>
        <Panel title="Optimizer weights"><BarList items={Object.entries(opt.data?.weights ?? {}).map(([k, v]) => ({ label: k.replace("_", " "), value: v as number }))} format={(v) => v.toFixed(2)} /></Panel>
      </div>
      <div className="grid gap-5 2xl:grid-cols-[380px_1fr]">
        <Panel title="Decision log" bodyClass="p-0 max-h-[900px] overflow-y-auto">
          {list.isLoading ? <Loading /> : !list.data?.length ? <div className="p-4"><Empty>No decisions yet.</Empty></div> : (
            <table className="w-full"><thead><tr><Th>Decision</Th><Th right>Score</Th><Th>Status</Th></tr></thead>
              <tbody>{list.data.map((d) => (
                <tr key={d.id} onClick={() => setSel(d.id)} className={cx("cursor-pointer", d.id === current?.id ? "bg-raised" : "hover:bg-raised/40")}>
                  <Td><div className="num text-xs text-ink">{d.code} <span className="text-ink-3">· {dateTime(d.created_at)}</span></div><div className="text-xs">{d.subject}</div>
                    {d.outcome?.actual_kwh != null && <div className="num text-[11px] text-accent">actual {kwh(d.outcome.actual_kwh)} · err {n(d.outcome.error_pct, 1)}%</div>}</Td>
                  <Td right mono>{d.score != null ? n(d.score) : "—"}</Td>
                  <Td><Status s={d.status} /></Td>
                </tr>
              ))}</tbody></table>
          )}
        </Panel>
        <div>{current ? <><div className="mb-2 flex justify-end"><Link href={`/ai-decisions/${current.id}`} className="text-xs text-ink-3 hover:text-ink">Open full page →</Link></div><DecisionView d={current} outcome={current.outcome} /></> : null}</div>
      </div>
    </div>
  );
}
