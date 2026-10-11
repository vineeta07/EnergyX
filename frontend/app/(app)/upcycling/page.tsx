"use client";
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shirt, Leaf, IndianRupee, Package, Sparkles, Check } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { Badge, Button, Empty, ErrorBox, Field, Input, Kpi, Loading, PageHeader, Panel, Select, SimTag, Status, Td, Th } from "@/components/ui";
import { cx, inr, kg, n, UPCYCLE_LABEL, ago } from "@/lib/format";

export default function Upcycling() {
  const role = useAuth((s) => s.user?.role);
  const canAct = role === "hub" || role === "admin";
  const qc = useQueryClient();
  const sum = useQuery({ queryKey: ["circular-summary"], queryFn: () => api.get<any>("/circular/summary"), refetchInterval: 15_000 });
  const lots = useQuery({ queryKey: ["upcycle-lots"], queryFn: () => api.get<any[]>("/upcycling/lots"), refetchInterval: 10_000 });
  const partners = useQuery({ queryKey: ["partners"], queryFn: () => api.get<any[]>("/circular/partners") });
  const [sel, setSel] = useState<number | null>(null);
  const lot = (lots.data ?? []).find((l) => l.id === sel) ?? null;
  const u = sum.data?.upcycling;

  return (
    <div className="space-y-5">
      <PageHeader title="Upcycling" subtitle="Items with more value intact than as raw material — textiles, glass jars, PET and HDPE containers, cardboard — are set aside at the hub, matched by the AI to an upcycling partner, and tracked until products are made. Partner receipts feed back into each partner's learned acceptance rate." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Diverted to upcycling" value={n(u?.kg)} unit="kg" sub={`${u?.lots ?? 0} lots · ${n(u?.accepted_kg)} kg accepted`} icon={<Shirt className="size-4" />} />
        <Kpi label="CO2e avoided" value={n(u?.co2_avoided_kg)} unit="kg" sub="vs default route, net of transport" icon={<Leaf className="size-4" />} accent />
        <Kpi label="Partner payments" value={inr(u?.revenue_inr)} sub="for accepted material" icon={<IndianRupee className="size-4" />} />
        <Kpi label="Products made" value={n(u?.units_made)} sub="reported by partners" icon={<Package className="size-4" />} />
      </div>

      <div className="space-y-5">
        <Panel title="Upcycle lots" subtitle="Create lots from a classified shipment (Processing Hub → shipment) or manually here" bodyClass="p-0"
          actions={canAct && <NewLot />}>
          {lots.isLoading ? <Loading /> : !lots.data?.length ? <div className="p-4"><Empty>No lots yet. Open a classified shipment in the Processing Hub and use “Set aside” under Upcycling opportunities.</Empty></div> : (
            <table className="w-full"><thead><tr><Th>Lot</Th><Th>Category</Th><Th right>Mass</Th><Th>From</Th><Th>Partner</Th><Th>Status</Th></tr></thead>
              <tbody>{lots.data.map((l) => (
                <tr key={l.id} onClick={() => setSel(l.id)} className={cx("cursor-pointer hover:bg-raised/50", sel === l.id && "bg-raised")}>
                  <Td className="num text-ink">{l.code}</Td><Td>{UPCYCLE_LABEL[l.category]}</Td><Td right mono>{kg(l.kg)}</Td>
                  <Td>{l.shipment_code ? <Link href={`/hub/classification/${l.shipment_id}`} className="num text-accent" onClick={(e) => e.stopPropagation()}>{l.shipment_code}</Link> : l.hub_code}</Td>
                  <Td className="max-w-[180px] truncate">{l.partner_name ?? "—"}</Td><Td><Status s={l.status} /></Td>
                </tr>
              ))}</tbody></table>
          )}
        </Panel>
        {lot ? <LotDetail lot={lot} canAct={canAct} onChange={() => qc.invalidateQueries()} /> : <p className="text-center text-xs text-ink-3">Select a lot to see the AI partner match and its lifecycle.</p>}
      </div>

      <Panel title={<span className="flex items-center gap-2">Upcycling partners <SimTag label="DEMO PARTNERS" /></span>} subtitle="Prices are INR/kg paid for upcycle-grade material. Acceptance starts at an 85% prior and is learned from every receipt." bodyClass="p-0">
        {partners.isLoading ? <Loading /> : (
          <table className="w-full"><thead><tr><Th>Partner</Th><Th>Accepts (₹/kg)</Th><Th right>Capacity / week</Th><Th right>Received</Th><Th right>Accepted</Th><Th right>Observed acceptance</Th><Th>Makes</Th></tr></thead>
            <tbody>{(partners.data ?? []).filter((p) => p.kind === "upcycler").map((p) => (
              <tr key={p.id}><Td className="text-ink">{p.name}</Td><Td className="text-xs">{Object.entries(p.prices).map(([k, v]) => `${UPCYCLE_LABEL[k]} ₹${v}`).join(" · ")}</Td>
                <Td right mono>{kg(p.capacity_kg_week)}</Td><Td right mono>{kg(p.received_kg)}</Td><Td right mono>{kg(p.accepted_kg)}</Td>
                <Td right mono>{p.observed_acceptance != null ? `${Math.round(p.observed_acceptance * 100)}%` : "prior 85%"}</Td><Td className="text-xs">{p.products}</Td></tr>
            ))}</tbody></table>
        )}
      </Panel>
    </div>
  );
}

