"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis, Bar, BarChart, Cell, ReferenceLine } from "recharts";
import { BatteryCharging, FlaskConical, Zap, Recycle, Brain, Info, Check, Cpu } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { Badge, Button, Empty, ErrorBox, Field, Input, Kpi, Loading, PageHeader, Panel, Select, SimTag, Status, Td, Th } from "@/components/ui";
import { APP_LABEL, CHEM_LABEL, GRADE_COLOR, cx, inr, kg, n } from "@/lib/format";

const tip = { background: "var(--raised)", border: "1px solid var(--line-2)", borderRadius: 6, fontSize: 12 };

export default function Batteries() {
  const role = useAuth((s) => s.user?.role);
  const canAct = role === "hub" || role === "admin";
  const sum = useQuery({ queryKey: ["circular-summary"], queryFn: () => api.get<any>("/circular/summary"), refetchInterval: 15_000 });
  const lots = useQuery({ queryKey: ["battery-lots"], queryFn: () => api.get<any[]>("/batteries/lots") });
  const packs = useQuery({ queryKey: ["battery-packs"], queryFn: () => api.get<any[]>("/batteries/packs") });
  const [lotId, setLotId] = useState<number | null>(null);
  const [packId, setPackId] = useState<number | null>(null);
  const b = sum.data?.batteries;

  return (
    <div className="space-y-5">
      <PageHeader title="Battery second life" subtitle="Discarded batteries (laptop cells, EV modules, e-rickshaw batteries) are tested one by one, graded by the AI, and the healthy ones are combined into new packs that store electricity from rooftop solar or the grid and deliver it when needed. Unsafe or worn-out units go to an authorised recycler for material recovery." />
      <div className="flex gap-2 rounded-md border border-line bg-panel p-3 text-xs text-ink-2">
        <Info className="mt-0.5 size-3.5 shrink-0 text-cyan" />
        <span>Combined old batteries <b>store</b> electricity; they don't generate it. The energy comes from whatever charges them (here: hub rooftop solar or off-peak grid). The gain is a usable storage pack built from waste, which avoids manufacturing a new one, and recovers metals from the rest. Battery Waste Management Rules 2022 allow this through registered refurbishers under EPR.</span>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Units tested" value={n(b?.tested)} sub={<span>A <b className="text-accent">{b?.grade_a ?? 0}</b> · B <b className="text-warn">{b?.grade_b ?? 0}</b> · R <b className="text-crit">{b?.grade_r ?? 0}</b></span>} icon={<FlaskConical className="size-4" />} />
        <Kpi label="Second-life storage" value={n(b?.deployed_kwh, 2)} unit="kWh" sub={`${b?.deployed ?? 0} of ${b?.packs ?? 0} packs deployed`} icon={<BatteryCharging className="size-4" />} accent />
        <Kpi label="Electricity delivered" value={n(b?.delivered_kwh, 1)} unit="kWh" sub="metered by pack BMS" icon={<Zap className="size-4" />} />
        <Kpi label="New-battery CO2e avoided" value={n(b?.co2_mfg_avoided_kg)} unit="kg" sub="manufacturing of an equivalent pack" icon={<Cpu className="size-4" />} />
        <Kpi label="Sent to recycling" value={n(b?.recycled_kg)} unit="kg" sub={`${b?.recycled_units ?? 0} units → material recovery`} icon={<Recycle className="size-4" />} />
      </div>
      <Flow />

      <div className="space-y-5">
        <Panel title="Battery lots (intake)" bodyClass="p-0" actions={canAct && <NewLot />}>
          {lots.isLoading ? <Loading /> : !lots.data?.length ? <div className="p-4"><Empty>No lots.</Empty></div> : (
            <table className="w-full"><thead><tr><Th>Lot</Th><Th>Source</Th><Th right>Units</Th><Th>Grades</Th><Th>Status</Th></tr></thead>
              <tbody>{lots.data.map((l) => (
                <tr key={l.id} onClick={() => setLotId(l.id)} className={cx("cursor-pointer hover:bg-raised/50", lotId === l.id && "bg-raised")}>
                  <Td className="num text-ink">{l.code}{l.is_simulated && <div><SimTag label="DEMO" /></div>}</Td>
                  <Td><div className="text-ink">{l.source_label}</div><div className="text-[11px] text-ink-3">{CHEM_LABEL[l.chemistry]} {l.unit_type} · {l.nominal_v} V {l.nominal_ah} Ah</div></Td>
                  <Td right mono>{l.unit_count}</Td>
                  <Td className="num text-xs">{l.grades?.untested ? <span className="text-ink-3">{l.grades.untested} untested</span> : <><span className="text-accent">A {l.grades?.A ?? 0}</span> · <span className="text-warn">B {l.grades?.B ?? 0}</span> · <span className="text-crit">R {l.grades?.R ?? 0}</span></>}</Td>
                  <Td><Status s={l.status} /></Td>
                </tr>
              ))}</tbody></table>
          )}
        </Panel>
        {lotId ? <LotDetail id={lotId} canAct={canAct} onPack={setPackId} /> : <p className="text-center text-xs text-ink-3">Select a lot to test, grade and build packs from it.</p>}
      </div>

      <Panel title="Second-life packs" bodyClass="p-0">
        {!packs.data?.length ? <div className="p-4"><Empty>No packs yet — test a lot, then design a pack from its graded units.</Empty></div> : (
          <table className="w-full"><thead><tr><Th>Pack</Th><Th>Application</Th><Th>Config</Th><Th right>Usable</Th><Th right>Imbalance</Th><Th right>SoH</Th><Th right>Delivered</Th><Th>Site</Th><Th>Status</Th></tr></thead>
            <tbody>{packs.data.map((p) => (
              <tr key={p.id} onClick={() => setPackId(p.id)} className={cx("cursor-pointer hover:bg-raised/50", packId === p.id && "bg-raised")}>
                <Td className="num text-ink">{p.code}</Td><Td>{APP_LABEL[p.application]}</Td><Td className="num">{p.config} {CHEM_LABEL[p.chemistry]}</Td>
                <Td right mono>{n(p.usable_kwh, 2)} kWh</Td><Td right mono>{n(p.imbalance_pct, 2)}%</Td><Td right mono>{n((p.soh_now ?? p.pack_soh) * 100, 1)}%</Td>
                <Td right mono>{n(p.delivered_kwh, 1)} kWh</Td><Td className="max-w-[160px] truncate">{p.site_name ?? "—"}</Td><Td><Status s={p.status} /></Td>
              </tr>
            ))}</tbody></table>
        )}
      </Panel>
      {packId && <PackDetail id={packId} canAct={canAct} />}
    </div>
  );
}

