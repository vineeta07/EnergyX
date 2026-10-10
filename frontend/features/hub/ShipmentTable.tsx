"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { Button, Status, Td, Th, ErrorBox } from "@/components/ui";
import { dateTime, kg, NONE } from "@/lib/format";

import { t, tEnum } from "@/lib/i18n";
export function ShipmentTable({ rows, canAct }: { rows: any[]; canAct: boolean }) {
  const router = useRouter();
  const qc = useQueryClient();
  const analyze = useMutation({
    mutationFn: (id: number) => api.post("/ai/classify", { shipment_id: id }),
    onSuccess: (_r, id) => { qc.invalidateQueries(); router.push(`/hub/classification/${id}`); },
  });
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px]">
        <thead><tr><Th>{t("Shipment")}</Th><Th>{t("Source")}</Th><Th right>{t("Weight")}</Th><Th>{t("Arrival")}</Th><Th>{t("Main stream")}</Th><Th>{t("Hub")}</Th><Th>{t("Status")}</Th><Th /></tr></thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} className="hover:bg-raised/40">
              <Td><Link href={`/hub/classification/${s.id}`} className="num font-medium text-ink hover:text-accent">{s.code}</Link></Td>
              <Td className="max-w-[260px] truncate text-ink">{s.source_label}</Td>
              <Td right mono className="text-ink">{kg(s.measured_kg ?? s.total_kg)}</Td>
              <Td>{s.arrived_at ? dateTime(s.arrived_at) : <span className="text-blue">{t("In transit")}</span>}</Td>
              <Td>{s.category ? tEnum(s.category) : NONE}{s.classification && <span className="num ml-1 text-xs text-ink-3">· {t("{n}% sure", { n: (s.classification.confidence * 100).toFixed(0) })}</span>}</Td>
              <Td>{s.hub_code}</Td>
              <Td><Status s={s.status} /></Td>
              <Td>
                {s.status === "awaiting_classification" && canAct
                  ? <Button size="sm" variant="primary" loading={analyze.isPending && analyze.variables === s.id} onClick={() => analyze.mutate(s.id)}>{t("Sort this load")}</Button>
                  : <Link href={`/hub/classification/${s.id}`}><Button size="sm">{t("Open")}</Button></Link>}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
      {analyze.error && <div className="p-3"><ErrorBox error={analyze.error} /></div>}
    </div>
  );
}
