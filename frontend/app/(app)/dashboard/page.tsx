"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Package, Truck, Warehouse, Zap, Leaf, Route as RouteIcon, BrainCircuit, ArrowRight, Activity } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { useLive } from "@/store/live";
import { Badge, Kpi, Loading, Panel, PageHeader, SimTag, Status, ErrorBox } from "@/components/ui";
import { FlowSankey, PredictedVsActual } from "@/components/charts";
import { NetworkMap } from "@/components/map/NetworkMap";
import { RoleQueue } from "./RoleQueue";
import { kg, kwh, n, time, pct, cx } from "@/lib/format";

export default function Dashboard() {
  const user = useAuth((s) => s.user)!;
  const { data, isLoading, error } = useQuery({ queryKey: ["dashboard"], queryFn: () => api.get<any>("/dashboard"), refetchInterval: 20_000 });
  const live = useLive((s) => s.events);

  if (isLoading) return <Loading label="Loading network" />;
  if (error) return <ErrorBox error={error} />;
  const k = data.kpis;
  const activity = [...live.filter((e) => !data.activity.some((a: any) => a.id === e.id)), ...data.activity].slice(0, 14);

  return (
    <div className="space-y-5">
      <PageHeader
        title={<span className="flex items-center gap-3">Network Overview <SimTag label="DEMO NETWORK" /></span>}
        subtitle="Discover → Collect → Characterize → Optimize → Route → Convert → Measure → Learn. Live state of the whole loop."
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Waste available" value={n(k.waste_available_kg)} unit="kg" sub={`${k.open_pickups} open pickup requests`} icon={<Package className="size-4" />} href="/pickups" />
        <Kpi label="Collected (7d)" value={n(k.waste_collected_kg_7d / 1000, 1)} unit="t" sub="weighbridge totals" icon={<Truck className="size-4" />} href="/routes" />
        <Kpi label="In processing" value={n(k.in_processing_kg)} unit="kg" sub={`${k.in_processing_shipments} shipments at hubs`} icon={<Warehouse className="size-4" />} href="/hub" />
        <Kpi label="Energy (30d)" value={n(k.energy_kwh_30d)} unit="kWh" sub={`${n(k.energy_kwh_today)} kWh today`} icon={<Zap className="size-4" />} href="/energy" accent />
        <Kpi label="CO₂ avoided (30d)" value={n(k.co2_avoided_kg_30d / 1000, 1)} unit="t" sub="grid + landfill methane" icon={<Leaf className="size-4" />} href="/analytics" />
        <Kpi label="Active routes" value={k.active_routes} sub={`${k.active_vehicles}/${k.total_vehicles} vehicles deployed`} icon={<RouteIcon className="size-4" />} href="/routes" />
      </div>

      <RoleQueue role={user.role} />

      <div className="grid gap-5 xl:grid-cols-[1.25fr_1fr]">
        <Panel title="Live waste-to-energy flow" subtitle={`Last 30 days · ${kg(data.flow.total_kg)} characterised → ${kwh(data.flow.total_kwh)} useful energy`} actions={<Badge tone="cyan">source → stream → pathway → outcome</Badge>}>
          <FlowSankey data={data.flow} height={380} />
        </Panel>
        <Panel title="Live network map" subtitle="Sources, trucks, hubs, facilities and active routes — trucks move in real time" bodyClass="p-0" actions={<Link href="/routes" className="text-xs text-ink-3 hover:text-ink">Routes →</Link>}>
          <NetworkMap height={420} className="rounded-none border-0" />
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_1.1fr]">
        <Panel title="AI decisions" subtitle="Every decision is explainable and traceable" actions={<Link href="/ai-decisions" className="text-xs text-ink-3 hover:text-ink">Decision center →</Link>}>
          {data.decisions.length === 0 ? (
            <div className="py-6 text-center text-sm text-ink-3">No facility decisions yet — press <span className="text-accent">Run Full Optimization</span> or analyze a shipment at the hub.</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {data.decisions.map((d: any) => <DecisionCard key={d.id} d={d} />)}
            </div>
          )}
        </Panel>
        <Panel title="Energy performance" subtitle={`Predicted vs actual (kWh/day) · accuracy ${pct(k.prediction_accuracy, 1)}`} actions={<Link href="/energy" className="text-xs text-ink-3 hover:text-ink">Energy →</Link>}>
          <PredictedVsActual data={data.timeseries.energy} height={250} />
          <p className="mt-1 text-[11px] text-ink-3">Includes time-based holdout backtest predictions from the model registry and live predictions recorded since.</p>
        </Panel>
      </div>

      <Panel title={<span className="flex items-center gap-2"><Activity className="size-4 text-accent" />Recent activity</span>} subtitle="Domain events streamed over WebSocket (EventBridge in AWS)">
        <ol className="grid gap-x-8 md:grid-cols-2">
          {activity.map((e: any, i: number) => (
            <li key={e.id ?? i} className="flex gap-3 border-b border-line/60 py-2 text-sm">
              <span className="num w-11 shrink-0 text-xs text-ink-3">{time(e.created_at)}</span>
              <span className="min-w-0 flex-1 text-ink-2">{e.message}</span>
              <span className="hidden shrink-0 text-[10px] text-ink-3 sm:block">{e.type}</span>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}

function DecisionCard({ d }: { d: any }) {
  const ex = d.explanation ?? {};
  const drivers = (d.feature_importance?.decision_drivers ?? []).filter((x: any) => x.direction === "+").slice(0, 4);
  return (
    <Link href={`/ai-decisions/${d.id}`} className="group block rounded-md border border-line bg-raised/50 p-3 hover:border-accent/40">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-ink"><BrainCircuit className="size-4 text-accent" />{d.facility_label} selected</span>
        <Status s={d.status} />
      </div>
      <div className="mt-1 text-xs text-ink-3">{d.subject.split("→")[0]} · {d.shipment_code}</div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div><span className="text-ink-3">Expected</span> <span className="num text-ink">{kwh(d.output?.expected_kwh)}</span></div>
        <div><span className="text-ink-3">Confidence</span> <span className="num text-ink">{pct((d.confidence ?? 0) * 100)}</span></div>
      </div>
      <div className="mt-2 text-[11px] font-medium uppercase tracking-wider text-ink-3">Why?</div>
      <ul className="mt-1 space-y-0.5 text-xs text-ink-2">{drivers.map((x: any) => <li key={x.key}>· {x.feature} <span className="num text-ink-3">{Math.round(x.share * 100)}%</span></li>)}</ul>
      {d.outcome?.actual_kwh != null && <div className={cx("mt-2 rounded px-2 py-1 text-[11px]", "bg-accent/10 text-accent")}>Actual {kwh(d.outcome.actual_kwh)} · error {n(Math.abs(d.outcome.error_pct), 1)}%</div>}
      <div className="mt-2 flex items-center gap-1 text-[11px] text-ink-3 group-hover:text-accent">Inspect decision <ArrowRight className="size-3" /></div>
    </Link>
  );
}
