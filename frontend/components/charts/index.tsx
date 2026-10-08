"use client";
import type { ReactNode } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, BarChart, Bar, Sankey, Layer, Rectangle,
  AreaChart, Area, ScatterChart, Scatter, ReferenceLine, ComposedChart, Cell, ZAxis,
} from "recharts";
import { n, STREAM_COLOR, STREAM_LABEL } from "@/lib/format";

const AXIS = { stroke: "var(--ink-3)", fontSize: 11, tickLine: false, axisLine: false } as const;
const GRID = <CartesianGrid stroke="var(--line)" strokeDasharray="0" vertical={false} />;

export function ChartTooltip({ active, payload, label, unit = "", labelFmt }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded border border-line-2 bg-raised px-3 py-2 text-xs shadow-xl">
      <div className="mb-1 text-ink-3">{labelFmt ? labelFmt(label) : label}</div>
      {payload.filter((p: any) => p.value != null).map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="size-2 rounded-sm" style={{ background: p.color ?? p.payload?.fill }} />
          <span className="text-ink-2">{p.name}</span>
          <span className="num ml-auto pl-3 text-ink">{n(p.value)}{unit}</span>
        </div>
      ))}
    </div>
  );
}

const shortDate = (d: string) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "");

function LegendText(v: string) { return <span className="text-xs text-ink-2">{v}</span>; }

