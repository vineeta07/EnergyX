/**
 * Seeds an isolated embedded Postgres and checks the network is built from the real Delhi data
 * and that generated rows are flagged as simulated.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wattcycle-test-"));
process.env.PGLITE_DIR = dir;
process.env.DATABASE_URL = "";

const { seed } = await import("../src/database/seed.ts");
const { query, one, closeDb } = await import("../src/database/db.ts");

after(async () => {
  await closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("seed builds the real Delhi network", { timeout: 120_000 }, async () => {
  assert.equal(await seed(false), true);
  const zones = await query<any>("SELECT * FROM waste_sources");
  assert.equal(zones.length, 12);
  assert.equal(zones.reduce((a, z) => a + z.avg_daily_kg, 0), 11_000_000);
  assert.ok(zones.every((z) => z.is_simulated === false && z.data_source && z.current_disposal));
  const facs = await query<any>("SELECT * FROM facilities");
  assert.equal(facs.length, 13);
  assert.ok(facs.every((f) => f.is_simulated === false));
  const ghogha = facs.find((f) => f.code === "BMP-GHG");
  assert.equal(ghogha.status, "commissioning");
});

test("generated operational rows are flagged simulated and landfills record no energy", async () => {
  const notSim = await one<any>("SELECT COUNT(*)::int AS n FROM energy_outputs WHERE is_simulated = false");
  assert.equal(notSim.n, 0);
  const lf = await one<any>(`SELECT COUNT(*)::int AS n FROM energy_outputs o JOIN facilities f ON f.id=o.facility_id WHERE f.technology IN ('landfill','material_recovery')`);
  assert.equal(lf.n, 0);
  const records = await one<any>("SELECT COUNT(*)::int AS n, bool_and(is_simulated) AS all_sim FROM waste_records");
  assert.ok(records.n > 1000 && records.all_sim);
});

test("seeding twice is a no-op", async () => {
  assert.equal(await seed(false), false);
});