function Flow() {
  const steps = [["Intake", "lot + serials"], ["Test", "capacity, IR, voltage, swelling"], ["AI grade", "A / B / R + remaining cycles"], ["AI pack design", "S×P, CP-SAT balanced groups"], ["Assemble", "BMS, fuses"], ["Deploy", "solar storage, lights, backup"], ["Telemetry", "kWh delivered, SoH"], ["Learn", "observed fade → new prior"]];
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      {steps.map(([a, b], i) => <span key={a} className="flex items-center gap-1.5"><span className="rounded border border-line bg-panel px-2 py-1"><b className="text-ink">{a}</b> <span className="text-ink-3">{b}</span></span>{i < steps.length - 1 && <span className="text-ink-3">→</span>}</span>)}
      <span className="ml-2 rounded border border-crit/30 bg-crit/5 px-2 py-1 text-crit">grade R → authorised recycler (black mass / lead)</span>
    </div>
  );
}

function NewLot() {
  const qc = useQueryClient();
  const ref = useQuery({ queryKey: ["battery-ref"], queryFn: () => api.get<any>("/batteries/reference") });
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState("laptop_cells");
  const [count, setCount] = useState(120);
  const m = useMutation({
    mutationFn: () => { const p = ref.data.presets[preset]; return api.post("/batteries/lots", { source_label: p.source_label, chemistry: p.chemistry, unit_type: p.unit_type, nominal_v: p.nominal_v, nominal_ah: p.nominal_ah, unit_kg: p.unit_kg, unit_count: count }); },
    onSuccess: () => { setOpen(false); qc.invalidateQueries(); },
  });
  if (!open) return <Button size="sm" onClick={() => setOpen(true)}>Receive lot</Button>;
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Select className="w-56" value={preset} onChange={(e) => setPreset(e.target.value)}>
        <option value="laptop_cells">18650 laptop / power-bank cells (NMC)</option><option value="ev_modules">EV / e-scooter LFP modules</option><option value="erickshaw_lead">E-rickshaw lead-acid 12 V</option>
      </Select>
      <Input type="number" className="w-20" value={count} onChange={(e) => setCount(Number(e.target.value))} />
      <Button size="sm" variant="primary" disabled={!ref.data} loading={m.isPending} onClick={() => m.mutate()}>Receive</Button>
      {m.error && <ErrorBox error={m.error} />}
    </div>
  );
}

