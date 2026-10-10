"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { BarList, Empty, Loading, PageHeader, Panel, Select, Status, Td, Th } from "@/components/ui";
import { DecisionView } from "@/features/decisions/DecisionView";
import { cx, dateTime, kwh, n, NONE } from "@/lib/format";

import { t, tEnum } from "@/lib/i18n";
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
      <PageHeader title={t("Plant decisions")} subtitle={t("Every choice of plant, with its inputs, the ranking of all plants, the reasons, and the model version and weights it used.")}
        actions={<>
          <Select className="w-44" value={kind} onChange={(e) => setKind(e.target.value)}><option value="facility_selection">{t("Choice of plant")}</option><option value="pathway">{t("Material recovery routes")}</option><option value="">{t("All decisions")}</option></Select>
          <Select className="w-36" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">{t("Any status")}</option><option value="proposed">{t("Proposed")}</option><option value="approved">{t("Approved")}</option><option value="overridden">{t("Overridden")}</option></Select>
        </>} />
      <div className="grid gap-4 md:grid-cols-3">
        <Panel title={t("Decisions")}><div className="num font-serif text-3xl font-medium">{list.data?.length ?? NONE}</div><div className="text-xs text-ink-3">{t("{n} changed by a person", { n: (list.data ?? []).filter((d) => d.status === "overridden").length })}</div></Panel>
        <Panel title={t("Error against the meter")}><div className="num font-serif text-3xl font-medium">{mape != null ? `${n(mape, 1)}%` : NONE}</div><div className="text-xs text-ink-3">{t("Average gap between predicted and metered kWh over {n} decisions", { n: outcomes.length })}</div></Panel>
        <Panel title={t("Scoring weights")}><BarList items={Object.entries(opt.data?.weights ?? {}).map(([k, v]) => ({ label: tEnum(k), value: v as number }))} format={(v) => v.toFixed(2)} /></Panel>
      </div>
      <div className="grid gap-5 2xl:grid-cols-[380px_1fr]">
        <Panel title={t("Decision log")} bodyClass="p-0 max-h-[900px] overflow-y-auto">
          {list.isLoading ? <Loading /> : !list.data?.length ? <div className="p-4"><Empty>{t("No decisions yet.")}</Empty></div> : (
            <table className="w-full"><thead><tr><Th>{t("Decision")}</Th><Th right>{t("Score")}</Th><Th>{t("Status")}</Th></tr></thead>
              <tbody>{list.data.map((d) => (
                <tr key={d.id} onClick={() => setSel(d.id)} className={cx("cursor-pointer", d.id === current?.id ? "bg-raised" : "hover:bg-raised/40")}>
                  <Td><div className="num text-xs text-ink">{d.code} <span className="text-ink-3">· {dateTime(d.created_at)}</span></div><div className="text-xs">{d.subject}</div>
                    {d.outcome?.actual_kwh != null && <div className="num text-xs text-accent">{t("Metered {a}, error {e}%", { a: kwh(d.outcome.actual_kwh), e: n(d.outcome.error_pct, 1) })}</div>}</Td>
                  <Td right mono>{d.score != null ? n(d.score) : NONE}</Td>
                  <Td><Status s={d.status} /></Td>
                </tr>
              ))}</tbody></table>
          )}
        </Panel>
        <div>{current ? <><div className="mb-2 flex justify-end"><Link href={`/ai-decisions/${current.id}`} className="text-xs text-ink-3 hover:text-ink">{t("Open full page")}</Link></div><DecisionView d={current} outcome={current.outcome} /></> : null}</div>
      </div>
    </div>
  );
}