/** Predicted vs actual energy over time (only days with predictions are compared). */
export function PredictedVsActual({ data, height = 260 }: { data: { date: string; predicted_kwh: number | null; matched_actual_kwh: number | null }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        {GRID}
        <XAxis dataKey="date" tickFormatter={shortDate} {...AXIS} minTickGap={24} />
        <YAxis {...AXIS} width={52} />
        <Tooltip content={<ChartTooltip unit=" kWh" labelFmt={shortDate} />} cursor={{ stroke: "var(--line-2)" }} />
        <Legend formatter={LegendText} iconType="plainline" wrapperStyle={{ paddingTop: 4 }} />
        <Line type="monotone" dataKey="predicted_kwh" name="Predicted" stroke="var(--s-plastic)" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls />
        <Line type="monotone" dataKey="matched_actual_kwh" name="Actual" stroke="var(--s-organic)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--panel)" }} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function TrendArea({ data, dataKey, name, unit = "", color = "var(--s-organic)", height = 220 }: { data: any[]; dataKey: string; name: string; unit?: string; color?: string; height?: number }) {
  const gid = `g-${dataKey}`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity={0.28} /><stop offset="1" stopColor={color} stopOpacity={0} /></linearGradient></defs>
        {GRID}
        <XAxis dataKey="date" tickFormatter={shortDate} {...AXIS} minTickGap={24} />
        <YAxis {...AXIS} width={52} />
        <Tooltip content={<ChartTooltip unit={unit} labelFmt={shortDate} />} cursor={{ stroke: "var(--line-2)" }} />
        <Area type="monotone" dataKey={dataKey} name={name} stroke={color} strokeWidth={2} fill={`url(#${gid})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Waste input (bars) vs energy output (line) — two charts sharing an x-axis would be cleaner, but kg and kWh are
 *  shown here as two separate small panels to avoid a dual axis. */
export function InputOutputPair({ data }: { data: any[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div><div className="mb-1 text-[11px] text-ink-3">Waste input (kg/day)</div><SimpleBars data={data} dataKey="input_kg" name="Input" unit=" kg" color="var(--s-paper)" /></div>
      <div><div className="mb-1 text-[11px] text-ink-3">Energy output (kWh/day)</div><SimpleBars data={data} dataKey="actual_kwh" name="Energy" unit=" kWh" color="var(--s-organic)" /></div>
    </div>
  );
}

export function SimpleBars({ data, dataKey, name, unit = "", color = "var(--s-organic)", height = 200, xKey = "date" }: { data: any[]; dataKey: string; name: string; unit?: string; color?: string; height?: number; xKey?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }} barCategoryGap={2}>
        {GRID}
        <XAxis dataKey={xKey} tickFormatter={xKey === "date" ? shortDate : undefined} {...AXIS} minTickGap={20} />
        <YAxis {...AXIS} width={52} />
        <Tooltip content={<ChartTooltip unit={unit} labelFmt={xKey === "date" ? shortDate : undefined} />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
        <Bar dataKey={dataKey} name={name} fill={color} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function HBars({ data, dataKey, nameKey, unit = "", height = 220, colorFor }: { data: any[]; dataKey: string; nameKey: string; unit?: string; height?: number; colorFor?: (d: any) => string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }} barCategoryGap={6}>
        <XAxis type="number" {...AXIS} />
        <YAxis type="category" dataKey={nameKey} {...AXIS} width={120} />
        <Tooltip content={<ChartTooltip unit={unit} />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
        <Bar dataKey={dataKey} name="Value" radius={[0, 3, 3, 0]}>
          {data.map((d, i) => <Cell key={i} fill={colorFor ? colorFor(d) : "var(--s-organic)"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Scatter of predicted vs actual with the y=x reference — the honest view of model accuracy. */
export function CalibrationScatter({ data, height = 260 }: { data: { predicted_kwh: number; actual_kwh: number; stream: string; label: string }[]; height?: number }) {
  const max = Math.max(10, ...data.map((d) => Math.max(d.predicted_kwh, d.actual_kwh)));
  const groups = ["organic", "plastic", "paper"].map((s) => ({ s, rows: data.filter((d) => d.stream === s) })).filter((g) => g.rows.length);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 8, right: 12, left: -8, bottom: 8 }}>
        <CartesianGrid stroke="var(--line)" />
        <XAxis type="number" dataKey="predicted_kwh" name="Predicted" unit=" kWh" {...AXIS} domain={[0, Math.ceil(max)]} />
        <YAxis type="number" dataKey="actual_kwh" name="Actual" unit=" kWh" {...AXIS} width={64} domain={[0, Math.ceil(max)]} />
        <ZAxis range={[36, 36]} />
        <ReferenceLine segment={[{ x: 0, y: 0 }, { x: max, y: max }]} stroke="var(--ink-3)" strokeDasharray="4 4" />
        <Tooltip content={({ active, payload }: any) => active && payload?.length ? (
          <div className="rounded border border-line-2 bg-raised px-3 py-2 text-xs"><div className="text-ink">{payload[0].payload.label} · {payload[0].payload.stream}</div>
            <div className="num text-ink-2">pred {n(payload[0].payload.predicted_kwh)} · actual {n(payload[0].payload.actual_kwh)} kWh</div></div>) : null} />
        <Legend formatter={LegendText} />
        {groups.map((g) => <Scatter key={g.s} name={STREAM_LABEL[g.s]} data={g.rows} fill={STREAM_COLOR[g.s]} fillOpacity={0.8} stroke="var(--panel)" strokeWidth={1} />)}
      </ScatterChart>
    </ResponsiveContainer>
  );
}

export function ForecastChart({ history, forecast, height = 240 }: { history: { date: string; kg: number }[]; forecast: { date: string; kg: number; low: number; high: number }[]; height?: number }) {
  const data = [
    ...history.slice(-28).map((h) => ({ date: h.date, actual: h.kg })),
    ...forecast.map((f) => ({ date: f.date, forecast: f.kg, band: [f.low, f.high] })),
  ];
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        {GRID}
        <XAxis dataKey="date" tickFormatter={shortDate} {...AXIS} minTickGap={24} />
        <YAxis {...AXIS} width={52} />
        <Tooltip content={({ active, payload, label }: any) => {
          if (!active || !payload?.length) return null;
          const p = payload[0].payload;
          return <div className="rounded border border-line-2 bg-raised px-3 py-2 text-xs"><div className="text-ink-3">{shortDate(label)}</div>
            {p.actual != null && <div className="num">Actual {n(p.actual)} kg</div>}
            {p.forecast != null && <div className="num">Forecast {n(p.forecast)} kg <span className="text-ink-3">({n(p.band[0])}–{n(p.band[1])})</span></div>}</div>;
        }} />
        <Legend formatter={LegendText} />
        <Area dataKey="band" name="80% interval" fill="var(--s-plastic)" fillOpacity={0.15} stroke="none" />
        <Line dataKey="actual" name="Recorded" stroke="var(--ink-2)" strokeWidth={1.6} dot={false} />
        <Line dataKey="forecast" name="Forecast" stroke="var(--s-plastic)" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 2.5 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** 100% stacked composition bar with direct labels. */
export function CompositionBar({ comp, totalKg, height = 14 }: { comp: Record<string, number>; totalKg?: number; height?: number }) {
  const entries = Object.entries(comp).sort((a, b) => ["organic", "plastic", "paper", "metal", "other"].indexOf(a[0]) - ["organic", "plastic", "paper", "metal", "other"].indexOf(b[0]));
  return (
    <div>
      <div className="flex overflow-hidden rounded-sm" style={{ height }}>
        {entries.map(([k, v]) => <div key={k} title={`${STREAM_LABEL[k]} ${(v * 100).toFixed(1)}%`} className="border-r-2 border-panel last:border-r-0" style={{ width: `${v * 100}%`, background: STREAM_COLOR[k] }} />)}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {entries.map(([k, v]) => (
          <span key={k} className="flex items-center gap-1.5"><span className="size-2 rounded-sm" style={{ background: STREAM_COLOR[k] }} />
            <span className="text-ink-2">{STREAM_LABEL[k]}</span><span className="num text-ink">{(v * 100).toFixed(1)}%</span>{totalKg != null && <span className="num text-ink-3">· {n(v * totalKg)} kg</span>}</span>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Sankey (waste → stream → pathway → outcome)
const NODE_COLOR: Record<string, string> = {
  Organic: "var(--s-organic)", Plastic: "var(--s-plastic)", Paper: "var(--s-paper)", Metal: "var(--s-metal)", Other: "var(--s-other)",
  "Useful energy": "var(--accent)", "Recycled material": "var(--ink-2)", "Pending / residual": "var(--ink-3)",
};

function SankeyNode(props: any) {
  const { x, y, width, height, payload, containerWidth } = props;
  const right = x + width + 6 > containerWidth - 140;
  const color = NODE_COLOR[payload.name] ?? "var(--line-2)";
  return (
    <Layer>
      <Rectangle x={x} y={y} width={width} height={Math.max(2, height)} fill={color} fillOpacity={0.95} radius={2} />
      <text x={right ? x - 6 : x + width + 6} y={y + height / 2} textAnchor={right ? "end" : "start"} dominantBaseline="middle" fontSize={11} fill="var(--ink)">
        {payload.name}
        <tspan fill="var(--ink-3)" dx={5} className="num">{payload.kwh != null ? `${n(payload.kwh)} kWh` : `${n(payload.value / 1000, 1)} t`}</tspan>
      </text>
    </Layer>
  );
}

function SankeyLink(props: any) {
  const { sourceX, targetX, sourceY, targetY, sourceControlX, targetControlX, linkWidth, payload } = props;
  const color = NODE_COLOR[payload.source.name] ?? NODE_COLOR[payload.target.name] ?? "var(--ink-3)";
  return (
    <path d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
      fill="none" stroke={color} strokeOpacity={0.28} strokeWidth={Math.max(1, linkWidth)} className="transition-[stroke-opacity] hover:[stroke-opacity:0.6]" />
  );
}

export function FlowSankey({ data, height = 360 }: { data: { nodes: any[]; links: any[] }; height?: number }) {
  if (!data?.links?.length) return <div className="py-10 text-center text-sm text-ink-3">No flows in this period yet.</div>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <Sankey data={data} node={<SankeyNode />} link={<SankeyLink />} nodePadding={14} nodeWidth={8} margin={{ top: 8, right: 150, bottom: 8, left: 4 }} iterations={48}>
        <Tooltip content={({ active, payload }: any) => {
          if (!active || !payload?.length) return null;
          const p = payload[0].payload?.payload ?? payload[0].payload;
          const label = p.source ? `${p.source.name} → ${p.target.name}` : p.name;
          return <div className="rounded border border-line-2 bg-raised px-3 py-2 text-xs"><div className="text-ink">{label}</div><div className="num text-ink-2">{n(p.value)} kg</div></div>;
        }} />
      </Sankey>
    </ResponsiveContainer>
  );
}

export function ChartFrame({ title, children, note }: { title: string; children: ReactNode; note?: ReactNode }) {
  return <div><div className="mb-2 flex items-center justify-between text-xs"><span className="font-medium text-ink-2">{title}</span>{note}</div>{children}</div>;
}