function LotDetail({ id, canAct, onPack }: { id: number; canAct: boolean; onPack: (id: number) => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["battery-lot", id], queryFn: () => api.get<any>(`/batteries/lots/${id}`) });
  const [csv, setCsv] = useState("");
  const [app, setApp] = useState("solar_storage_48v");
  const [target, setTarget] = useState<number | "">("");
  const inv = () => qc.invalidateQueries();
  const test = useMutation({ mutationFn: (body: any) => api.post(`/batteries/lots/${id}/test`, body), onSuccess: inv });
  const design = useMutation({ mutationFn: () => api.post<any>("/batteries/packs/design", { lot_ids: [id], application: app, target_kwh: target === "" ? undefined : target }), onSuccess: (p) => { inv(); onPack(p.id); } });
  const recycle = useMutation({ mutationFn: () => api.post(`/batteries/lots/${id}/recycle`), onSuccess: inv });
  if (isLoading || !data) return <Panel title="Lot"><Loading /></Panel>;
  const { lot, units, recycling } = data;
  const graded = units.filter((u: any) => u.grade);
  const untested = units.filter((u: any) => u.status === "untested").length;
  const free = graded.filter((u: any) => u.status === "graded" && u.grade !== "R").length;
  const rejectsWaiting = graded.filter((u: any) => u.status === "graded" && u.grade === "R").length;
  const reasons = Object.entries(graded.filter((u: any) => u.grade === "R").reduce((a: any, u: any) => { const k = u.reason.startsWith("SoH") ? "low capacity" : u.reason.split(/[:(]/)[0].trim(); a[k] = (a[k] ?? 0) + 1; return a; }, {})).sort((a: any, b: any) => b[1] - a[1]);
  const parseCsv = () => csv.trim().split(/\r?\n/).filter((l) => l && !/serial/i.test(l)).map((l) => { const [serial, ah, ir, v, sw] = l.split(",").map((x) => x.trim()); return { serial, measured_ah: Number(ah), ir_mohm: Number(ir), voltage: v ? Number(v) : undefined, swelling: /^(1|y|yes|true)$/i.test(sw ?? "") }; });

  return (
    <Panel title={<span className="flex items-center gap-2"><span className="num">{lot.code}</span><Status s={lot.status} />{lot.is_simulated && <SimTag label="DEMO" />}</span>}
      subtitle={`${lot.source_label} · ${lot.unit_count} × ${CHEM_LABEL[lot.chemistry]} ${lot.unit_type} ${lot.nominal_v} V / ${lot.nominal_ah} Ah · ${kg(lot.unit_count * lot.unit_kg)}`}>
      {untested > 0 && canAct && (
        <div className="space-y-2 rounded-md border border-line p-3">
          <div className="text-sm font-medium">1 · Test {untested} units</div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" loading={test.isPending} onClick={() => test.mutate({ simulate: true })}><FlaskConical className="size-4" />Run tester (simulated readings)</Button>
          </div>
          <details className="text-xs text-ink-3"><summary className="cursor-pointer">…or paste real tester CSV: serial, measured_ah, ir_mohm, voltage, swelling</summary>
            <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={4} placeholder={`${units[0]?.serial},2.31,38.5,3.71,no`} className="num mt-2 w-full rounded border border-line-2 bg-canvas p-2 text-xs" />
            <Button size="sm" className="mt-1" disabled={!csv.trim()} loading={test.isPending} onClick={() => test.mutate({ readings: parseCsv() })}>Grade pasted readings</Button>
          </details>
          {test.error && <ErrorBox error={test.error} />}
        </div>
      )}
      {graded.length > 0 && (
        <>
          <div className="mt-1 grid gap-4 md:grid-cols-[1.4fr_1fr]">
            <div>
              <div className="mb-1 text-[11px] uppercase tracking-wider text-ink-3">AI grading · state of health vs internal resistance</div>
              <div className="h-[220px]">
                <ResponsiveContainer><ScatterChart margin={{ top: 8, right: 8, bottom: 4, left: -18 }}>
                  <CartesianGrid stroke="var(--line)" /><XAxis type="number" dataKey="soh" name="SoH" unit="%" domain={[0, 105]} tick={{ fontSize: 10, fill: "var(--ink-3)" }} />
                  <YAxis type="number" dataKey="ir" name="IR" unit="×" tick={{ fontSize: 10, fill: "var(--ink-3)" }} /><ZAxis range={[18, 18]} />
                  <ReferenceLine x={80} stroke="var(--accent)" strokeDasharray="3 3" /><ReferenceLine x={65} stroke="var(--warn)" strokeDasharray="3 3" />
                  <Tooltip contentStyle={tip} cursor={false} />
                  {["A", "B", "R"].map((g) => <Scatter key={g} name={`Grade ${g}`} data={graded.filter((u: any) => u.grade === g).map((u: any) => ({ soh: Math.round(u.soh * 1000) / 10, ir: u.ir_ratio }))} fill={GRADE_COLOR[g]} />)}
                </ScatterChart></ResponsiveContainer>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              {["A", "B", "R"].map((g) => { const c = graded.filter((u: any) => u.grade === g).length; return (
                <div key={g} className="flex items-center justify-between"><span className="flex items-center gap-2"><span className="size-2.5 rounded-sm" style={{ background: GRADE_COLOR[g] }} />Grade {g}<span className="text-[11px] text-ink-3">{g === "A" ? "SoH ≥ 80%" : g === "B" ? "SoH 65–80%" : "recycle"}</span></span><span className="num">{c}</span></div>); })}
              <div className="border-t border-line pt-2 text-[11px] text-ink-3">Median remaining life of A/B units: <b className="num text-ink">{n(median(graded.filter((u: any) => u.grade !== "R").map((u: any) => u.remaining_cycles)))}</b> cycles (to 60% SoH)</div>
              {reasons.length > 0 && <div className="text-[11px] text-ink-3">Rejected for: {reasons.map(([k, v]: any) => `${k} (${v})`).join(", ")}</div>}
            </div>
          </div>

          {canAct && free > 0 && (
            <div className="mt-4 space-y-2 rounded-md border border-accent/30 bg-accent/5 p-3">
              <div className="text-sm font-medium">2 · Design a second-life pack from {free} available A/B units</div>
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Application"><Select className="w-60" value={app} onChange={(e) => setApp(e.target.value)}>{Object.entries(APP_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
                <Field label="Target usable kWh (optional)"><Input type="number" className="w-28" value={target} placeholder="max" onChange={(e) => setTarget(e.target.value === "" ? "" : Number(e.target.value))} /></Field>
                <Button variant="primary" loading={design.isPending} onClick={() => design.mutate()}><Brain className="size-4" />Design pack with AI</Button>
              </div>
              <p className="text-[11px] text-ink-3">Series count comes from the target voltage; the AI picks the best-matched units and splits them into parallel groups with OR-Tools CP-SAT so every group has the same capacity (a series string is only as strong as its weakest group).</p>
              {design.error && <ErrorBox error={design.error} />}
            </div>
          )}
          {canAct && rejectsWaiting > 0 && (
            <div className="mt-3 flex items-center justify-between rounded-md border border-crit/30 bg-crit/5 p-3 text-sm">
              <span>{rejectsWaiting} grade-R units ({kg(rejectsWaiting * lot.unit_kg)}) waiting for recycling</span>
              <Button size="sm" variant="danger" loading={recycle.isPending} onClick={() => recycle.mutate()}><Recycle className="size-4" />Send to authorised recycler</Button>
            </div>
          )}
          {recycling.map((r: any) => (
            <div key={r.id} className="mt-3 rounded-md border border-line p-3 text-xs">
              <div className="flex justify-between"><span><b className="num">{r.code}</b> · {r.units} units, {kg(r.kg)} → {r.partner_name}</span><Badge>expected recovery</Badge></div>
              <div className="mt-1.5 flex flex-wrap gap-3 text-ink-2">{r.recovered.map((m: any) => <span key={m.material}>{m.material}: <b className="num">{kg(m.kg)}</b></span>)}</div>
            </div>
          ))}
        </>
      )}
    </Panel>
  );
}

