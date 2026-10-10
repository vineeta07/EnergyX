"use client";
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { Badge, BarList, Button, Panel, Status, Td, Th, Select, ErrorBox } from "@/components/ui";
import { NetworkMap } from "@/components/map/NetworkMap";
import { cx, inr, kwh, n, pct, STREAM_LABEL, TECH_LABEL, NONE, token } from "@/lib/format";

import { t, tEnum } from "@/lib/i18n";
export function DecisionView({ d, outcome, compact }: { d: any; outcome?: { predicted_kwh?: number; actual_kwh?: number; error_pct?: number } | null; compact?: boolean }) {
  const role = useAuth((s) => s.user?.role);
  const qc = useQueryClient();
  const [override, setOverride] = useState<string>("");
  const [reason, setReason] = useState("");
  const approve = useMutation({
    mutationFn: () => api.post(`/ai-decisions/${d.id}/approve`, override ? { override_facility_id: Number(override), reason: reason || "Operator override" } : {}),
    onSuccess: () => qc.invalidateQueries(),
  });
  const ranking: any[] = d.ranking ?? [];
  const chosen = ranking.find((r) => r.facility_id === d.chosen_facility_id);
  const ex = d.explanation ?? {};
  const drivers: any[] = d.feature_importance?.decision_drivers ?? [];
  const modelFi: any[] = d.feature_importance?.model ?? [];
  const canAct = d.status === "proposed" && (role === "hub" || role === "admin");
  const hub = d.inputs?.origin;

  if (d.kind !== "facility_selection") {
    return (
      <Panel title={<span className="flex items-center gap-2">{d.code}<Status s={d.status} /></span>} subtitle={d.subject}>
        <p className="text-sm text-ink">{ex.headline}</p>
        <ul className="mt-2 space-y-1 text-sm text-ink-2">{(ex.bullets ?? []).map((b: string) => <li key={b}>· {b}</li>)}</ul>
        {canAct && <Button className="mt-3" variant="primary" size="sm" loading={approve.isPending} onClick={() => approve.mutate()}>{t("Approve this route")}</Button>}
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      {/* headline */}
      <div className="rounded-lg border border-line-2 bg-panel p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
          <span className="num">{d.code}</span><Status s={d.status} /><span>· {d.subject}</span><span>· {t("model {v}", { v: d.model_version })}</span>
        </div>
        <h2 className="mt-2 font-serif text-xl font-medium leading-snug text-ink">{ex.headline}</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={t("Recommended")} value={chosen?.label ?? NONE} sub={TECH_LABEL[chosen?.technology] ?? ""} />
          <Stat label={t("Expected energy")} value={kwh(chosen?.predicted_kwh)} gold sub={chosen?.interval ? t("90% range {a} to {b}", { a: n(chosen.interval[0]), b: n(chosen.interval[1]) }) : ""} />
          <Stat label={t("Prediction confidence")} value={pct((d.confidence ?? 0) * 100, 0)} sub={chosen?.decision_confidence != null ? t("Same winner in {n} of 1,000 test runs", { n: pct(chosen.decision_confidence * 100) }) : t("Chance the error stays within 10%")} />
          <Stat label={t("Score")} value={`${n(d.score)}/100`} sub={ex.net_energy_advantage_kwh != null ? t("+{a} kWh over {b}", { a: n(ex.net_energy_advantage_kwh), b: ex.runner_up }) : ""} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title={t("Inputs")} subtitle={t("What the model and optimizer saw")}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Def k="Waste" v={`${n(d.inputs.quantity_kg)} kg ${STREAM_LABEL[d.inputs.stream] ?? d.inputs.stream}`} />
            <Def k="Moisture" v={pct(d.inputs.moisture_pct)} />
            <Def k="Origin" v={hub} />
            <Def k="Distance" v={`${n(d.inputs.distance_km, 1)} km`} />
            <Def k="Plant efficiency" v={pct(d.inputs.facility_efficiency_pct)} />
            <Def k="Capacity used" v={pct(d.inputs.capacity_utilization_pct)} />
            <Def k="Past yield" v={d.inputs.historical_yield_kwh_per_kg ? `${n(d.inputs.historical_yield_kwh_per_kg, 2)} ${t("kWh/kg")}` : NONE} />
            <Def k="Transport cost" v={inr(d.inputs.transport_cost_inr)} />
            <Def k="Transport CO₂" v={`${n(d.inputs.carbon_kg, 1)} kg`} />
          </dl>
        </Panel>
        <Panel title={t("Why?")} subtitle={t("The reasons, written out from the ranking")}>
          <ul className="space-y-1.5 text-sm">
            {(ex.bullets ?? []).map((b: string) => <li key={b} className="flex gap-2 text-ink-2"><Check className="mt-0.5 size-3.5 shrink-0 text-accent" />{b}</li>)}
          </ul>
          {ex.vs_nearest && <p className="mt-3 border-t border-line pt-3 text-xs text-ink-2">{ex.vs_nearest}</p>}
        </Panel>
        <Panel title={t("Decision drivers")} subtitle={t("Share of the winning score contributed by each criterion")}>
          <BarList items={drivers.map((x) => ({ label: `${x.direction === "−" ? "− " : ""}${t(x.feature)}`, value: x.share }))} />
          {!compact && modelFi.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <div className="mb-2 text-xs text-ink-3">{t("What the energy model relies on most")}</div>
              <BarList color="var(--s-plastic)" items={modelFi.slice(0, 6).map((x) => ({ label: t(x.feature), value: x.importance }))} />
            </div>
          )}
        </Panel>
      </div>

      <Panel title={t("Every eligible plant, ranked")} subtitle={t("Score counts energy, efficiency, compatibility and spare capacity for a plant, and transport cost, carbon and distance against it. The weights are in Settings.")}
        bodyClass="p-0 overflow-x-auto">
        <table className="w-full min-w-[860px]">
          <thead><tr><Th>#</Th><Th>{t("Plant")}</Th><Th right>{t("Distance")}</Th><Th right>{t("Capacity used")}</Th><Th right>{t("Compatibility")}</Th><Th right>{t("Predicted")}</Th><Th right>{t("Transport")}</Th><Th right>CO₂</Th><Th>{t("Score")}</Th></tr></thead>
          <tbody>
            {ranking.map((r) => (
              <tr key={r.facility_id} className={cx(r.facility_id === d.chosen_facility_id && "bg-accent/10")}>
                <Td mono>{r.eligible ? r.rank : NONE}</Td>
                <Td><Link href={`/facilities/${r.facility_id}`} className="text-ink hover:text-accent">{r.label}</Link> <span className="text-xs text-ink-3">{r.name}</span>
                  {r.facility_id === d.chosen_facility_id && <Badge tone="green" className="ml-2">{t("Chosen")}</Badge>}
                  {!r.eligible && <div className="text-xs text-crit">{t("Excluded")}: {r.exclusion_reason}</div>}</Td>
                <Td right mono>{n(r.distance_km, 1)} km{r.drive_min != null && <div className="text-xs text-ink-3">{t("{n} min by road", { n: n(r.drive_min) })}</div>}</Td>
                <Td right mono>{pct(r.utilization_pct)}</Td>
                <Td right mono>{pct(r.compatibility_pct)}</Td>
                <Td right mono className="text-ink">{kwh(r.predicted_kwh)}</Td>
                <Td right mono>{inr(r.transport_cost_inr)}</Td>
                <Td right mono>{n(r.transport_co2_kg, 1)} kg</Td>
                <Td><div className="flex items-center gap-2"><div className="h-1.5 w-24 rounded-sm bg-line"><div className={cx("h-full rounded-sm", r.facility_id === d.chosen_facility_id ? "bg-accent" : "bg-ink-3")} style={{ width: `${r.score}%` }} /></div><span className="num text-sm text-ink">{n(r.score)}</span></div></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      {!compact && (
        <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <NetworkMap height={340} layers={{ sources: false, vehicles: false, routes: false, hubs: true, facilities: true }}
            extra={{ highlightFacilityIds: [d.chosen_facility_id], lines: ranking.filter((r) => r.eligible && r.lat).map((r) => ({ id: r.code, coords: [[d.origin_lng ?? r.lng, d.origin_lat ?? r.lat], [r.lng, r.lat]] as [number, number][], color: r.facility_id === d.chosen_facility_id ? token("accent") : token("ink-3"), dashed: r.facility_id !== d.chosen_facility_id, width: r.facility_id === d.chosen_facility_id ? 3.5 : 1.5 })).filter((l) => d.origin_lng) }} />
          <Panel title={t("Operator decision")} subtitle={t("An operator can approve this plant or pick another. Every override is logged, and the result still feeds training.")}>
            {outcome?.actual_kwh != null ? (
              <div className="grid grid-cols-3 gap-3 text-center">
                <Stat label={t("Predicted")} value={kwh(outcome.predicted_kwh)} />
                <Stat label={t("Metered")} value={kwh(outcome.actual_kwh)} gold />
                <Stat label={t("Error")} value={`${n(Math.abs(outcome.error_pct ?? 0), 1)}%`} sub={t("Saved as training data")} />
              </div>
            ) : canAct ? (
              <div className="space-y-3">
                <Select value={override} onChange={(e) => setOverride(e.target.value)}>
                  <option value="">{t("Approve {p}", { p: chosen?.label })}</option>
                  {ranking.filter((r) => r.eligible && r.facility_id !== d.chosen_facility_id).map((r) => <option key={r.facility_id} value={r.facility_id}>{t("Choose {p} instead ({k}, score {s})", { p: r.label, k: kwh(r.predicted_kwh), s: n(r.score) })}</option>)}
                </Select>
                {override && <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("Reason for choosing another plant (kept in the audit log)")} className="h-20 w-full rounded border border-line-2 bg-canvas p-2 text-sm outline-none focus:border-accent" />}
                <Button variant="primary" loading={approve.isPending} disabled={!!override && reason.length < 3} onClick={() => approve.mutate()}>
                  {override ? <>{t("Choose this plant instead")}</> : <>{t("Approve this plant")}</>}
                </Button>
                {approve.error && <ErrorBox error={approve.error} />}
              </div>
            ) : (
              <div className="text-sm text-ink-2">
                {d.status === "proposed" ? t("Waiting for the hub operator to approve.") : <>{t("Decision {s}.", { s: tEnum(d.status).toLowerCase() })}{d.override_reason ? <> <span className="text-ink">“{d.override_reason}”</span></> : ""} {t("Waiting for the plant to report its meter reading.")}</>}
              </div>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, gold }: { label: string; value: React.ReactNode; sub?: React.ReactNode; gold?: boolean }) {
  return <div><div className="text-xs text-ink-3">{label}</div><div className={cx("num mt-0.5 text-base font-medium", gold ? "text-gold" : "text-ink")}>{value}</div>{sub && <div className="text-xs text-ink-3">{sub}</div>}</div>;
}
function Def({ k, v }: { k: string; v: React.ReactNode }) {
  return <><dt className="text-ink-3">{t(k)}</dt><dd className="num text-right text-ink">{v}</dd></>;
}
