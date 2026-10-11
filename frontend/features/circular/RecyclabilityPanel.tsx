"use client";
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Recycle, Shirt, Info } from "lucide-react";
import { api } from "@/lib/api";
import { Badge, Button, ErrorBox, Panel, Status, Td, Th } from "@/components/ui";
import { kg, STREAM_COLOR, STREAM_LABEL, UPCYCLE_LABEL } from "@/lib/format";

/** Recyclable vs non-recyclable split of a classified load + upcycling opportunities (set items aside before dispatch). */
export function RecyclabilityPanel({ shipmentId, rec, canAct, locked }: { shipmentId: number; rec: any; canAct: boolean; locked: boolean }) {
  const qc = useQueryClient();
  const lots = useQuery({ queryKey: ["upcycle-lots"], queryFn: () => api.get<any[]>("/upcycling/lots") });
  const mine = (lots.data ?? []).filter((l) => l.shipment_id === shipmentId);
  const [qty, setQty] = useState<Record<string, number>>({});
  const create = useMutation({
    mutationFn: (u: any) => api.post("/upcycling/lots", { shipment_id: shipmentId, category: u.category, kg: qty[u.category] ?? Math.round(u.upcyclable_kg) }),
    onSuccess: () => qc.invalidateQueries(),
  });
  const total = rec.recyclable_kg + rec.non_recyclable_kg;
  const nonBio = rec.non_recyclable_kg - rec.biodegradable_kg;
  const seg = [
    { k: "Recyclable", v: rec.recyclable_kg, c: "var(--cyan)" },
    { k: "Biodegradable (non-recyclable)", v: rec.biodegradable_kg, c: "var(--s-organic)" },
    { k: "Non-recyclable residual", v: nonBio, c: "var(--ink-3)" },
  ];
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Panel title={<span className="flex items-center gap-2"><Recycle className="size-4 text-cyan" />Recyclable vs non-recyclable</span>} subtitle={rec.method}>
        <div className="grid grid-cols-2 gap-3">
          <div><div className="text-[10px] uppercase tracking-wider text-ink-3">Recyclable</div><div className="num text-2xl font-semibold text-cyan">{rec.recyclable_pct}%</div><div className="num text-xs text-ink-3">{kg(rec.recyclable_kg)}</div></div>
          <div><div className="text-[10px] uppercase tracking-wider text-ink-3">Non-recyclable</div><div className="num text-2xl font-semibold">{rec.non_recyclable_pct}%</div><div className="num text-xs text-ink-3">{kg(rec.non_recyclable_kg)} · {rec.biodegradable_pct}% of the load is biodegradable</div></div>
        </div>
        <div className="mt-3 flex h-3 overflow-hidden rounded">{seg.map((s) => <div key={s.k} title={`${s.k}: ${kg(s.v)}`} style={{ width: `${(100 * s.v) / Math.max(1, total)}%`, background: s.c }} />)}</div>
        <div className="mt-1.5 flex flex-wrap gap-3 text-[11px] text-ink-3">{seg.map((s) => <span key={s.k} className="flex items-center gap-1"><span className="size-2 rounded-sm" style={{ background: s.c }} />{s.k}</span>)}</div>
        <table className="mt-4 w-full"><thead><tr><Th>Stream</Th><Th right>Mass</Th><Th right>Recyclable</Th><Th right>Non-recyclable</Th><Th>Basis</Th></tr></thead>
          <tbody>{rec.by_stream.map((b: any) => (
            <tr key={b.stream}><Td><span className="mr-1.5 inline-block size-2 rounded-sm" style={{ background: STREAM_COLOR[b.stream] }} />{STREAM_LABEL[b.stream]}</Td><Td right mono className="whitespace-nowrap">{kg(b.kg)}</Td>
              <Td right mono className="whitespace-nowrap text-cyan">{b.stream === "organic" ? "—" : `${Math.round(b.recyclable_share * 100)}% · ${kg(b.recyclable_kg)}`}</Td><Td right mono className="whitespace-nowrap">{kg(b.non_recyclable_kg)}</Td><Td className="text-[11px]">{b.basis}</Td></tr>
          ))}</tbody></table>
        <p className="mt-3 flex gap-1.5 text-[11px] text-ink-3"><Info className="mt-0.5 size-3 shrink-0" />Recyclable plastic and paper are routed to an MRF; only the non-recyclable part is considered for energy recovery. Recyclable glass in “Other” is counted, but no MRF in the Delhi network accepts glass, so it goes to upcycling (jars, bottles) or the residual route. Labels follow Delhi practice: PET/HDPE, cans, cardboard, paper and glass are recyclable; thin film, cutlery, straws, styrofoam and PE-lined cups are not.</p>
      </Panel>

      <Panel title={<span className="flex items-center gap-2"><Shirt className="size-4 text-accent" />Upcycling opportunities</span>} subtitle="Upcycle-grade items to set aside before dispatch (waste hierarchy: reuse before recycling before energy)">
        <table className="w-full"><thead><tr><Th>Category</Th><Th right>Est. upcyclable</Th><Th>Basis</Th>{canAct && !locked && <Th right>Set aside</Th>}</tr></thead>
          <tbody>{rec.upcycling.map((u: any) => (
            <tr key={u.category}><Td className="text-ink">{UPCYCLE_LABEL[u.category]}</Td><Td right mono className="whitespace-nowrap">{kg(u.upcyclable_kg)}</Td><Td className="text-[11px]">{u.basis} · {Math.round(u.grade_rate * 100)}% grade rate</Td>
              {canAct && !locked && <Td right><span className="inline-flex items-center gap-1.5">
                <input type="number" min={1} value={qty[u.category] ?? Math.round(u.upcyclable_kg)} onChange={(e) => setQty({ ...qty, [u.category]: Number(e.target.value) })} className="num h-7 w-20 rounded border border-line-2 bg-canvas px-1.5 text-right text-xs" />
                <Button size="sm" disabled={u.upcyclable_kg < 1} loading={create.isPending && create.variables?.category === u.category} onClick={() => create.mutate(u)}>Set aside</Button></span></Td>}
            </tr>
          ))}</tbody></table>
        {create.error && <div className="mt-2"><ErrorBox error={create.error} /></div>}
        {mine.length > 0 && (
          <div className="mt-4 space-y-1.5 border-t border-line pt-3">
            <div className="text-[11px] uppercase tracking-wider text-ink-3">Upcycle lots from this load</div>
            {mine.map((l) => (
              <Link key={l.id} href="/upcycling" className="flex items-center justify-between rounded border border-line px-2 py-1.5 text-xs hover:border-line-2">
                <span><span className="num text-ink">{l.code}</span> · {UPCYCLE_LABEL[l.category]} · <span className="num">{kg(l.kg)}</span>{l.partner_name && <span className="text-ink-3"> → {l.partner_name}</span>}</span><Status s={l.status} />
              </Link>
            ))}
          </div>
        )}
        <p className="mt-3 text-[11px] text-ink-3">Estimates start from Delhi priors (≈3% textiles, 1% glass, …) and are updated by the photo sample audit. Each lot is matched to a partner by the AI on the <Link href="/upcycling" className="text-accent">Upcycling</Link> page. <Badge>assumptions in docs/CIRCULAR.md</Badge></p>
      </Panel>
    </div>
  );
}
