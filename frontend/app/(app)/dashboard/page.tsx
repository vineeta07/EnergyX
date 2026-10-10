"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Package, Truck, Warehouse, Zap, Leaf, Route as RouteIcon } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { useLive } from "@/store/live";
import { Kpi, Loading, Panel, PageHeader, SimTag, Status, ErrorBox } from "@/components/ui";
import { FlowSankey, PredictedVsActual } from "@/components/charts";
import { NetworkMap } from "@/components/map/NetworkMap";
import { RoleQueue } from "./RoleQueue";
import { kg, kwh, n, time, pct } from "@/lib/format";
import { t } from "@/lib/i18n";

export default function Dashboard() {
  const user = useAuth((s) => s.user)!;
  const { data, isLoading, error } = useQuery({ queryKey: ["dashboard"], queryFn: () => api.get<any>("/dashboard"), refetchInterval: 20_000 });
  const live = useLive((s) => s.events);

  if (isLoading) return <Loading label="Loading the network" />;
  if (error) return <ErrorBox error={error} />;
  const k = data.kpis;
  const activity = [...live.filter((e) => !data.activity.some((a: any) => a.id === e.id)), ...data.activity].slice(0, 14);

  return (
    <div className="space-y-5">
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{t("Network overview")} <SimTag label={t("Real zones and plants, simulated daily weights")} /></span>}
        subtitle={t("Where waste is, where it is going, and how much energy came back. The whole loop on one screen.")}
      />
      <div data-tour="kpis" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label={t("Waste waiting")} value={n(k.waste_available_kg)} unit="kg" sub={t("{n} open pickup requests", { n: k.open_pickups })} icon={<Package className="size-4" />} href="/pickups" />
        <Kpi label={t("Collected, last 7 days")} value={n(k.waste_collected_kg_7d / 1000, 1)} unit="t" sub={t("Hub scale totals")} icon={<Truck className="size-4" />} href="/routes" />
        <Kpi label={t("At the hubs")} value={n(k.in_processing_kg)} unit="kg" sub={t("{n} loads being sorted", { n: k.in_processing_shipments })} icon={<Warehouse className="size-4" />} href="/hub" />
        <Kpi label={t("Energy, last 30 days")} value={n(k.energy_kwh_30d)} unit="kWh" sub={t("{n} kWh today", { n: n(k.energy_kwh_today) })} icon={<Zap className="size-4" />} href="/energy" accent />
        <Kpi label={t("CO₂ avoided, 30 days")} value={n(k.co2_avoided_kg_30d / 1000, 1)} unit="t" sub={t("Grid power plus landfill methane")} icon={<Leaf className="size-4" />} href="/analytics" />
        <Kpi label={t("Routes on the road")} value={k.active_routes} sub={t("{a} of {b} vehicles out", { a: k.active_vehicles, b: k.total_vehicles })} icon={<RouteIcon className="size-4" />} href="/routes" />
      </div>

      <RoleQueue role={user.role} />

      <div className="grid gap-5 xl:grid-cols-[1.25fr_1fr]">
        <Panel title={t("Where the waste went")} subtitle={t("Last 30 days: {a} sorted, {b} of useful energy", { a: kg(data.flow.total_kg), b: kwh(data.flow.total_kwh) })}>
          <FlowSankey data={data.flow} height={380} />
        </Panel>
        <div data-tour="map">
          <Panel title={t("Network map")} subtitle={t("Sources, trucks, hubs, plants and active routes. Trucks move as their GPS updates.")} bodyClass="p-0" actions={<Link href="/routes" className="text-xs text-ink-3 hover:text-ink">{t("Open routes")}</Link>}>
            <NetworkMap height={420} className="rounded-none border-0" />
          </Panel>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_1.1fr]">
        <Panel title={t("Plant decisions")} subtitle={t("Each one lists its inputs and reasons")} actions={<Link href="/ai-decisions" className="text-xs text-ink-3 hover:text-ink">{t("All decisions")}</Link>}>
          {data.decisions.length === 0 ? (
            <div className="py-6 text-center text-sm text-ink-3">{t("No plant has been chosen yet. Press Run a full load, or sort a shipment at the hub.")}</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {data.decisions.map((d: any) => <DecisionCard key={d.id} d={d} />)}
            </div>
          )}
        </Panel>
        <Panel title={t("Energy: predicted and metered")} subtitle={t("kWh per day. Accuracy {a}", { a: pct(k.prediction_accuracy, 1) })} actions={<Link href="/energy" className="text-xs text-ink-3 hover:text-ink">{t("Energy screen")}</Link>}>
          <PredictedVsActual data={data.timeseries.energy} height={250} />
          <p className="mt-1 text-xs text-ink-3">{t("Includes backtest predictions on held-out days from the model registry, and live predictions recorded since.")}</p>
        </Panel>
      </div>

      <Panel title={t("Recent activity")} subtitle={t("Events as they happen, over WebSocket")}>
        <ol className="grid gap-x-8 md:grid-cols-2">
          {activity.map((e: any, i: number) => (
            <li key={e.id ?? i} className="flex gap-3 border-b border-line/60 py-2 text-sm">
              <span className="num w-11 shrink-0 text-xs text-ink-3">{time(e.created_at)}</span>
              <span className="min-w-0 flex-1 text-ink-2">{e.message}</span>
              <span className="hidden shrink-0 text-xs text-ink-3 sm:block">{e.type}</span>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}

function DecisionCard({ d }: { d: any }) {
  const drivers = (d.feature_importance?.decision_drivers ?? []).filter((x: any) => x.direction === "+").slice(0, 4);
  return (
    <Link href={`/ai-decisions/${d.id}`} className="block rounded-lg border border-line bg-raised/60 p-3 transition-colors hover:border-line-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-ink">{t("{p} chosen", { p: d.facility_label })}</span>
        <Status s={d.status} />
      </div>
      <div className="mt-1 text-xs text-ink-3">{d.subject.split("→")[0]} · {d.shipment_code}</div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div><span className="text-ink-3">{t("Expected")}</span> <span className="num text-gold">{kwh(d.output?.expected_kwh)}</span></div>
        <div><span className="text-ink-3">{t("Confidence")}</span> <span className="num text-ink">{pct((d.confidence ?? 0) * 100)}</span></div>
      </div>
      <div className="mt-2 text-xs text-ink-3">{t("Main reasons")}</div>
      <ul className="mt-1 space-y-0.5 text-xs text-ink-2">{drivers.map((x: any) => <li key={x.key}>{x.feature} <span className="num text-ink-3">{Math.round(x.share * 100)}%</span></li>)}</ul>
      {d.outcome?.actual_kwh != null && <div className="mt-2 rounded bg-accent/10 px-2 py-1 text-xs text-accent">{t("Metered {a}, error {e}%", { a: kwh(d.outcome.actual_kwh), e: n(Math.abs(d.outcome.error_pct), 1) })}</div>}
    </Link>
  );
}
