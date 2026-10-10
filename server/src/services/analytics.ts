import { query, one } from "../database/db.ts";
import { cache } from "./cache.ts";
import { round } from "../utils/geo.ts";

// Emission factors (documented on /impact):
export const GRID_KG_CO2_PER_KWH = 0.71; // CEA India grid baseline (approx.)
export const LANDFILL_KG_CO2E_PER_KG_ORGANIC = 0.45; // avoided methane per kg organic diverted (IPCC FOD, rounded)

export async function kpis() {
  return cache.wrap("dashboard:kpis", 5_000, async () => {
    const r = await one<any>(`
      SELECT
        (SELECT COALESCE(SUM(quantity_kg),0) FROM pickup_requests WHERE status IN ('REQUESTED','ASSIGNED','EN_ROUTE')) AS waste_available_kg,
        (SELECT COUNT(*)::int FROM pickup_requests WHERE status IN ('REQUESTED','ASSIGNED','EN_ROUTE')) AS open_pickups,
        (SELECT COALESCE(SUM(measured_kg),0) FROM shipments WHERE arrived_at > now() - interval '7 days') AS waste_collected_kg,
        (SELECT COALESCE(SUM(COALESCE(measured_kg,total_kg)),0) FROM shipments WHERE status IN ('awaiting_classification','classified','dispatched')) AS in_processing_kg,
        (SELECT COUNT(*)::int FROM shipments WHERE status IN ('awaiting_classification','classified','dispatched')) AS in_processing_shipments,
        (SELECT COALESCE(SUM(actual_kwh),0) FROM energy_outputs WHERE recorded_at > now() - interval '7 days') AS energy_kwh_7d,
        (SELECT COALESCE(SUM(actual_kwh),0) FROM energy_outputs WHERE recorded_at > now() - interval '30 days') AS energy_kwh_30d,
        (SELECT COALESCE(SUM(actual_kwh),0) FROM energy_outputs WHERE recorded_at::date = now()::date) AS energy_kwh_today,
        (SELECT COALESCE(SUM(input_kg),0) FROM energy_outputs WHERE stream='organic' AND recorded_at > now() - interval '30 days') AS organic_diverted_30d,
        (SELECT COALESCE(SUM(measured_kg),0) FROM shipments WHERE arrived_at > now() - interval '30 days') AS diverted_30d,
        (SELECT COUNT(*)::int FROM routes WHERE status IN ('planned','active')) AS active_routes,
        (SELECT COUNT(*)::int FROM vehicles WHERE status IN ('en_route','assigned')) AS active_vehicles,
        (SELECT COUNT(*)::int FROM vehicles) AS total_vehicles,
        (SELECT AVG(opt_score) FROM routes WHERE kind='collection' AND opt_score IS NOT NULL) AS routing_efficiency,
        (SELECT AVG(ABS(error_pct)) FROM feedback_records WHERE kind='energy') AS live_mape,
        (SELECT AVG(ABS(p.predicted_kwh - o.actual_kwh) / NULLIF(o.actual_kwh,0)) * 100 FROM energy_outputs o JOIN energy_predictions p ON p.id=o.prediction_id) AS all_mape,
        (SELECT COUNT(*)::int FROM alerts WHERE status='open') AS open_alerts
    `);
    const co2_30d = r.energy_kwh_30d * GRID_KG_CO2_PER_KWH + r.organic_diverted_30d * LANDFILL_KG_CO2E_PER_KG_ORGANIC;
    return {
      waste_available_kg: round(r.waste_available_kg, 0), open_pickups: r.open_pickups,
      waste_collected_kg_7d: round(r.waste_collected_kg, 0),
      in_processing_kg: round(r.in_processing_kg, 0), in_processing_shipments: r.in_processing_shipments,
      energy_kwh_today: round(r.energy_kwh_today, 0), energy_kwh_7d: round(r.energy_kwh_7d, 0), energy_kwh_30d: round(r.energy_kwh_30d, 0),
      co2_avoided_kg_30d: round(co2_30d, 0), waste_diverted_kg_30d: round(r.diverted_30d, 0),
      active_routes: r.active_routes, active_vehicles: r.active_vehicles, total_vehicles: r.total_vehicles,
      routing_efficiency: r.routing_efficiency != null ? round(r.routing_efficiency, 1) : null,
      prediction_accuracy: r.all_mape != null ? round(100 - r.all_mape, 1) : null,
      live_mape: r.live_mape != null ? round(r.live_mape, 2) : null, open_alerts: r.open_alerts,
      factors: { grid_kg_co2_per_kwh: GRID_KG_CO2_PER_KWH, landfill_kg_co2e_per_kg_organic: LANDFILL_KG_CO2E_PER_KG_ORGANIC },
    };
  });
}