function PackDetail({ id, canAct }: { id: number; canAct: boolean }) {
  const qc = useQueryClient();
  const hubs = useQuery({ queryKey: ["hubs"], queryFn: () => api.get<any[]>("/hubs") });
  const { data } = useQuery({ queryKey: ["battery-pack", id], queryFn: () => api.get<any>(`/batteries/packs/${id}`) });
  const [site, setSite] = useState(0);
  const act = useMutation({ mutationFn: ({ path, body }: { path: string; body?: any }) => api.post<any>(`/batteries/packs/${id}/${path}`, body ?? {}), onSuccess: () => qc.invalidateQueries() });
  if (!data) return <Panel title="Pack"><Loading /></Panel>;
  const { pack: p, telemetry } = data;
  const d = p.design;
  const groups = d.groups.map((g: any) => ({ name: `G${g.group}`, ah: g.ah }));
  const minAh = Math.min(...groups.map((g: any) => g.ah));
  const hub = (hubs.data ?? [])[site];
  const life = [{ cycles: 0, soh: p.pack_soh * 100, pred: p.pack_soh * 100 }, ...telemetry.map((t: any) => ({ cycles: t.cycles_cum, soh: t.soh * 100, pred: (p.pack_soh - p.fade_pred * t.cycles_cum) * 100 }))];
  return (
    <Panel title={<span className="flex items-center gap-2"><span className="num">{p.code}</span><Status s={p.status} /><span className="text-sm font-normal text-ink-2">{d.config} · {d.chemistry_label} · {d.application_label}</span></span>}
      subtitle={d.application_note}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <M l="Nominal" v={`${d.nominal_v} V · ${d.capacity_ah} Ah`} />
        <M l="Usable energy" v={`${n(d.usable_kwh, 2)} kWh`} s={`${Math.round(d.dod * 100)}% depth of discharge`} />
        <M l="Group imbalance" v={`${d.imbalance_pct}%`} s={`unmatched assembly: ${d.baseline_random.imbalance_pct}%`} accent />
        <M l="Predicted life" v={`${n(d.predicted_cycles)} cycles`} s={`≈ ${d.predicted_years} years · ${d.lifetime_mwh} MWh delivered`} />
        <M l="CO2e avoided" v={`${n(d.co2_avoided_kg.total)} kg`} s={`${n(d.co2_avoided_kg.manufacturing)} mfg + ${n(d.co2_avoided_kg.operation)} operation`} />
        <M l="Cost vs new pack" v={inr(d.economics_inr.second_life)} s={`new ≈ ${inr(d.economics_inr.new_pack)} · saves ${inr(d.economics_inr.saving)}`} />
      </div>
      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-wider text-ink-3">Capacity of each series group ({d.parallel} units in parallel) · {d.solver}</div>
          <div className="h-[200px]"><ResponsiveContainer><BarChart data={groups} margin={{ top: 6, right: 6, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="var(--line)" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--ink-3)" }} />
            <YAxis domain={[Math.floor(minAh * 0.97), "auto"]} tick={{ fontSize: 10, fill: "var(--ink-3)" }} unit=" Ah" /><Tooltip contentStyle={tip} />
            <Bar dataKey="ah" name="Group Ah">{groups.map((g: any) => <Cell key={g.name} fill={g.ah === minAh ? "var(--warn)" : "var(--accent)"} />)}</Bar>
          </BarChart></ResponsiveContainer></div>
          <p className="text-[11px] text-ink-3">Pack capacity = weakest group ({minAh} Ah). Matching gains <b className="text-accent">{d.gain_vs_random.usable_kwh} kWh ({d.gain_vs_random.pct}%)</b> over assembling the same units without testing; {d.stranded_ah} Ah stranded across groups.</p>
        </div>
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-wider text-ink-3">State of health: predicted vs measured {telemetry.length > 0 && <SimTag label="SIMULATED BMS" />}</div>
          {telemetry.length ? (
            <div className="h-[200px]"><ResponsiveContainer><ComposedChart data={life} margin={{ top: 6, right: 6, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="var(--line)" /><XAxis dataKey="cycles" type="number" tick={{ fontSize: 10, fill: "var(--ink-3)" }} unit=" cyc" />
              <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10, fill: "var(--ink-3)" }} unit="%" /><Tooltip contentStyle={tip} formatter={(v: any) => `${Number(v).toFixed(2)}%`} />
              <Line dataKey="pred" name="Predicted" stroke="var(--ink-3)" strokeDasharray="4 3" dot={false} isAnimationActive={false} />
              <Line dataKey="soh" name="Measured" stroke="var(--cyan)" dot={false} isAnimationActive={false} />
            </ComposedChart></ResponsiveContainer></div>
          ) : <div className="grid h-[200px] place-items-center rounded border border-dashed border-line text-xs text-ink-3">Telemetry starts once the pack is deployed.</div>}
          {p.fade_observed && <p className="text-[11px] text-cyan">Observed fade {Number(p.fade_observed).toExponential(2)}/cycle vs predicted {Number(p.fade_pred).toExponential(2)} ({n((100 * (p.fade_observed - p.fade_pred)) / p.fade_pred, 1)}%). Fed back into the {CHEM_LABEL[p.chemistry]} fade prior used for future grading.</p>}
          {p.status === "deployed" && <p className="text-[11px] text-ink-3">{n(p.delivered_kwh, 1)} kWh delivered at {p.site_name} over {n(p.cycles, 0)} cycles.</p>}
        </div>
      </div>
      <div className="mt-4 grid gap-4 border-t border-line pt-4 lg:grid-cols-2">
        <div><div className="mb-1 text-[11px] uppercase tracking-wider text-ink-3">Assembly instructions</div><ul className="space-y-0.5 text-xs text-ink-2">{d.assembly.map((a: string) => <li key={a}>– {a}</li>)}</ul></div>
        {canAct && (
          <div className="flex flex-wrap items-end gap-2">
            {p.status === "designed" && <Button variant="primary" loading={act.isPending} onClick={() => act.mutate({ path: "assemble" })}><Check className="size-4" />Mark assembled ({d.units_used} units)</Button>}
            {p.status === "assembled" && <>
              <Field label="Deploy at"><Select className="w-64" value={site} onChange={(e) => setSite(Number(e.target.value))}>{(hubs.data ?? []).map((h, i) => <option key={h.id} value={i}>{h.name} (rooftop solar)</option>)}</Select></Field>
              <Button variant="primary" disabled={!hub} loading={act.isPending} onClick={() => act.mutate({ path: "deploy", body: { site_name: `${hub.name} — ${APP_LABEL[p.application]}`, lat: hub.lat, lng: hub.lng } })}><BatteryCharging className="size-4" />Deploy</Button>
            </>}
            {p.status === "deployed" && [30, 90, 180].map((dd) => <Button key={dd} loading={act.isPending && act.variables?.body?.days === dd} onClick={() => act.mutate({ path: "simulate", body: { days: dd } })}>+{dd} days telemetry</Button>)}
          </div>
        )}
      </div>
      {act.error && <div className="mt-2"><ErrorBox error={act.error} /></div>}
    </Panel>
  );
}

function M({ l, v, s, accent }: { l: string; v: string; s?: string; accent?: boolean }) {
  return <div><div className="text-[10px] uppercase tracking-wider text-ink-3">{l}</div><div className={cx("num text-base font-semibold", accent && "text-accent")}>{v}</div>{s && <div className="text-[10px] text-ink-3">{s}</div>}</div>;
}

function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
