"use client";
import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useLive } from "@/store/live";
import { BUSINESS_LABEL, cx, token, TECH_LABEL } from "@/lib/format";
import { t, tEnum } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";

// Keyless vector basemaps (CARTO Positron for light, Dark Matter for dark). In AWS mode set
// NEXT_PUBLIC_MAP_STYLE to an Amazon Location Service map style URL (MapLibre-compatible), no code change.
const STYLE_LIGHT = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const STYLE_DARK = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const styleFor = (theme: string) => process.env.NEXT_PUBLIC_MAP_STYLE ?? (theme === "dark" ? STYLE_DARK : STYLE_LIGHT);

const esc = (s: any) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);

export interface MapExtra {
  /** extra line overlays, e.g. a candidate route or hub→facility comparison legs */
  lines?: { id: string; coords: [number, number][]; color: string; dashed?: boolean; width?: number; label?: string }[];
  highlightFacilityIds?: number[];
  highlightRouteId?: number;
}

const LEGEND = [
  { c: "var(--ink-3)", l: "Waste source" },
  { c: "var(--blue)", l: "Vehicle" },
  { c: "var(--ink)", l: "Processing hub", ring: true },
  { c: "var(--accent)", l: "Energy plant" },
];

export function NetworkMap({ height = 420, extra, className, layers = { sources: true, vehicles: true, hubs: true, facilities: true, routes: true } }: {
  height?: number | string; extra?: MapExtra; className?: string; layers?: Partial<Record<"sources" | "vehicles" | "hubs" | "facilities" | "routes", boolean>>;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const { data } = useQuery({ queryKey: ["map"], queryFn: () => api.get<any>("/map"), refetchInterval: 15_000 });
  const positions = useLive((s) => s.positions);
  const theme = useTheme((s) => s.theme);

  useEffect(() => {
    let disposed = false;
    (async () => {
      const mod: any = await import("maplibre-gl");
      const maplibre = mod.default ?? mod;
      // The ESM build spawns a module worker next to its own URL; bundlers relocate the
      // main chunk, so serve the worker from /public (copied by the postinstall script).
      maplibre.setWorkerUrl?.("/maplibre/maplibre-gl-worker.mjs");
      if (disposed || !el.current) return;
      const c = { ink: token("ink"), ink2: token("ink-2"), ink3: token("ink-3"), panel: token("panel"), accent: token("accent"), blue: token("blue") };
      const m = new maplibre.Map({ container: el.current, style: styleFor(theme), center: [77.18, 28.6], zoom: 9.4, attributionControl: { compact: true } });
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
          "circle-radius": ["interpolate", ["linear"], ["get", "kg"], 100, 3.5, 2500, 9], "circle-color": ["case", [">", ["get", "open"], 0], c.ink, c.ink3],
          "circle-opacity": 0.85, "circle-stroke-color": c.panel, "circle-stroke-width": 1.5 } });
        m.addLayer({ id: "hubs", type: "circle", source: "hubs", paint: { "circle-radius": 7, "circle-color": c.panel, "circle-stroke-color": c.ink, "circle-stroke-width": 3 } });
        m.addLayer({ id: "facilities", type: "circle", source: "facilities", paint: {
          "circle-radius": ["case", ["==", ["get", "hl"], true], 11, 8], "circle-color": c.accent, "circle-opacity": ["case", ["==", ["get", "status"], "online"], 1, 0.4],
          "circle-stroke-color": ["case", ["==", ["get", "hl"], true], c.ink, c.panel], "circle-stroke-width": 2 } });
        m.addLayer({ id: "facility-labels", type: "symbol", source: "facilities", layout: { "text-field": ["get", "short"], "text-size": 11, "text-offset": [0, 1.4], "text-font": ["Open Sans Semibold", "Arial Unicode MS Regular"] }, paint: { "text-color": c.ink, "text-halo-color": c.panel, "text-halo-width": 1.6 } });
        m.addLayer({ id: "hub-labels", type: "symbol", source: "hubs", layout: { "text-field": ["get", "code"], "text-size": 10, "text-offset": [0, 1.4], "text-font": ["Open Sans Semibold", "Arial Unicode MS Regular"] }, paint: { "text-color": c.ink2, "text-halo-color": c.panel, "text-halo-width": 1.6 } });
        m.addLayer({ id: "vehicles", type: "circle", source: "vehicles", paint: { "circle-radius": ["case", ["==", ["get", "moving"], true], 6, 4], "circle-color": c.blue, "circle-stroke-color": c.panel, "circle-stroke-width": 2, "circle-opacity": ["case", ["==", ["get", "moving"], true], 1, 0.55] } });
        m.addLayer({ id: "vehicle-labels", type: "symbol", source: "vehicles", filter: ["==", ["get", "moving"], true], layout: { "text-field": ["get", "code"], "text-size": 10, "text-offset": [0, -1.3], "text-font": ["Open Sans Semibold", "Arial Unicode MS Regular"] }, paint: { "text-color": c.blue, "text-halo-color": c.panel, "text-halo-width": 1.6 } });
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
  }, [theme]);

  // data layers
  useEffect(() => {
    if (!ready || !data || !map.current) return;
    const m = map.current.m;
    const fc = (features: any[]) => ({ type: "FeatureCollection", features });
    const pt = (lng: number, lat: number, props: any) => ({ type: "Feature", geometry: { type: "Point", coordinates: [lng, lat] }, properties: props });
    const hl = new Set(extra?.highlightFacilityIds ?? []);
    m.getSource("sources")?.setData(fc(layers.sources ? data.sources.map((s: any) => pt(s.lng, s.lat, { kg: s.avg_daily_kg, open: s.open_requests, html: `<b>${esc(s.name)}</b><br/>${esc(BUSINESS_LABEL[s.business_type] ?? s.business_type)} · ${Math.round(s.avg_daily_kg)} ${t("kg/day")}${s.open_requests ? `<br/><span style="color:${token("accent")}">${t("{n} open pickup", { n: s.open_requests })}</span>` : ""}` })) : []));
    m.getSource("hubs")?.setData(fc(layers.hubs ? data.hubs.map((h: any) => pt(h.lng, h.lat, { code: h.code, html: `<b>${esc(h.code)} · ${esc(h.name)}</b><br/>${h.capacity_tpd} ${t("t/day")} · ${t("{n} kg on site", { n: Math.round(h.current_load_kg) })}` })) : []));
    m.getSource("facilities")?.setData(fc(layers.facilities ? data.facilities.map((f: any) => pt(f.lng, f.lat, { short: f.label.replace("Facility ", ""), status: f.status, hl: hl.has(f.id), html: `<b>${esc(f.label)}, ${esc(f.name)}</b><br/>${esc(TECH_LABEL[f.technology])}<br/>${t("Efficiency")} ${f.efficiency_pct}% · ${t("Utilization")} ${f.utilization_pct}%` })) : []));
    const routeColor = (r: any) => (extra?.highlightRouteId === r.id ? token("accent") : r.kind === "dispatch" ? token("blue") : token("ink-3"));
    m.getSource("routes")?.setData(fc(layers.routes ? data.routes.map((r: any) => ({ type: "Feature", geometry: { type: "LineString", coordinates: r.stops.map((s: any) => [s.lng, s.lat]) }, properties: { color: routeColor(r), width: extra?.highlightRouteId === r.id ? 3.5 : 1.8 } })) : []));
    m.getSource("extra")?.setData(fc((extra?.lines ?? []).map((l) => ({ type: "Feature", geometry: { type: "LineString", coordinates: l.coords }, properties: { color: l.color, width: l.width ?? 2.5, dashed: !!l.dashed } }))));
  }, [ready, data, extra, layers.sources, layers.hubs, layers.facilities, layers.routes, theme]);

  // vehicles (merge live telemetry)
  useEffect(() => {
    if (!ready || !data || !map.current) return;
    const m = map.current.m;
    const feats = layers.vehicles === false ? [] : data.vehicles.map((v: any) => {
      const p = positions[v.id];
      const moving = !!p || v.status === "en_route";
      return { type: "Feature", geometry: { type: "Point", coordinates: [p?.lng ?? v.lng, p?.lat ?? v.lat] }, properties: { code: v.code, moving, html: `<b>${v.code}</b> · ${esc(v.type)}<br/>${tEnum(v.status)} · ${Math.round(v.current_load_kg)} / ${v.capacity_kg} kg` } };
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
      <div ref={el} style={{ position: "absolute", inset: 0 }} />
      <div className="pointer-events-none absolute bottom-2 left-2 flex flex-wrap gap-x-3 gap-y-1 rounded-md border border-line bg-panel px-2 py-1 text-xs text-ink-2">
        {LEGEND.map((l) => <span key={l.l} className="flex items-center gap-1"><span className={cx("size-2 rounded-full", l.ring && "border-2 bg-panel")} style={l.ring ? { borderColor: l.c } : { background: l.c }} />{t(l.l)}</span>)}
        <span className="flex items-center gap-1"><span className="h-px w-3 border-t border-dashed border-ink-2" />{t("Route")}</span>
      </div>
    </div>
  );
}
