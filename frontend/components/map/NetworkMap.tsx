"use client";
import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useLive } from "@/store/live";
import { cx, TECH_LABEL } from "@/lib/format";

// Keyless vector basemap (CARTO Dark Matter). In AWS mode set NEXT_PUBLIC_MAP_STYLE to an
// Amazon Location Service map style URL (MapLibre-compatible) — no code change.
const STYLE = process.env.NEXT_PUBLIC_MAP_STYLE ?? "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

export interface MapExtra {
  /** extra line overlays, e.g. a candidate route or hub→facility comparison legs */
  lines?: { id: string; coords: [number, number][]; color: string; dashed?: boolean; width?: number; label?: string }[];
  highlightFacilityIds?: number[];
  highlightRouteId?: number;
}

const LEGEND = [
  { c: "#a3afbc", l: "Waste source" },
  { c: "#22d3ee", l: "Vehicle" },
  { c: "#f5a524", l: "Processing hub" },
  { c: "#3ddc84", l: "Energy facility" },
];

export function NetworkMap({ height = 420, extra, className, layers = { sources: true, vehicles: true, hubs: true, facilities: true, routes: true } }: {
  height?: number | string; extra?: MapExtra; className?: string; layers?: Partial<Record<"sources" | "vehicles" | "hubs" | "facilities" | "routes", boolean>>;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const { data } = useQuery({ queryKey: ["map"], queryFn: () => api.get<any>("/map"), refetchInterval: 15_000 });
  const positions = useLive((s) => s.positions);

  useEffect(() => {
    let disposed = false;
    (async () => {
      const mod: any = await import("maplibre-gl");
      const maplibre = mod.default ?? mod;
      // The ESM build spawns a module worker next to its own URL; bundlers relocate the
      // main chunk, so serve the worker from /public (copied by the postinstall script).
      maplibre.setWorkerUrl?.("/maplibre/maplibre-gl-worker.mjs");
      if (disposed || !el.current) return;
      const m = new maplibre.Map({ container: el.current, style: STYLE, center: [77.18, 28.6], zoom: 9.4, attributionControl: { compact: true } });
      m.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
      map.current = { m, maplibre };
      m.on("load", () => {
        const empty = { type: "FeatureCollection", features: [] } as any;
        for (const id of ["routes", "extra", "sources", "hubs", "facilities", "vehicles"]) m.addSource(id, { type: "geojson", data: empty });
        m.addLayer({ id: "routes", type: "line", source: "routes", paint: { "line-color": ["get", "color"], "line-width": ["get", "width"], "line-opacity": 0.9, "line-dasharray": [2, 1.5] } });
        m.addLayer({ id: "extra", type: "line", source: "extra", paint: { "line-color": ["get", "color"], "line-width": ["get", "width"], "line-opacity": 0.95 } });
        m.addLayer({ id: "extra-dash", type: "line", source: "extra", filter: ["==", ["get", "dashed"], true], paint: { "line-color": ["get", "color"], "line-width": ["get", "width"], "line-dasharray": [1.5, 1.5] } });
        m.setPaintProperty("extra", "line-opacity", ["case", ["==", ["get", "dashed"], true], 0, 0.95]);
        m.addLayer({ id: "sources", type: "circle", source: "sources", paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "kg"], 100, 3.5, 2500, 9], "circle-color": ["case", [">", ["get", "open"], 0], "#e6edf3", "#6c7886"],
          "circle-opacity": 0.85, "circle-stroke-color": "#0d1117", "circle-stroke-width": 1.5 } });
        m.addLayer({ id: "hubs", type: "circle", source: "hubs", paint: { "circle-radius": 8, "circle-color": "#f5a524", "circle-stroke-color": "#0d1117", "circle-stroke-width": 2 } });
        m.addLayer({ id: "facilities", type: "circle", source: "facilities", paint: {
          "circle-radius": ["case", ["==", ["get", "hl"], true], 11, 8], "circle-color": "#3ddc84", "circle-opacity": ["case", ["==", ["get", "status"], "online"], 1, 0.4],
          "circle-stroke-color": ["case", ["==", ["get", "hl"], true], "#e6edf3", "#0d1117"], "circle-stroke-width": 2 } });
        m.addLayer({ id: "facility-labels", type: "symbol", source: "facilities", layout: { "text-field": ["get", "short"], "text-size": 11, "text-offset": [0, 1.4], "text-font": ["Open Sans Semibold", "Arial Unicode MS Regular"] }, paint: { "text-color": "#cfe9db", "text-halo-color": "#07090c", "text-halo-width": 1.4 } });
        m.addLayer({ id: "hub-labels", type: "symbol", source: "hubs", layout: { "text-field": ["get", "code"], "text-size": 10, "text-offset": [0, 1.4], "text-font": ["Open Sans Semibold", "Arial Unicode MS Regular"] }, paint: { "text-color": "#f5d08a", "text-halo-color": "#07090c", "text-halo-width": 1.4 } });
        m.addLayer({ id: "vehicles", type: "circle", source: "vehicles", paint: { "circle-radius": ["case", ["==", ["get", "moving"], true], 6, 4], "circle-color": "#22d3ee", "circle-stroke-color": "#07090c", "circle-stroke-width": 2, "circle-opacity": ["case", ["==", ["get", "moving"], true], 1, 0.55] } });
        m.addLayer({ id: "vehicle-labels", type: "symbol", source: "vehicles", filter: ["==", ["get", "moving"], true], layout: { "text-field": ["get", "code"], "text-size": 10, "text-offset": [0, -1.3], "text-font": ["Open Sans Semibold", "Arial Unicode MS Regular"] }, paint: { "text-color": "#a5f3fc", "text-halo-color": "#07090c", "text-halo-width": 1.4 } });
        for (const layer of ["sources", "hubs", "facilities", "vehicles"]) {
          m.on("click", layer, (e: any) => {
            const p = e.features[0].properties;
            new maplibre.Popup({ closeButton: false, offset: 10 }).setLngLat(e.lngLat).setHTML(p.html).addTo(m);
          });
          m.on("mouseenter", layer, () => (m.getCanvas().style.cursor = "pointer"));
          m.on("mouseleave", layer, () => (m.getCanvas().style.cursor = ""));
        }
        setReady(true);
      });
    })();
    return () => { disposed = true; map.current?.m.remove(); map.current = null; };
  }, []);

  // data layers
  useEffect(() => {
    if (!ready || !data || !map.current) return;
    const m = map.current.m;
    const esc = (s: any) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);
    const fc = (features: any[]) => ({ type: "FeatureCollection", features });
    const pt = (lng: number, lat: number, props: any) => ({ type: "Feature", geometry: { type: "Point", coordinates: [lng, lat] }, properties: props });
    const hl = new Set(extra?.highlightFacilityIds ?? []);
    m.getSource("sources")?.setData(fc(layers.sources ? data.sources.map((s: any) => pt(s.lng, s.lat, { kg: s.avg_daily_kg, open: s.open_requests, html: `<b>${esc(s.name)}</b><br/>${esc(s.business_type)} · ${Math.round(s.avg_daily_kg)} kg/day${s.open_requests ? `<br/><span style="color:#3ddc84">${s.open_requests} open pickup</span>` : ""}` })) : []));
    m.getSource("hubs")?.setData(fc(layers.hubs ? data.hubs.map((h: any) => pt(h.lng, h.lat, { code: h.code, html: `<b>${esc(h.code)} · ${esc(h.name)}</b><br/>${h.capacity_tpd} t/day · ${Math.round(h.current_load_kg)} kg on site` })) : []));
    m.getSource("facilities")?.setData(fc(layers.facilities ? data.facilities.map((f: any) => pt(f.lng, f.lat, { short: f.label.replace("Facility ", ""), status: f.status, hl: hl.has(f.id), html: `<b>${esc(f.label)} — ${esc(f.name)}</b><br/>${esc(TECH_LABEL[f.technology])}<br/>Efficiency ${f.efficiency_pct}% · Utilization ${f.utilization_pct}%` })) : []));
    const routeColor = (r: any) => (extra?.highlightRouteId === r.id ? "#3ddc84" : r.kind === "dispatch" ? "#22d3ee" : "#a3afbc");
    m.getSource("routes")?.setData(fc(layers.routes ? data.routes.map((r: any) => ({ type: "Feature", geometry: { type: "LineString", coordinates: r.stops.map((s: any) => [s.lng, s.lat]) }, properties: { color: routeColor(r), width: extra?.highlightRouteId === r.id ? 3.5 : 1.8 } })) : []));
    m.getSource("extra")?.setData(fc((extra?.lines ?? []).map((l) => ({ type: "Feature", geometry: { type: "LineString", coordinates: l.coords }, properties: { color: l.color, width: l.width ?? 2.5, dashed: !!l.dashed } }))));
  }, [ready, data, extra, layers.sources, layers.hubs, layers.facilities, layers.routes]);

  // vehicles (merge live telemetry)
  useEffect(() => {
    if (!ready || !data || !map.current) return;
    const m = map.current.m;
    const feats = layers.vehicles === false ? [] : data.vehicles.map((v: any) => {
      const p = positions[v.id];
      const moving = !!p || v.status === "en_route";
      return { type: "Feature", geometry: { type: "Point", coordinates: [p?.lng ?? v.lng, p?.lat ?? v.lat] }, properties: { code: v.code, moving, html: `<b>${v.code}</b> · ${v.type}<br/>${v.status.replace("_", " ")} · ${Math.round(v.current_load_kg)} / ${v.capacity_kg} kg` } };
    });
    m.getSource("vehicles")?.setData({ type: "FeatureCollection", features: feats });
  }, [ready, data, positions, layers.vehicles]);

  // fit to extra lines when provided
  useEffect(() => {
    if (!ready || !map.current || !extra?.lines?.length) return;
    const all = extra.lines.flatMap((l) => l.coords);
    const lng = all.map((c) => c[0]), lat = all.map((c) => c[1]);
    map.current.m.fitBounds([[Math.min(...lng), Math.min(...lat)], [Math.max(...lng), Math.max(...lat)]], { padding: 60, duration: 800, maxZoom: 12 });
  }, [ready, extra?.lines]);

  return (
    <div className={cx("relative overflow-hidden rounded-md border border-line", className)} style={{ height }}>
      <div ref={el} className="absolute inset-0" />
      <div className="pointer-events-none absolute bottom-2 left-2 flex flex-wrap gap-2 rounded bg-canvas/80 px-2 py-1 text-[10px] text-ink-2 backdrop-blur">
        {LEGEND.map((l) => <span key={l.l} className="flex items-center gap-1"><span className="size-2 rounded-full" style={{ background: l.c }} />{l.l}</span>)}
        <span className="flex items-center gap-1"><span className="h-px w-3 border-t border-dashed border-ink-2" />Route</span>
      </div>
    </div>
  );
}
