"use client";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { Landmark, Zap, Trash2, Truck, ExternalLink } from "lucide-react";
import { api } from "@/lib/api";
import { Badge, Button, ErrorBox, Loading, PageHeader, Panel, Td, Th } from "@/components/ui";
import { ChartTooltip } from "@/components/charts";
import { NetworkMap } from "@/components/map/NetworkMap";
import { cx, n } from "@/lib/format";

/** City allocation planner: MCD's current zone→plant assignment vs the energy-optimal one, on real Delhi data. */
export default function Planner() {
  const scen = useQuery({ queryKey: ["planner-scenarios"], queryFn: () => api.get<Record<string, { label: string; source: string }>>("/planner/scenarios") });
  const [on, setOn] = useState<string[]>([]);
  const run = useMutation({ mutationFn: (s: string[]) => api.post<any>("/planner/city", { scenarios: s }) });
  const [view, setView] = useState<"optimized" | "current">("optimized");
  const d = run.data;
  useEffect(() => { run.mutate([]); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (k: string) => {
    const next = on.includes(k) ? on.filter((x) => x !== k) : [...on, k];
    setOn(next);
    run.mutate(next);
  };

  const facChart = d ? d.facilities.filter((f: any) => f.technology !== "anaerobic_digestion" || f.status === "online").map((f: any) => ({
    label: f.label, current: d.current.by_facility_tpd[f.code] ?? 0, optimized: d.optimized.by_facility_tpd[f.code] ?? 0, capacity: f.technology === "landfill" ? null : f.capacity_tpd,
  })) : [];
  const zoneById = new Map((d?.zones ?? []).map((z: any) => [z.name, z]));
  const facByLabel = new Map((d?.facilities ?? []).map((f: any) => [f.label, f]));
  const lines = d ? d[view].allocation.map((a: any, i: number) => {
    const z: any = zoneById.get(a.zone), f: any = facByLabel.get(a.label);
    if (!z || !f) return null;
    return { id: `l${i}`, coords: [[z.lng, z.lat], [f.lng, f.lat]] as [number, number][], color: f.technology === "landfill" ? "#f05252" : "#3ddc84", width: Math.max(1, a.tpd / 250), dashed: f.technology === "landfill" };
  }).filter(Boolean) : [];

  return (
    <div className="space-y-5">
      <PageHeader title={<span className="flex items-center gap-3">City Allocation Planner <Badge tone="green">REAL DELHI DATA</Badge></span>}
        subtitle="How should Delhi's 11,000 TPD be split across its plants? A linear program assigns every zone's published tonnage to real facilities within their published capacities, maximizing electricity minus haulage diesel. It is compared with MCD's current zone→plant assignment (DPCC)." />

      <Panel title="Scenarios" subtitle="Published capacity additions. Toggle to see their effect.">
        <div className="flex flex-wrap gap-2">
          {Object.entries(scen.data ?? {}).map(([k, s]) => (
            <label key={k} className={cx("flex cursor-pointer items-center gap-2 rounded border px-3 py-2 text-xs", on.includes(k) ? "border-accent/50 bg-accent/10 text-ink" : "border-line-2 text-ink-2 hover:border-ink-3")}>
              <input type="checkbox" checked={on.includes(k)} onChange={() => toggle(k)} className="accent-[var(--accent)]" />
              {s.label}
              <a href={s.source} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-ink-3 hover:text-cyan" title="Source"><ExternalLink className="size-3" /></a>
            </label>
          ))}
          {on.length > 0 && <Button size="sm" variant="ghost" onClick={() => { setOn([]); run.mutate([]); }}>Reset</Button>}
        </div>
      </Panel>

      {run.error && <ErrorBox error={run.error} />}
      {!d ? <Loading label="Solving allocation" /> : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Compare icon={<Zap className="size-4" />} label="Electricity" unit="MWh/day" a={d.current.energy_mwh_day} b={d.optimized.energy_mwh_day} better="up" />
            <Compare icon={<Landmark className="size-4" />} label="Net of haulage diesel" unit="MWh/day" a={d.current.net_energy_mwh_day} b={d.optimized.net_energy_mwh_day} better="up" />
            <Compare icon={<Trash2 className="size-4" />} label="Sent to landfill" unit="TPD" a={d.current.landfill_tpd} b={d.optimized.landfill_tpd} better="down" />
            <Compare icon={<Truck className="size-4" />} label="Haulage" unit="tonne-km/day" a={d.current.tonne_km_day} b={d.optimized.tonne_km_day} better="down" />
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.1fr_1fr]">
            <Panel title="Tonnes per day by facility" subtitle="Current MCD assignment vs optimized. Bars stop at plant capacity; landfills absorb the overflow.">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={facChart} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barCategoryGap={8}>
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="label" stroke="var(--ink-3)" fontSize={11} tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={50} />
                  <YAxis stroke="var(--ink-3)" fontSize={11} tickLine={false} axisLine={false} width={52} />
                  <Tooltip content={<ChartTooltip unit=" TPD" />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                  <Legend formatter={(v: string) => <span className="text-xs text-ink-2">{v}</span>} />
                  <Bar dataKey="current" name="MCD current" fill="var(--s-paper)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="optimized" name="WattCycle optimized" fill="var(--s-organic)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>
            <Panel title="Zone → facility flows" bodyClass="p-0" actions={
              <div className="flex rounded border border-line-2 text-xs">
                {(["optimized", "current"] as const).map((v) => <button key={v} onClick={() => setView(v)} className={cx("px-2.5 py-1", view === v ? "bg-raised text-ink" : "text-ink-3")}>{v === "optimized" ? "Optimized" : "MCD current"}</button>)}
              </div>}>
              <NetworkMap height={340} className="rounded-none border-0" layers={{ sources: true, vehicles: false, routes: false, hubs: false, facilities: true }} extra={{ lines: lines as any }} />
            </Panel>
          </div>

          <Panel title="Allocation by zone" subtitle={`${d.method}. Road distances: OpenStreetMap (OSRM).`} bodyClass="p-0">
            <table className="w-full min-w-[760px]">
              <thead><tr><Th>Zone</Th><Th right>TPD</Th><Th>MCD current</Th><Th>WattCycle optimized</Th></tr></thead>
              <tbody>
                {d.zones.map((z: any) => {
                  const cur = d.current.allocation.filter((a: any) => a.zone === z.name);
                  const opt = d.optimized.allocation.filter((a: any) => a.zone === z.name);
                  const fmt = (xs: any[]) => xs.map((a) => <div key={a.facility} className={cx("text-xs", a.label.includes("SLF") ? "text-crit" : "text-ink-2")}>{a.label} <span className="num text-ink-3">{n(a.tpd)} t · {n(a.km, 1)} km</span></div>);
                  return <tr key={z.name}><Td className="text-ink">{z.name}<div className="text-[11px] text-ink-3">{z.wards} wards</div></Td><Td right mono>{n(z.tpd)}</Td><Td>{fmt(cur)}</Td><Td>{fmt(opt)}</Td></tr>;
                })}
              </tbody>
            </table>
          </Panel>
          <p className="text-[11px] text-ink-3">
            Assumptions: plant yield = published MW × 24 ÷ TPD (kWh per tonne of mixed MSW); biomethanation 150 kWh/t of segregated organics, limited to 40% organic × 57% segregation (DPCC);
            haulage {d.assumptions.diesel_kwh_per_tonne_km} kWh diesel per tonne-km. The current-practice baseline splits each zone equally across the destinations DPCC lists and overflows to the nearest landfill.
            It processes ≈{n(11000 - d.current.landfill_tpd)} TPD vs the {n(7200)} TPD DPCC reports.
          </p>
        </>
      )}
    </div>
  );
}

function Compare({ icon, label, unit, a, b, better }: { icon: React.ReactNode; label: string; unit: string; a: number; b: number; better: "up" | "down" }) {
  const delta = b - a;
  const good = better === "up" ? delta > 0 : delta < 0;
  return (
    <div className="rounded-md border border-line bg-panel px-4 py-3">
      <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3"><span>{label}</span>{icon}</div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div><div className="text-[10px] text-ink-3">MCD current</div><div className="num text-lg text-ink-2">{n(a)}</div></div>
        <div><div className="text-[10px] text-ink-3">Optimized</div><div className="num text-lg font-semibold text-ink">{n(b)}</div></div>
      </div>
      <div className={cx("num mt-1 text-xs", delta === 0 ? "text-ink-3" : good ? "text-accent" : "text-crit")}>{delta > 0 ? "+" : ""}{n(delta)} {unit}{a ? ` (${delta > 0 ? "+" : ""}${n((delta / a) * 100, 1)}%)` : ""}</div>
    </div>
  );
}
