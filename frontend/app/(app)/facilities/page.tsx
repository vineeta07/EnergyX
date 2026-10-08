"use client";
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { Button, ErrorBox, Field, Input, Loading, Meter, PageHeader, Panel, Select, SimTag, Status } from "@/components/ui";
import { NetworkMap } from "@/components/map/NetworkMap";
import { kwh, n, pct, TECH_LABEL, STREAM_LABEL } from "@/lib/format";

export default function Facilities() {
  const role = useAuth((s) => s.user?.role);
  const [adding, setAdding] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["facilities"], queryFn: () => api.get<any[]>("/facilities") });
  return (
    <div className="space-y-5">
      <PageHeader title="Energy Facilities" subtitle="Waste-to-energy and material-recovery destinations with capacity, compatibility and measured performance."
        actions={(role === "facility" || role === "admin") && <Button variant="primary" onClick={() => setAdding(!adding)}><Plus className="size-4" />Register facility</Button>} />
      {adding && <AddFacility onDone={() => setAdding(false)} />}
      <div className="grid gap-5 xl:grid-cols-[1fr_440px]">
        <div className="grid gap-3 md:grid-cols-2">
          {isLoading ? <Loading /> : data!.map((f) => (
            <Link key={f.id} href={`/facilities/${f.id}`} className="rounded-md border border-line bg-panel p-4 hover:border-accent/40">
              <div className="flex items-start justify-between gap-2">
                <div><div className="text-sm font-semibold text-ink">{f.label} <span className="font-normal text-ink-3">· {f.code}</span></div><div className="text-xs text-ink-2">{f.name}</div></div>
                <div className="flex items-center gap-1.5">{f.is_simulated && <SimTag />}<Status s={f.status} /></div>
              </div>
              <div className="mt-2 text-xs text-cyan">{TECH_LABEL[f.technology]}</div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div><div className="text-ink-3">Capacity</div><div className="num text-ink">{f.capacity_tpd} t/d</div></div>
                <div><div className="text-ink-3">Efficiency</div><div className="num text-ink">{pct(f.efficiency_pct)}</div></div>
                <div><div className="text-ink-3">Hist. yield</div><div className="num text-ink">{f.hist_yield != null ? `${n(f.hist_yield, 2)} kWh/kg` : "—"}</div></div>
              </div>
              <div className="mt-3"><div className="mb-1 flex justify-between text-[11px] text-ink-3"><span>Utilization</span><span className="num">{pct(f.utilization_pct)}</span></div><Meter value={f.utilization_pct} tone={f.utilization_pct >= 85 ? "crit" : f.utilization_pct >= 70 ? "warn" : "green"} /></div>
              <div className="mt-3 flex flex-wrap gap-1">{(f.capabilities ?? []).map((c: any) => <span key={c.stream} className="rounded bg-raised px-1.5 py-0.5 text-[10px] text-ink-2">{STREAM_LABEL[c.stream]} {c.compatibility_pct}%</span>)}</div>
              <div className="mt-3 flex justify-between border-t border-line pt-2 text-[11px] text-ink-3"><span>30-day output <span className="num text-ink">{kwh(f.kwh_30d)}</span></span><span>{f.incoming} incoming</span></div>
            </Link>
          ))}
        </div>
        <NetworkMap height={620} layers={{ sources: false, vehicles: true, routes: true, hubs: true, facilities: true }} />
      </div>
    </div>
  );
}

function AddFacility({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState<any>({ name: "", lat: 28.62, lng: 77.2, technology: "anaerobic_digestion", capacity_tpd: 10, utilization_pct: 0, efficiency_pct: 80, stream: "organic", compat: 90 });
  const save = useMutation({
    mutationFn: () => api.post("/facilities", { name: f.name, lat: +f.lat, lng: +f.lng, technology: f.technology, capacity_tpd: +f.capacity_tpd, utilization_pct: +f.utilization_pct, efficiency_pct: +f.efficiency_pct, capabilities: [{ stream: f.stream, compatibility_pct: +f.compat }] }),
    onSuccess: () => { qc.invalidateQueries(); onDone(); },
  });
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  return (
    <Panel title="Register facility" subtitle="New facilities become eligible destinations immediately; the energy model uses network averages until history accumulates (wider uncertainty).">
      <form className="grid gap-3 md:grid-cols-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Field label="Name"><Input required value={f.name} onChange={set("name")} /></Field>
        <Field label="Technology"><Select value={f.technology} onChange={set("technology")}>{Object.entries(TECH_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Latitude"><Input type="number" step="0.0001" value={f.lat} onChange={set("lat")} /></Field>
        <Field label="Longitude"><Input type="number" step="0.0001" value={f.lng} onChange={set("lng")} /></Field>
        <Field label="Capacity (t/day)"><Input type="number" value={f.capacity_tpd} onChange={set("capacity_tpd")} /></Field>
        <Field label="Efficiency %"><Input type="number" value={f.efficiency_pct} onChange={set("efficiency_pct")} /></Field>
        <Field label="Compatible stream"><Select value={f.stream} onChange={set("stream")}>{Object.entries(STREAM_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Compatibility %"><Input type="number" value={f.compat} onChange={set("compat")} /></Field>
        <div className="md:col-span-4 flex gap-2"><Button variant="primary" loading={save.isPending}>Save facility</Button><Button type="button" variant="ghost" onClick={onDone}>Cancel</Button></div>
        {save.error && <div className="md:col-span-4"><ErrorBox error={save.error} /></div>}
      </form>
    </Panel>
  );
}
