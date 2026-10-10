"use client";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { Button, ErrorBox, Loading, PageHeader, Panel, Status } from "@/components/ui";
import { NetworkMap } from "@/components/map/NetworkMap";
import { cx, dateTime, inr, kg, n, time, NONE, token } from "@/lib/format";

import { t, tEnum } from "@/lib/i18n";
const FLOW = ["REQUESTED", "ASSIGNED", "EN_ROUTE", "COLLECTED", "DELIVERED"];

export function PickupDetail({ id }: { id: string }) {
  const role = useAuth((s) => s.user?.role);
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["pickups", "detail", id], queryFn: () => api.get<any>(`/pickups/${id}`), refetchInterval: 5000 });
  const act = useMutation({ mutationFn: (fn: () => Promise<any>) => fn(), onSuccess: () => qc.invalidateQueries() });
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const { pickup: p, route, timeline } = data;
  const idx = FLOW.indexOf(p.status);
  const fleet = role === "fleet" || role === "admin";

  return (
    <div className="space-y-5">
      <PageHeader crumb={<Link href="/pickups">{t("Collection")}</Link>} title={<span className="flex items-center gap-3"><span className="num">{p.code}</span><Status s={p.status} /></span>} subtitle={t("{s} · {q} of {w} · urgency {u}", { s: p.source_name, q: kg(p.quantity_kg), w: tEnum(p.waste_type).toLowerCase(), u: tEnum(p.urgency).toLowerCase() })}
        actions={fleet && <>
          {p.status === "REQUESTED" && <Button variant="primary" loading={act.isPending} onClick={() => act.mutate(() => api.post(`/pickups/${p.id}/assign`))}>{t("Assign a truck")}</Button>}
          {p.status === "ASSIGNED" && route && <Button variant="primary" loading={act.isPending} onClick={() => act.mutate(() => api.post(`/routes/${route.id}/start`))}>{t("Dispatch vehicle")}</Button>}
          {(p.status === "EN_ROUTE") && <Button loading={act.isPending} onClick={() => act.mutate(() => api.post(`/pickups/${p.id}/status`, { status: "COLLECTED" }))}>{t("Mark collected")}</Button>}
          {(p.status === "EN_ROUTE" || p.status === "COLLECTED") && <Button variant="primary" loading={act.isPending} onClick={() => act.mutate(() => api.post(`/pickups/${p.id}/complete`))}>{t("Deliver to hub")}</Button>}
        </>} />
      {act.error && <ErrorBox error={act.error} />}

      <div className="flex items-center overflow-x-auto rounded-md border border-line bg-panel px-4 py-4">
        {FLOW.map((s, i) => (
          <div key={s} className="flex flex-1 items-center">
            <div className="flex min-w-[96px] flex-col items-center gap-1.5">
              <div className={cx("grid size-7 place-items-center rounded-full border text-xs", i < idx ? "border-accent bg-accent text-on-accent" : i === idx ? "border-accent text-accent" : "border-line-2 text-ink-3")}>{i < idx ? <Check className="size-3.5" /> : i + 1}</div>
              <span className={cx("text-xs", i <= idx ? "text-ink" : "text-ink-3")}>{tEnum(s)}</span>
            </div>
            {i < FLOW.length - 1 && <div className={cx("h-px flex-1", i < idx ? "bg-accent" : "bg-line-2")} />}
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <NetworkMap height={420} extra={{ highlightRouteId: route?.id, lines: route ? [{ id: "r", coords: route.stops.map((s: any) => [s.lng, s.lat]), color: token("accent"), width: 3 }] : [{ id: "p", coords: [[p.lng, p.lat], [p.lng + 0.001, p.lat]], color: token("accent") }] }} />
        <div className="space-y-5">
          <Panel title={t("Pickup request")}>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-ink-3">{t("Location")}</dt><dd className="text-right">{p.address}</dd>
              <dt className="text-ink-3">{t("Pickup window")}</dt><dd className="text-right">{dateTime(p.window_start)} – {time(p.window_end)}</dd>
              <dt className="text-ink-3">{t("Vehicle")}</dt><dd className="text-right">{p.vehicle_code ?? NONE}</dd>
              <dt className="text-ink-3">{t("Estimated cost")}</dt><dd className="num text-right">{inr(p.estimated_cost)}</dd>
              <dt className="text-ink-3">{t("Estimated CO₂")}</dt><dd className="num text-right">{n(p.estimated_co2, 1)} kg</dd>
              {p.shipment_code && <><dt className="text-ink-3">{t("Hub shipment")}</dt><dd className="text-right"><Link className="num text-accent" href={`/hub/classification/${p.shipment_id}`}>{p.shipment_code}</Link></dd></>}
            </dl>
          </Panel>
          {route && (
            <Panel title={t("Route {c}", { c: route.code })} subtitle={route.explanation}>
              <ol className="space-y-1.5 text-sm">{route.stops.map((s: any) => <li key={s.id} className="flex justify-between"><span className={cx(s.ref_id === p.id && s.stop_type === "pickup" ? "text-accent" : "text-ink-2")}>{s.seq}. {s.name}</span><span className="num text-ink-3">{s.eta_min != null ? t("+{n} min", { n: n(s.eta_min) }) : ""}</span></li>)}</ol>
            </Panel>
          )}
          <Panel title={t("Event timeline")}>
            <ol className="space-y-1.5 text-xs">{timeline.map((e: any) => <li key={e.id} className="flex gap-2"><span className="num text-ink-3">{time(e.created_at)}</span><span className="text-ink-2">{e.message}</span></li>)}</ol>
          </Panel>
        </div>
      </div>
    </div>
  );
}
