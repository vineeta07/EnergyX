import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ITEMS, RESINS, LEVELS, POINTS, DEMO_BASELINE, REPORT_KINDS, QUIZ_LENGTH, levelFor, quizItems } from "../src/services/citizen.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

test("resident item list covers exactly the photo model's classes", () => {
  const py = fs.readFileSync(path.join(here, "..", "..", "ai-service", "ml", "inference", "vision.py"), "utf8");
  const block = py.match(/CLASSES = \[([\s\S]*?)\]/)![1];
  const classes = [...block.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]).sort();
  assert.equal(classes.length, 30);
  assert.deepEqual(ITEMS.map((i) => i.key).sort(), classes);
});

test("every item names a bin that fits its verdict", () => {
  for (const i of ITEMS) {
    if (i.verdict === "compost") assert.equal(i.bin, "green", i.key);
    if (i.verdict === "recycle" || i.verdict === "energy") assert.equal(i.bin, "blue", i.key);
    if (i.verdict === "hazard") assert.equal(i.bin, "red", i.key);
    if (i.material === "organic") assert.equal(i.verdict, "compost", i.key);
    assert.ok(i.grams > 0 && i.why.length > 10 && i.prep.length > 5, i.key);
  }
});

test("plastic items carry a known plastic code and nothing else does", () => {
  const codes = new Set(RESINS.map((r) => r.code));
  assert.deepEqual([...codes].sort(), [1, 2, 3, 4, 5, 6, 7]);
  for (const i of ITEMS) {
    if (i.material === "plastic") assert.ok(i.resin != null && codes.has(i.resin as 1), `${i.key} needs a plastic code`);
    else assert.equal(i.resin, null, i.key);
  }
});

test("the demo starts at 45 points, so the first item sorted in the demo grows the plant", () => {
  const items = DEMO_BASELINE.map((b) => b.item as string);
  assert.equal(new Set(items).size, items.length, "all different, so each earned the first-time bonus");
  assert.ok(items.every((k) => ITEMS.some((i) => i.key === k)));
  const points = items.length * (POINTS.scan + POINTS.new_item);
  assert.equal(points, 45);
  assert.equal(levelFor(points).n, 1);
  assert.ok(levelFor(points + POINTS.scan).n >= 2, "even an item seen before (no bonus) crosses into level 2");
  // The demo's sample photo is a plastic bottle, which should still count as a new item.
  for (const bottle of ["plastic_water_bottles", "plastic_soda_bottles", "plastic_detergent_bottles"]) assert.ok(!items.includes(bottle));
  for (const b of DEMO_BASELINE) assert.ok(b.daysAgo >= 1, "nothing today, so the day's points cap is untouched");
});

test("levels start at zero, rise in order and report progress to the next one", () => {
  assert.equal(LEVELS[0].at, 0);
  for (let i = 1; i < LEVELS.length; i++) assert.ok(LEVELS[i].at > LEVELS[i - 1].at);
  assert.deepEqual({ n: levelFor(0).n, to_next: levelFor(0).to_next, progress: levelFor(0).progress }, { n: 1, to_next: 50, progress: 0 });
  assert.equal(levelFor(49).n, 1);
  assert.equal(levelFor(50).n, 2);
  assert.equal(levelFor(100).progress, 0.5);
  const top = levelFor(10_000);
  assert.equal(top.n, LEVELS.length);
  assert.equal(top.next_at, null);
  assert.equal(top.progress, 1);
});

test("the daily quiz holds five different items, the same all day and new the next day", () => {
  const a = quizItems(7, "2026-10-11");
  assert.equal(a.length, QUIZ_LENGTH);
  assert.equal(new Set(a.map((i) => i.key)).size, QUIZ_LENGTH);
  assert.deepEqual(quizItems(7, "2026-10-11").map((i) => i.key), a.map((i) => i.key));
  assert.notDeepEqual(quizItems(7, "2026-10-12").map((i) => i.key), a.map((i) => i.key));
  assert.notDeepEqual(quizItems(8, "2026-10-11").map((i) => i.key), a.map((i) => i.key));
});

test("a full quiz is worth at most what a day of reports and scans is, and only burning is critical", () => {
  assert.ok(POINTS.quiz_right * QUIZ_LENGTH <= POINTS.scan + POINTS.new_item);
  for (const [k, v] of Object.entries(REPORT_KINDS)) assert.equal(v.severity === "critical", k === "burning", k);
});