/** Sankey: source type → stream → pathway → outcome, over the last N days (kg; kWh annotated). */
export async function flow(days = 30) {
  return cache.wrap(`dashboard:flow:${days}`, 15_000, async () => {
    const ships = await query<any>(
      `SELECT s.id, s.source_mix, COALESCE(s.measured_kg, s.total_kg) AS kg,
              (SELECT row_to_json(c) FROM waste_compositions c WHERE c.shipment_id=s.id ORDER BY (c.origin='operator') DESC, (c.origin='lab_audit') DESC, c.id DESC LIMIT 1) AS comp
       FROM shipments s WHERE s.arrived_at > now() - ($1 || ' days')::interval AND s.status <> 'in_transit'`, [days]);
    const outputs = await query<any>(
      `SELECT o.stream, f.technology, SUM(o.input_kg) AS kg, SUM(o.actual_kwh) AS kwh FROM energy_outputs o JOIN facilities f ON f.id=o.facility_id
       WHERE o.recorded_at > now() - ($1 || ' days')::interval GROUP BY o.stream, f.technology`, [days]);
    const typeLabel: Record<string, string> = { restaurant: "Restaurants", hotel: "Hotels", market: "Markets", food_processing: "Food processing", agriculture: "Agriculture", manufacturing: "Manufacturing", municipal: "Municipal" };
    const streamLabel: Record<string, string> = { organic: "Organic", plastic: "Plastic", paper: "Paper", metal: "Metal", other: "Other" };
    const techLabel: Record<string, string> = { anaerobic_digestion: "Biomethanation", combustion: "Waste-to-Energy", landfill: "Sanitary landfill", rdf_coprocessing: "RDF co-processing", pyrolysis: "Pyrolysis", landfill_gas: "Landfill gas", material_recovery: "Material recovery" };
    const links = new Map<string, number>();
    const add = (a: string, b: string, v: number) => { if (v > 0.5) links.set(`${a}→${b}`, (links.get(`${a}→${b}`) ?? 0) + v); };
    const streamTotals: Record<string, number> = {};
    for (const s of ships) {
      if (!s.comp) continue;
      const mixTotal = s.source_mix.reduce((a: number, m: any) => a + m.kg, 0) || 1;
      for (const m of s.source_mix) {
        for (const st of Object.keys(streamLabel)) {
          const v = s.kg * (m.kg / mixTotal) * s.comp[st];
          add(typeLabel[m.business_type] ?? "Other sources", streamLabel[st], v);
          streamTotals[st] = (streamTotals[st] ?? 0) + v;
        }
      }
    }
    const energyByTech: Record<string, number> = {};
    const routed: Record<string, number> = {};
    for (const o of outputs) {
      const v = Math.min(o.kg, (streamTotals[o.stream] ?? 0) - (routed[o.stream] ?? 0));
      if (v <= 0) continue;
      routed[o.stream] = (routed[o.stream] ?? 0) + v;
      add(streamLabel[o.stream], techLabel[o.technology], v);
      add(techLabel[o.technology], "Useful energy", v);
      energyByTech[techLabel[o.technology]] = (energyByTech[techLabel[o.technology]] ?? 0) + o.kwh * (v / o.kg);
    }
    for (const st of ["paper", "metal", "plastic"]) {
      const rest = (streamTotals[st] ?? 0) - (routed[st] ?? 0);
      if (rest > 0) { add(streamLabel[st], "Material recovery", rest); add("Material recovery", "Recycled material", rest); }
    }
    for (const st of ["organic", "other"]) {
      const rest = (streamTotals[st] ?? 0) - (routed[st] ?? 0);
      if (rest > 0) { add(streamLabel[st], "Pending / residual", rest); }
    }
    const names = new Set<string>();
    for (const k of links.keys()) k.split("→").forEach((n) => names.add(n));
    const nodes = [...names].map((name) => ({ name, kwh: energyByTech[name] ? round(energyByTech[name], 0) : undefined }));
    const idx = (n: string) => nodes.findIndex((x) => x.name === n);
    const totalKwh = Object.values(energyByTech).reduce((a, b) => a + b, 0);
    const useful = nodes.find((n) => n.name === "Useful energy");
    if (useful) useful.kwh = round(totalKwh, 0);
    return {
      days, nodes,
      links: [...links.entries()].map(([k, v]) => { const [a, b] = k.split("→"); return { source: idx(a), target: idx(b), value: round(v, 0) }; }),
      total_kg: round(Object.values(streamTotals).reduce((a, b) => a + b, 0), 0), total_kwh: round(totalKwh, 0),
    };
  });
}

