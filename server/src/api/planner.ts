/**
 * City allocation planner: how Delhi's real zone tonnage should be split across real plants.
 * Inputs are the real zones/facilities in the DB + OSRM road distances; scenarios add the
 * capacity expansions published by DPCC/MCD and press reports.
 */
import { Router } from "express";
import { z } from "zod";
import { query } from "../database/db.ts";
import { ah, parse } from "../middleware/http.ts";
import { ai } from "../services/aiClient.ts";
import { roadKm, round } from "../utils/geo.ts";
import { AD_KWH_PER_KG, SOURCES } from "../database/realdata/delhi.ts";

export const plannerRouter = Router();

export const SCENARIOS = {
  ghogha_online: { label: "Ghogha biomethanation online (250 TPD wet waste)", source: SOURCES.biomethanation_delhi.url },
  okhla_expansion: { label: "Okhla WtE expansion: 1,950 → 2,950 TPD, 23 → 40 MW", source: SOURCES.renewablewatch_2026.url },
  tehkhand_expansion: { label: "Tehkhand WtE expansion: 2,000 → 3,000 TPD, 25 → 45 MW", source: SOURCES.tehkhand_2022.url },
  new_ghazipur: { label: "New Ghazipur WtE: +2,000 TPD (yield assumed = existing Ghazipur plant)", source: SOURCES.dpcc_mcd.url },
  new_bawana: { label: "New Narela-Bawana WtE: +3,000 TPD (yield assumed = existing Bawana plant)", source: SOURCES.dpcc_mcd.url },
} as const;
type ScenarioKey = keyof typeof SCENARIOS;

plannerRouter.get("/planner/scenarios", (_req, res) => res.json(SCENARIOS));

plannerRouter.post("/planner/city", ah(async (req, res) => {
  const b = parse(z.object({ scenarios: z.array(z.enum(Object.keys(SCENARIOS) as [ScenarioKey, ...ScenarioKey[]])).default([]) }), req.body ?? {});
  const on = new Set(b.scenarios);
  const zones = await query<any>("SELECT name, lat, lng, avg_daily_kg, current_disposal, wards FROM waste_sources WHERE current_disposal IS NOT NULL ORDER BY id");
  const facRows = await query<any>("SELECT code, label, name, lat, lng, technology, status, capacity_tpd, mw FROM facilities WHERE technology IN ('combustion','landfill','anaerobic_digestion') ORDER BY code");

  const facilities = facRows.map((f) => {
    let cap = f.capacity_tpd, mw = f.mw, status = f.status;
    if (f.code === "WTE-OKH" && on.has("okhla_expansion")) { cap = 2950; mw = 40; }
    if (f.code === "WTE-TKD" && on.has("tehkhand_expansion")) { cap = 3000; mw = 45; }
    if (f.code === "BMP-GHG" && on.has("ghogha_online")) status = "online";
    const kwh_per_t = f.technology === "combustion" ? (mw * 24 * 1000) / cap : f.technology === "anaerobic_digestion" ? AD_KWH_PER_KG * 1000 : 0;
    return { code: f.code, label: f.label, technology: f.technology, status, capacity_tpd: cap, kwh_per_t: round(kwh_per_t, 1), lat: f.lat, lng: f.lng, mw };
  });
  const clone = (code: string, newCode: string, label: string, cap: number) => {
    const base = facilities.find((f) => f.code === code)!;
    facilities.push({ ...base, code: newCode, label, capacity_tpd: cap });
  };
  if (on.has("new_ghazipur")) clone("WTE-GZP", "WTE-GZP2", "New Ghazipur WtE", 2000);
  if (on.has("new_bawana")) clone("WTE-BWN", "WTE-BWN2", "New Narela-Bawana WtE", 3000);

  const byLabel = new Map(facRows.map((f) => [f.label, f.code]));
  const zonesIn = zones.map((zn) => ({
    name: zn.name, tpd: zn.avg_daily_kg / 1000,
    current_destinations: String(zn.current_disposal).split(" + ").map((l) => byLabel.get(l.trim())).filter(Boolean),
  }));
  const dist: Record<string, Record<string, number>> = {};
  for (const zn of zones) {
    dist[zn.name] = {};
    for (const f of facilities) dist[zn.name][f.code] = round(roadKm(zn, f), 2);
  }
  const out = await ai.planCity({ zones: zonesIn, facilities: facilities.map(({ lat, lng, mw, ...f }) => f), dist });
  res.json({
    ...out,
    scenarios: b.scenarios.map((k) => ({ key: k, ...SCENARIOS[k] })),
    zones: zones.map((zn) => ({ name: zn.name, tpd: zn.avg_daily_kg / 1000, wards: zn.wards, lat: zn.lat, lng: zn.lng, current_disposal: zn.current_disposal })),
    facilities: facilities.map((f) => ({ code: f.code, label: f.label, technology: f.technology, status: f.status, capacity_tpd: f.capacity_tpd, kwh_per_t: f.kwh_per_t, lat: f.lat, lng: f.lng })),
  });
}));
