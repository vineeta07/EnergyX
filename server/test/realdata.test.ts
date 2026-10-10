import { test } from "node:test";
import assert from "node:assert/strict";
import { ZONES, FACILITIES, DELHI, DELHI_COMPOSITION, nameplateYield, electricalEfficiency, mixedLhv } from "../src/database/realdata/delhi.ts";
import { simulateEnergy, rng, STREAMS } from "../src/database/simulator.ts";
import { roadLookup, setRoadDistance, pointKey, haversineKm, ROAD_FACTOR } from "../src/utils/geo.ts";

test("MCD zones add up to the published 11,000 TPD and 250 wards", () => {
  assert.equal(ZONES.length, DELHI.zones);
  assert.equal(ZONES.reduce((a, z) => a + z.tpd, 0), DELHI.generation_tpd);
  assert.equal(ZONES.reduce((a, z) => a + z.wards, 0), DELHI.wards);
});

test("every zone's current disposal point is a known facility", () => {
  const labels = new Set(FACILITIES.map((f) => f.label));
  for (const z of ZONES) for (const d of z.disposal.split(" + ")) assert.ok(labels.has(d.trim()), `${z.name}: ${d}`);
});

test("composition sums to 1 and matches MCD's 40% biodegradable share", () => {
  const sum = Object.values(DELHI_COMPOSITION).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.equal(DELHI_COMPOSITION.organic, DELHI.biodegradable_share);
});

test("WtE yields and efficiencies derived from published MW/TPD are physically plausible", () => {
  // Mixed Delhi MSW ≈ 1,400–1,500 kcal/kg (1 kWh = 860 kcal)
  const kcal = mixedLhv() * 860;
  assert.ok(kcal > 1300 && kcal < 1600, `LHV ${kcal} kcal/kg`);
  for (const f of FACILITIES.filter((x) => x.technology === "combustion")) {
    const y = nameplateYield(f), e = electricalEfficiency(f);
    assert.ok(y > 0.2 && y < 0.35, `${f.label} yield ${y}`);
    assert.ok(e > 0.1 && e < 0.25, `${f.label} efficiency ${e}`);
  }
});

test("simulated meter readings average each plant's published yield (within 8%)", () => {
  const r = rng(42);
  for (const f of FACILITIES.filter((x) => x.technology === "combustion")) {
    let kwh = 0, kg = 0;
    for (let i = 0; i < 400; i++) {
      for (const s of STREAMS) {
        const m = DELHI_COMPOSITION[s] * 1000;
        if (!m) continue;
        kwh += simulateEnergy({ stream: s, technology: "combustion", kg: m, moisture: s === "organic" ? 0.55 : 0.12, sim: { trueFactor: electricalEfficiency(f), noise: 0.07, optimalMoisture: 0.55 }, utilization: 0.9, r });
        kg += m;
      }
    }
    const got = kwh / kg, want = nameplateYield(f);
    assert.ok(Math.abs(got / want - 1) < 0.08, `${f.label}: simulated ${got.toFixed(3)} vs published ${want.toFixed(3)} kWh/kg`);
  }
});

test("road lookup uses cached OSRM distances and falls back to great-circle x factor", () => {
  const a = { lat: 28.5, lng: 77.2 }, b = { lat: 28.6, lng: 77.3 };
  const est = roadLookup(a, b);
  assert.equal(est.source, "estimate");
  assert.ok(Math.abs(est.km - haversineKm(a, b) * ROAD_FACTOR) < 1e-9);
  setRoadDistance(pointKey(a), pointKey(b), 19.4, 31);
  const real = roadLookup(a, b);
  assert.deepEqual([real.km, real.minutes, real.source], [19.4, 31, "osrm"]);
  assert.equal(roadLookup(a, a).km, 0);
});