export async function timeseries(days = 30) {
  return cache.wrap(`dashboard:ts:${days}`, 15_000, async () => {
    const energy = await query<any>(
      `SELECT to_char(d::date,'YYYY-MM-DD') AS date,
        COALESCE((SELECT SUM(actual_kwh) FROM energy_outputs o WHERE o.recorded_at::date=d::date),0) AS actual_kwh,
        (SELECT SUM(p.predicted_kwh) FROM energy_outputs o JOIN energy_predictions p ON p.id=o.prediction_id WHERE o.recorded_at::date=d::date) AS predicted_kwh,
        (SELECT SUM(o.actual_kwh) FROM energy_outputs o WHERE o.prediction_id IS NOT NULL AND o.recorded_at::date=d::date) AS matched_actual_kwh,
        COALESCE((SELECT SUM(input_kg) FROM energy_outputs o WHERE o.recorded_at::date=d::date),0) AS input_kg
       FROM generate_series(now()::date - ($1::int - 1), now()::date, interval '1 day') d ORDER BY d`, [days]);
    const waste = await query<any>(
      `SELECT to_char(record_date,'YYYY-MM-DD') AS date, SUM(quantity_kg) AS kg FROM waste_records
       WHERE record_date > now()::date - $1::int GROUP BY record_date ORDER BY record_date`, [days]);
    const byStream = await query<any>(
      `SELECT stream, SUM(actual_kwh) AS kwh, SUM(input_kg) AS kg FROM energy_outputs WHERE recorded_at > now() - ($1 || ' days')::interval GROUP BY stream`, [days]);
    return {
      energy: energy.map((e) => ({ ...e, actual_kwh: round(e.actual_kwh, 0), predicted_kwh: e.predicted_kwh != null ? round(e.predicted_kwh, 0) : null, matched_actual_kwh: e.matched_actual_kwh != null ? round(e.matched_actual_kwh, 0) : null, input_kg: round(e.input_kg, 0) })),
      waste: waste.map((w) => ({ date: w.date, kg: round(w.kg, 0) })),
      by_stream: byStream.map((s) => ({ stream: s.stream, kwh: round(s.kwh, 0), kg: round(s.kg, 0), kwh_per_kg: round(s.kwh / s.kg, 3) })),
    };
  });
}

export async function facilityPerformance() {
  return query<any>(`
    SELECT f.id, f.code, f.label, f.name, f.technology, f.utilization_pct, f.efficiency_pct, f.capacity_tpd,
      COALESCE(SUM(o.actual_kwh),0)::float AS kwh_30d, COALESCE(SUM(o.input_kg),0)::float AS kg_30d,
      AVG(o.efficiency_pct) AS measured_efficiency,
      (SELECT AVG(ABS(fr.error_pct)) FROM feedback_records fr WHERE fr.facility_id=f.id AND fr.kind='energy') AS live_mape,
      (SELECT AVG(ABS(p.predicted_kwh-o2.actual_kwh)/NULLIF(o2.actual_kwh,0))*100 FROM energy_outputs o2 JOIN energy_predictions p ON p.id=o2.prediction_id WHERE o2.facility_id=f.id) AS mape
    FROM facilities f LEFT JOIN energy_outputs o ON o.facility_id=f.id AND o.recorded_at > now() - interval '30 days'
    GROUP BY f.id ORDER BY f.code`);
}
