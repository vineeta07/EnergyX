"use client";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Play, Wand2, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { useLive } from "@/store/live";
import { Badge, Button, Empty, ErrorBox, Loading, Meter, PageHeader, Panel, Select, Status } from "@/components/ui";
import { NetworkMap } from "@/components/map/NetworkMap";
import { cx, inr, kg, n } from "@/lib/format";

export default function Routes() {
  const role = useAuth((s) => s.user?.role);
  const qc = useQueryClient();
  const positions = useLive((s) => s.positions);
  const [sel, setSel] = useState<number | null>(null);
  const [hub, setHub] = useState<string>("");
  const routes = useQuery({ queryKey: ["routes"], queryFn: () => api.get<any[]>("/routes?status=planned,active,completed"), refetchInterval: 8000 });
  const hubs = useQuery({ queryKey: ["hubs"], queryFn: () => api.get<any[]>("/hubs") });
  const open = useQuery({ queryKey: ["pickups", "REQUESTED"], queryFn: () => api.get<any[]>("/pickups?status=REQUESTED") });
  const live = (routes.data ?? []).filter((r) => r.status !== "cancelled");
  const route = useMemo(() => live.find((r) => r.id === sel) ?? live.find((r) => r.status !== "completed") ?? live[0], [live, sel]);
  useEffect(() => { if (route && sel == null) setSel(route.id); }, [route, sel]);

  const optimize = useMutation({ mutationFn: () => api.post<any>("/routes/optimize", hub ? { hub_id: Number(hub) } : {}), onSuccess: (r) => { qc.invalidateQueries(); if (r.routes?.[0]) setSel(r.routes[0].id); } });
  const recalc = useMutation({ mutationFn: (id: number) => api.post<any>(`/routes/${id}/recalculate`), onSuccess: (r) => { qc.invalidateQueries(); if (r.routes?.[0]) setSel(r.routes[0].id); } });
  const start = useMutation({ mutationFn: (id: number) => api.post(`/routes/${id}/start`), onSuccess: () => qc.invalidateQueries() });
  const fleet = role === "fleet" || role === "admin";
  const err = optimize.error ?? recalc.error ?? start.error;
  const veh = route ? positions[route.vehicle_id] : null;
  const progress = veh?.route_id === route?.id ? veh!.progress : route?.progress ?? 0;
  const load = route ? Math.max(0, ...route.stops.map((s: any) => s.load_kg ?? 0)) : 0;
  const fuel = route?.fuel_l;

  return (
    <div className="space-y-5">
      <PageHeader title="Route Optimization" subtitle="Capacitated vehicle routing with time windows (Google OR-Tools, guided local search). Urgent pickups carry higher drop penalties."
        actions={fleet && <>
          <Select className="w-48" value={hub} onChange={(e) => setHub(e.target.value)}><option value="">Hub: nearest to first request</option>{hubs.data?.map((h) => <option key={h.id} value={h.id}>{h.code} · {h.name}</option>)}</Select>
          <Button variant="primary" loading={optimize.isPending} onClick={() => optimize.mutate()}><Wand2 className="size-4" />Optimize {open.data?.length ?? 0} open pickups</Button>
        </>} />
      {err && <ErrorBox error={err} />}
      <div className="grid gap-5 xl:grid-cols-[1fr_400px]">
        <NetworkMap height={620} extra={{ highlightRouteId: route?.id, lines: route ? [{ id: "sel", coords: route.stops.map((s: any) => [s.lng, s.lat]), color: "#3ddc84", width: 4 }] : [] }} />
        <div className="space-y-4">
          {routes.isLoading ? <Loading /> : !route ? <Empty>No routes yet. Optimize open pickups to create one.</Empty> : (
            <Panel title={<span className="flex items-center gap-2">Vehicle <span className="num text-accent">{route.vehicle_code}</span><Status s={route.status} /></span>} subtitle={`${route.code} · ${route.kind} · solver ${route.solver}`}>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Metric label="Capacity" value={kg(route.capacity_kg)} />
                <Metric label="Current load" value={kg(route.status === "planned" ? 0 : route.current_load_kg || load)} sub={`peak ${kg(load)}`} />
              </div>
              <div className="mt-3"><div className="mb-1 flex justify-between text-[11px] text-ink-3"><span>Truck fill at hub</span><span className="num">{n((100 * load) / route.capacity_kg)}%</span></div><Meter value={load} max={route.capacity_kg} tone="cyan" /></div>

              <div className="mt-4 text-[11px] uppercase tracking-wider text-ink-3">Route</div>
              <ol className="mt-2 space-y-0">
                {route.stops.map((s: any, i: number) => (
                  <li key={s.id} className="relative flex gap-3 pb-2.5">
                    {i < route.stops.length - 1 && <span className={cx("absolute left-[9px] top-5 h-full w-px", s.status === "done" ? "bg-accent/60" : "bg-line-2")} />}
                    <span className={cx("relative grid size-[19px] shrink-0 place-items-center rounded-full border text-[10px] font-semibold", s.stop_type === "pickup" ? (s.status === "done" ? "border-accent bg-accent text-[#04140b]" : "border-ink-3 text-ink-2") : "border-warn text-warn")}>{s.stop_type === "pickup" ? String.fromCharCode(64 + i) : "H"}</span>
                    <div className="flex-1 text-sm"><div className="text-ink">{s.name}</div><div className="num text-[11px] text-ink-3">{s.stop_type === "pickup" ? `load ${kg(s.load_kg)}` : s.stop_type}{s.eta_min != null ? ` · ETA +${n(s.eta_min)} min` : ""}</div></div>
                  </li>
                ))}
              </ol>
              {route.status === "active" && <div className="mb-3"><div className="mb-1 flex justify-between text-[11px] text-ink-3"><span>Progress (live telemetry)</span><span className="num">{n(progress * 100)}%</span></div><Meter value={progress * 100} tone="green" /></div>}

              <div className="grid grid-cols-3 gap-3 border-t border-line pt-3">
                <Metric label="Distance" value={`${n(route.total_km, 1)} km`} sub={route.baseline_km ? `vs ${n(route.baseline_km, 1)} km solo` : ""} />
                <Metric label="Est. time" value={`${Math.floor(route.duration_min / 60)}h ${Math.round(route.duration_min % 60)}m`} />
                <Metric label="Fuel" value={fuel ? `${n(fuel, 1)} L` : "EV"} />
                <Metric label="CO₂" value={`${n(route.co2_kg, 1)} kg`} />
                <Metric label="Cost" value={inr(route.cost_inr)} />
                <Metric label="Optimization score" value={route.opt_score != null ? `${n(route.opt_score)}/100` : "—"} accent />
              </div>
              {route.explanation && (
                <div className="mt-4 rounded border border-cyan/20 bg-cyan/5 p-3 text-xs leading-relaxed text-ink-2"><Sparkles className="mb-1 size-3.5 text-cyan" />{route.explanation}</div>
              )}
              {fleet && route.status === "planned" && (
                <div className="mt-4 flex gap-2">
                  <Button variant="primary" loading={start.isPending} onClick={() => start.mutate(route.id)}><Play className="size-4" />Dispatch</Button>
                  <Button loading={recalc.isPending} onClick={() => recalc.mutate(route.id)}><RefreshCw className="size-4" />Recalculate Route</Button>
                </div>
              )}
            </Panel>
          )}
          <Panel title="All routes" bodyClass="max-h-72 overflow-y-auto p-2">
            {live.map((r) => (
              <button key={r.id} onClick={() => setSel(r.id)} className={cx("flex w-full items-center justify-between rounded px-2.5 py-2 text-left text-xs", r.id === route?.id ? "bg-raised" : "hover:bg-raised/50")}>
                <span><span className="num text-ink">{r.code}</span> <span className="text-ink-3">· {r.vehicle_code} · {r.kind} · {r.pickups} stops</span></span>
                <span className="flex items-center gap-2"><span className="num text-ink-2">{n(r.total_km, 1)} km</span><Status s={r.status} /></span>
              </button>
            ))}
          </Panel>
          <div className="flex flex-wrap gap-2 text-[11px] text-ink-3"><Badge>Distances: great-circle × 1.25 road factor</Badge><Badge>Amazon Location route matrix in AWS mode</Badge></div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, sub, accent }: { label: string; value: React.ReactNode; sub?: string; accent?: boolean }) {
  return <div><div className="text-[10px] uppercase tracking-wider text-ink-3">{label}</div><div className={cx("num text-sm font-semibold", accent ? "text-accent" : "text-ink")}>{value}</div>{sub && <div className="text-[10px] text-ink-3">{sub}</div>}</div>;
}
