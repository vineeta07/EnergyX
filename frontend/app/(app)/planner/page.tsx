"use client";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { Landmark, Zap, Trash2, Truck, ExternalLink } from "lucide-react";
import { api } from "@/lib/api";
import { Badge, Button, ErrorBox, Loading, PageHeader, Panel, Td, Th } from "@/components/ui";
import { ChartTooltip } from "@/components/charts";
import { NetworkMap } from "@/components/map/NetworkMap";
import { cx, n, token } from "@/lib/format";

import { t } from "@/lib/i18n";
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
    return { id: `l${i}`, coords: [[z.lng, z.lat], [f.lng, f.lat]] as [number, number][], color: f.technology === "landfill" ? token("warn") : token("accent"), width: Math.max(1, a.tpd / 250), dashed: f.technology === "landfill" };
  }).filter(Boolean) : [];

  return (
    <div className="space-y-5">
      <PageHeader title={<span className="flex flex-wrap items-center gap-3">{t("City plan")} <Badge tone="green">{t("Real Delhi data")}</Badge></span>}
        subtitle={t("How should Delhi's 11,000 tonnes a day be split across its plants? A linear program sends each zone's published tonnage to real plants, within their published capacities, to get the most electricity after haulage diesel. The result is set beside the current MCD assignment (DPCC).")} />

      <Panel title={t("Scenarios")} subtitle={t("Capacity additions that have been announced. Tick one to see what it changes.")}>
        <div className="flex flex-wrap gap-2">
          {Object.entries(scen.data ?? {}).map(([k, s]) => (
            <label key={k} className={cx("flex cursor-pointer items-center gap-2 rounded border px-3 py-2 text-xs", on.includes(k) ? "border-accent/50 bg-accent/10 text-ink" : "border-line-2 text-ink-2 hover:border-ink-3")}>
              <input type="checkbox" checked={on.includes(k)} onChange={() => toggle(k)} className="accent-[var(--accent)]" />
              {s.label}
              <a href={s.source} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-ink-3 hover:text-blue" title={t("Source")}><ExternalLink className="size-3" /></a>
            </label>
          ))}
          {on.length > 0 && <Button size="sm" variant="ghost" onClick={() => { setOn([]); run.mutate([]); }}>{t("Reset")}</Button>}
        </div>
      </Panel>

      {run.error && <ErrorBox error={run.error} />}
      {!d ? <Loading label="Solving the allocation" /> : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Compare icon={<Zap className="size-4" />} label={t("Electricity")} unit={t("MWh/day")} a={d.current.energy_mwh_day} b={d.optimized.energy_mwh_day} better="up" />
            <Compare icon={<Landmark className="size-4" />} label={t("Net of haulage diesel")} unit={t("MWh/day")} a={d.current.net_energy_mwh_day} b={d.optimized.net_energy_mwh_day} better="up" />
            <Compare icon={<Trash2 className="size-4" />} label={t("Sent to landfill")} unit={t("t/day")} a={d.current.landfill_tpd} b={d.optimized.landfill_tpd} better="down" />
            <Compare icon={<Truck className="size-4" />} label={t("Haulage")} unit={t("tonne-km/day")} a={d.current.tonne_km_day} b={d.optimized.tonne_km_day} better="down" />
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.1fr_1fr]">
            <Panel title={t("Tonnes a day, by plant")} subtitle={t("The current MCD assignment against the plan. A plant cannot take more than its capacity, so landfills absorb the overflow.")}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={facChart} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barCategoryGap={8}>
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="label" stroke="var(--ink-3)" fontSize={11} tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={50} />
                  <YAxis stroke="var(--ink-3)" fontSize={11} tickLine={false} axisLine={false} width={52} />
                  <Tooltip content={<ChartTooltip unit=" TPD" />} cursor={{ fill: "var(--raised)", fillOpacity: 0.6 }} />
                  <Legend formatter={(v: string) => <span className="text-xs text-ink-2">{v}</span>} />
                  <Bar dataKey="current" name={t("MCD current")} fill="var(--s-paper)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="optimized" name={t("WattCycle plan")} fill="var(--s-organic)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>
            <Panel title={t("Zone to plant flows")} bodyClass="p-0" actions={
              <div className="flex rounded border border-line-2 text-xs">
                {(["optimized", "current"] as const).map((v) => <button key={v} onClick={() => setView(v)} className={cx("px-2.5 py-1", view === v ? "bg-raised text-ink" : "text-ink-3")}>{v === "optimized" ? t("WattCycle plan") : t("MCD current")}</button>)}
              </div>}>
              <NetworkMap height={340} className="rounded-none border-0" layers={{ sources: true, vehicles: false, routes: false, hubs: false, facilities: true }} extra={{ lines: lines as any }} />
            </Panel>
          </div>

          <Panel title={t("Allocation by zone")} subtitle={t("{m}. Road distances from OpenStreetMap (OSRM).", { m: d.method })} bodyClass="p-0">
            <table className="w-full min-w-[760px]">
              <thead><tr><Th>{t("Zone")}</Th><Th right>{t("Tonnes a day")}</Th><Th>{t("MCD current")}</Th><Th>{t("WattCycle plan")}</Th></tr></thead>
              <tbody>
                {d.zones.map((z: any) => {
                  const cur = d.current.allocation.filter((a: any) => a.zone === z.name);
                  const opt = d.optimized.allocation.filter((a: any) => a.zone === z.name);
                  const fmt = (xs: any[]) => xs.map((a) => <div key={a.facility} className={cx("text-xs", a.label.includes("SLF") ? "text-crit" : "text-ink-2")}>{a.label} <span className="num text-ink-3">{t("{a} t, {b} km", { a: n(a.tpd), b: n(a.km, 1) })}</span></div>);
                  return <tr key={z.name}><Td className="text-ink">{z.name}<div className="text-xs text-ink-3">{t("{n} wards", { n: z.wards })}</div></Td><Td right mono>{n(z.tpd)}</Td><Td>{fmt(cur)}</Td><Td>{fmt(opt)}</Td></tr>;
                })}
              </tbody>
            </table>
          </Panel>
          <p className="text-xs leading-relaxed text-ink-3">
            {t("Assumptions: a plant makes its published MW times 24 hours, divided by its tonnes a day. Biomethanation makes 150 kWh per tonne of segregated organics, capped at 40% organic times 57% segregation (DPCC). Haulage burns {d} kWh of diesel per tonne-km. The current-practice baseline splits each zone equally across the destinations DPCC lists and sends the overflow to the nearest landfill. It processes about {a} t/day, against the {b} t/day DPCC reports.", { d: d.assumptions.diesel_kwh_per_tonne_km, a: n(11000 - d.current.landfill_tpd), b: n(7200) })}
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
    <div className="rounded-lg border border-line bg-panel px-4 py-3">
      <div className="flex items-center justify-between text-xs text-ink-3"><span>{label}</span>{icon}</div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div><div className="text-xs text-ink-3">{t("MCD current")}</div><div className="num text-lg text-ink-2">{n(a)}</div></div>
        <div><div className="text-xs text-ink-3">{t("WattCycle plan")}</div><div className="num text-lg font-medium text-ink">{n(b)}</div></div>
      </div>
      <div className={cx("num mt-1 text-xs", delta === 0 ? "text-ink-3" : good ? "text-accent" : "text-crit")}>{delta > 0 ? "+" : ""}{n(delta)} {t(unit)}{a ? ` (${delta > 0 ? "+" : ""}${n((delta / a) * 100, 1)}%)` : ""}</div>
    </div>
  );
}