function NewLot() {
  const qc = useQueryClient();
  const hubs = useQuery({ queryKey: ["hubs"], queryFn: () => api.get<any[]>("/hubs") });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ hub_id: 0, category: "textile", kg: 100 });
  const m = useMutation({ mutationFn: () => api.post("/upcycling/lots", { ...f, hub_id: f.hub_id || hubs.data?.[0]?.id }), onSuccess: () => { setOpen(false); qc.invalidateQueries(); } });
  if (!open) return <Button size="sm" onClick={() => setOpen(true)}>New lot</Button>;
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Select className="w-36" value={f.hub_id} onChange={(e) => setF({ ...f, hub_id: Number(e.target.value) })}>{(hubs.data ?? []).map((h) => <option key={h.id} value={h.id}>{h.code} {h.name.split(" ")[0]}</option>)}</Select>
      <Select className="w-40" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{Object.entries(UPCYCLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
      <Input type="number" className="w-20" value={f.kg} onChange={(e) => setF({ ...f, kg: Number(e.target.value) })} />
      <Button size="sm" variant="primary" loading={m.isPending} onClick={() => m.mutate()}>Create</Button>
      {m.error && <ErrorBox error={m.error} />}
    </div>
  );
}

function LotDetail({ lot, canAct, onChange }: { lot: any; canAct: boolean; onChange: () => void }) {
  const act = useMutation({ mutationFn: ({ path, body }: { path: string; body?: any }) => api.post(`/upcycling/lots/${lot.id}/${path}`, body ?? {}), onSuccess: onChange });
  const m = lot.match;
  const chosen = m?.ranking?.find((r: any) => r.partner_id === lot.partner_id);
  const [accepted, setAccepted] = useState<number | "">("");
  const [prod, setProd] = useState({ products: "", units_made: 0 });
  return (
    <Panel title={<span className="flex items-center gap-2"><span className="num">{lot.code}</span><Status s={lot.status} /></span>}
      subtitle={`${UPCYCLE_LABEL[lot.category]} · ${kg(lot.kg)} · ${lot.hub_code}${lot.shipment_code ? ` · from ${lot.shipment_code}` : ""} · updated ${ago(lot.updated_at)}`}>
      <Lifecycle status={lot.status} />
      {!m ? (
        canAct && <div className="mt-4"><Button variant="primary" loading={act.isPending} onClick={() => act.mutate({ path: "match" })}><Sparkles className="size-4" />Match partner with AI</Button></div>
      ) : (
        <div className="mt-4 space-y-3">
          <div className={cx("rounded-md border p-3", m.upcycle_better ? "border-accent/30 bg-accent/5" : "border-line")}>
            <div className="text-sm font-medium">{m.explanation.headline}</div>
            <ul className="mt-1.5 space-y-0.5 text-xs text-ink-2">{m.explanation.bullets.map((b: string) => <li key={b}>– {b}</li>)}</ul>
            <div className="mt-2 text-[11px] text-ink-3">Default route without upcycling: {m.fallback.route} · {inr(m.fallback.value_inr)} · {n(m.fallback.co2_avoided_kg)} kg CO2e avoided</div>
          </div>
          <table className="w-full"><thead><tr><Th>#</Th><Th>Partner</Th><Th right>Score</Th><Th right>Accept</Th><Th right>Net value</Th><Th right>CO2e avoided</Th><Th right>km</Th></tr></thead>
            <tbody>{m.ranking.map((r: any) => (
              <tr key={r.partner_id} className={cx(!r.eligible && "opacity-50", r.partner_id === lot.partner_id && "bg-accent/5")}>
                <Td className="num">{r.rank ?? "—"}</Td><Td className="text-ink">{r.name}{!r.eligible && <div className="text-[10px] text-ink-3">{r.exclusion_reason}</div>}</Td>
                <Td right mono>{r.score ?? "—"}</Td><Td right mono>{Math.round(r.acceptance_rate * 100)}%</Td><Td right mono>{inr(r.net_value_inr)}</Td><Td right mono>{n(r.co2_avoided_kg)} kg</Td><Td right mono>{r.distance_km}</Td>
              </tr>
            ))}</tbody></table>
          <div className="text-[11px] text-ink-3">Score = 40% net value + 35% CO2e avoided + 15% learned acceptance + 10% proximity (normalised across eligible partners).</div>
        </div>
      )}
      {canAct && (
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4">
          {lot.status === "matched" && <>
            {lot.partner_id && <Button variant="primary" loading={act.isPending} onClick={() => act.mutate({ path: "dispatch" })}>Dispatch to {chosen?.name?.split(" — ")[0] ?? "partner"}</Button>}
            <Button variant="ghost" loading={act.isPending} onClick={() => act.mutate({ path: "dispatch", body: { fallback: true } })}>Send to default route</Button>
            <Button variant="ghost" onClick={() => act.mutate({ path: "match" })}>Re-match</Button>
          </>}
          {lot.status === "in_transit" && <>
            <Field label="Partner accepted (kg)" hint={chosen ? `AI expects ${n(chosen.expected_accepted_kg)} kg` : undefined}><Input type="number" className="w-32" value={accepted} placeholder={chosen ? String(Math.round(chosen.expected_accepted_kg)) : ""} onChange={(e) => setAccepted(e.target.value === "" ? "" : Number(e.target.value))} /></Field>
            <Button variant="primary" loading={act.isPending} onClick={() => act.mutate({ path: "receive", body: { accepted_kg: accepted === "" ? Math.round(chosen?.expected_accepted_kg ?? lot.kg) : accepted } })}><Check className="size-4" />Record partner receipt</Button>
          </>}
          {lot.status === "received" && <>
            <Field label="Products made"><Input className="w-44" placeholder="e.g. tote bags" value={prod.products} onChange={(e) => setProd({ ...prod, products: e.target.value })} /></Field>
            <Field label="Units"><Input type="number" className="w-24" value={prod.units_made} onChange={(e) => setProd({ ...prod, units_made: Number(e.target.value) })} /></Field>
            <Button variant="primary" disabled={!prod.products} loading={act.isPending} onClick={() => act.mutate({ path: "complete", body: prod })}>Record products</Button>
          </>}
        </div>
      )}
      {(lot.accepted_kg != null) && (
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3 text-sm sm:grid-cols-4">
          <div><div className="text-[10px] uppercase tracking-wider text-ink-3">Accepted</div><div className="num">{kg(lot.accepted_kg)}</div></div>
          <div><div className="text-[10px] uppercase tracking-wider text-ink-3">Rejected → default route</div><div className="num">{kg(lot.rejected_kg)}</div></div>
          <div><div className="text-[10px] uppercase tracking-wider text-ink-3">CO2e avoided</div><div className="num text-accent">{n(lot.co2_avoided_kg)} kg</div></div>
          <div><div className="text-[10px] uppercase tracking-wider text-ink-3">Products</div><div className="num">{lot.units_made != null ? `${lot.units_made} ${lot.products}` : "—"}</div></div>
        </div>
      )}
      {act.error && <div className="mt-2"><ErrorBox error={act.error} /></div>}
      {lot.status === "received" && chosen && <p className="mt-2 text-[11px] text-cyan">Feedback stored: the partner's acceptance rate now reflects this receipt ({n(lot.accepted_kg)} of {n(lot.kg)} kg accepted vs {n(chosen.expected_accepted_kg)} kg expected).</p>}
      <Badge className="mt-3">Factors are assumptions — docs/CIRCULAR.md</Badge>
    </Panel>
  );
}

function Lifecycle({ status }: { status: string }) {
  const steps = ["identified", "matched", "in_transit", "received", "upcycled"];
  const i = status === "fallback" ? 1 : steps.indexOf(status);
  return (
    <div className="flex flex-wrap gap-1.5">
      {["Set aside", "AI matched", "Dispatched", "Partner receipt", "Upcycled"].map((l, k) => <Badge key={l} tone={k <= i ? "green" : "neutral"}>{k <= i ? <Check className="size-3" /> : <span className="num">{k + 1}</span>}{l}</Badge>)}
      {status === "fallback" && <Badge tone="warn">sent to default route</Badge>}
    </div>
  );
}
