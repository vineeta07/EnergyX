import bcrypt from "bcryptjs";
import { query, one, insert } from "../database/db.ts";
import { HttpError } from "../middleware/http.ts";
import { ZONES } from "../database/realdata/delhi.ts";
import { haversineKm } from "../utils/geo.ts";
import { raiseAlert } from "./alerts.ts";
import { putObject } from "./storage.ts";

/**
 * Resident app: what a household item is, which bin it goes in, and a points tally.
 *
 * The item list is the vision model's 30 classes (ai-service/ml/inference/vision.py), with the
 * same recyclable / not recyclable call as ai-service/ml/circular/recyclability.py, reworded for
 * a household. Bins follow the SWM Rules 2016 split: wet (green), dry (blue), domestic hazardous (red).
 */
export type Verdict = "recycle" | "compost" | "upcycle" | "energy" | "hazard";
export type Bin = "blue" | "green" | "red" | "donate";

export interface Item {
  key: string; name: string; material: "organic" | "plastic" | "paper" | "metal" | "glass" | "textile";
  verdict: Verdict; bin: Bin; resin: number | null; why: string; prep: string;
  /** Upcycling ideas category, if this item is worth keeping. */
  ideas: string | null;
  /** Typical weight of one item in grams. An estimate, used only for the "about X kg" line. */
  grams: number;
}

const item = (key: string, name: string, material: Item["material"], verdict: Verdict, bin: Bin, grams: number, why: string, prep: string, resin: number | null = null, ideas: string | null = null): Item =>
  ({ key, name, material, verdict, bin, resin, why, prep, ideas, grams });

export const ITEMS: Item[] = [
  item("aerosol_cans", "Aerosol can", "metal", "hazard", "red", 80, "The can is metal, but a can with gas left in it can burst in a truck or a furnace.", "Use it up fully. Never pierce or burn it. Hand it over separately as hazardous waste."),
  item("aluminum_food_cans", "Aluminium food can or tray", "metal", "recycle", "blue", 20, "Aluminium melts down again and again without losing quality, and scrap dealers pay well for it.", "Rinse off the food and press it flat.", null, "metal_can"),
  item("aluminum_soda_cans", "Drink can", "metal", "recycle", "blue", 15, "Aluminium melts down again and again without losing quality, and scrap dealers pay well for it.", "Empty it, rinse it, crush it.", null, "metal_can"),
  item("cardboard_boxes", "Cardboard box", "paper", "recycle", "blue", 200, "Paper mills buy old cardboard. A box in good shape can simply be used again.", "Remove tape, flatten it and keep it dry.", null, "cardboard"),
  item("cardboard_packaging", "Cardboard packaging", "paper", "recycle", "blue", 60, "Paper mills buy old cardboard.", "Flatten it and keep it dry. Oily parts go in the wet bin.", null, "cardboard"),
  item("clothing", "Clothes", "textile", "upcycle", "donate", 250, "Recycling centres do not take clothes, but they are worth far more worn again or remade than thrown away.", "Wash them. Donate what is wearable and keep the rest for cloth bags or rags.", null, "textile"),
  item("coffee_grounds", "Coffee grounds", "organic", "compost", "green", 30, "It rots down into compost or biogas. It cannot be recycled.", "Straight into the wet bin, or onto your plants.", null, "organic"),
  item("disposable_plastic_cutlery", "Plastic cutlery", "plastic", "energy", "blue", 5, "Single-use cutlery was banned in 2022 and nobody buys it for recycling.", "Dry bin. It is burned for energy. Carry a steel spoon next time.", 6),
  item("eggshells", "Eggshells", "organic", "compost", "green", 6, "They break down in compost and add calcium to the soil.", "Crush them and put them in the wet bin.", null, "organic"),
  item("food_waste", "Food waste", "organic", "compost", "green", 150, "Food turns into compost or biogas. Mixed with dry waste it spoils everything it touches.", "Wet bin, with no plastic bag around it.", null, "organic"),
  item("glass_beverage_bottles", "Glass bottle", "glass", "recycle", "blue", 300, "Glass is melted into new glass endlessly. A whole bottle can be refilled or reused as it is.", "Rinse it. Wrap broken glass in paper and label it.", null, "glass_container"),
  item("glass_cosmetic_containers", "Glass cosmetic jar", "glass", "recycle", "blue", 120, "Glass is melted into new glass endlessly. Small jars are handy to keep.", "Empty it and rinse it. Pumps and caps go separately.", null, "glass_container"),
  item("glass_food_jars", "Glass food jar", "glass", "recycle", "blue", 250, "Glass is melted into new glass endlessly. A jar with its lid is worth keeping.", "Rinse it and keep the lid on.", null, "glass_container"),
  item("magazines", "Magazine", "paper", "recycle", "blue", 150, "Sold as mixed paper and pulped into new paper.", "Keep it dry and stack it with newspapers."),
  item("newspaper", "Newspaper", "paper", "recycle", "blue", 100, "Old newsprint is one of the easiest things to sell and recycle.", "Keep it dry and bundled.", null, "newspaper"),
  item("office_paper", "Office paper", "paper", "recycle", "blue", 5, "White paper is the most valuable paper grade.", "Keep it dry. Use the blank side first."),
  item("paper_cups", "Paper cup", "paper", "energy", "blue", 8, "It looks like paper, but a thin plastic lining inside means paper mills reject it.", "Dry bin. It is burned for energy. A steel or glass cup saves it altogether."),
  item("plastic_cup_lids", "Plastic cup lid", "plastic", "energy", "blue", 3, "Too small and too dirty for anyone to sort.", "Dry bin. It is burned for energy.", 6),
  item("plastic_detergent_bottles", "Detergent or shampoo bottle", "plastic", "recycle", "blue", 60, "Thick HDPE plastic is bought and recycled, and the bottle is sturdy enough to reuse.", "Rinse it and put the cap back on.", 2, "hdpe_container"),
  item("plastic_food_containers", "Plastic food container", "plastic", "recycle", "blue", 25, "Polypropylene is recyclable, but only when it is clean.", "Rinse off the oil and food. Greasy ones are rejected.", 5),
  item("plastic_shopping_bags", "Carry bag", "plastic", "energy", "blue", 6, "Thin film has almost no resale value, so it is not picked for recycling.", "Dry bin, clean and dry. Better still, reuse it until it tears.", 4),
  item("plastic_soda_bottles", "Soft drink bottle", "plastic", "recycle", "blue", 30, "PET is the most recycled plastic in India. It becomes fibre for clothes and new bottles.", "Empty it, crush it, cap on.", 1, "pet_bottle"),
  item("plastic_straws", "Plastic straw", "plastic", "energy", "blue", 1, "Single-use straws were banned in 2022 and are too small to sort.", "Dry bin. It is burned for energy.", 5),
  item("plastic_trash_bags", "Bin liner", "plastic", "energy", "blue", 15, "Dirty film cannot be recycled.", "Dry bin. Line the wet bin with newspaper instead.", 4),
  item("plastic_water_bottles", "Water bottle", "plastic", "recycle", "blue", 20, "PET is the most recycled plastic in India. It becomes fibre for clothes and new bottles.", "Empty it, crush it, cap on.", 1, "pet_bottle"),
  item("shoes", "Shoes", "textile", "upcycle", "donate", 400, "Shoes mix rubber, cloth and glue, so they cannot be recycled. A wearable pair should be worn.", "Tie the pair together and donate it. A cobbler can often repair them."),
  item("steel_food_cans", "Steel food can", "metal", "recycle", "blue", 50, "Steel is picked out with a magnet and melted down.", "Rinse it and push the sharp lid inside.", null, "metal_can"),
  item("styrofoam_cups", "Thermocol cup", "plastic", "energy", "blue", 3, "Thermocol is mostly air. Nobody in Delhi recycles it.", "Dry bin. It is burned for energy.", 6),
  item("styrofoam_food_containers", "Thermocol food box", "plastic", "energy", "blue", 8, "Thermocol is mostly air. Nobody in Delhi recycles it.", "Dry bin. It is burned for energy. Ask for foil or paper packing.", 6),
  item("tea_bags", "Tea bag or tea leaves", "organic", "compost", "green", 3, "Tea leaves compost well. Some bags have a plastic mesh, so loose leaves are better.", "Wet bin.", null, "organic"),
];
const ITEM_BY_KEY = new Map(ITEMS.map((i) => [i.key, i]));

/** The number inside the chasing-arrows triangle on a plastic item. */
export const RESINS = [
  { code: 1, short: "PET", name: "Polyethylene terephthalate", found: "Water and soft drink bottles, oil bottles, clear food jars", recycled: "widely", reuse: "Fine for cold water for a while. Not for hot liquids.", note: "The plastic scrap dealers want most. It becomes polyester fibre and new bottles." },
  { code: 2, short: "HDPE", name: "High-density polyethylene", found: "Shampoo and detergent bottles, jerry cans, milk cans, toys", recycled: "widely", reuse: "Sturdy and safe to reuse.", note: "Recycled into pipes, crates and new bottles." },
  { code: 3, short: "PVC", name: "Polyvinyl chloride", found: "Pipes, cables, tablet blister packs, cling film, raincoats", recycled: "rarely", reuse: "Keep it away from food and heat.", note: "Releases harmful fumes when burned. Rigid pipes are sometimes recycled, packaging almost never." },
  { code: 4, short: "LDPE", name: "Low-density polyethylene", found: "Milk pouches, carry bags, squeeze bottles, bubble wrap", recycled: "sometimes", reuse: "Safe to reuse as a bag.", note: "Clean milk pouches are bought and recycled. Thin dirty bags are not." },
  { code: 5, short: "PP", name: "Polypropylene", found: "Curd cups, takeaway boxes, bottle caps, buckets, straws", recycled: "sometimes", reuse: "The best plastic for reuse. Microwave only if the box says so.", note: "Recycled when it is clean. Wash off the oil first." },
  { code: 6, short: "PS", name: "Polystyrene", found: "Thermocol, disposable cups and plates, plastic cutlery", recycled: "rarely", reuse: "Do not reuse for hot food or drink.", note: "Bulky, light and worth nothing as scrap. Best avoided." },
  { code: 7, short: "Other", name: "Mixed and other plastics", found: "Chips and biscuit packets, tetra packs, water-cooler jars", recycled: "rarely", reuse: "Depends on the item.", note: "Layers of different plastics and foil cannot be separated. Most of it is burned for energy." },
] as const;

export const POINTS = { scan: 10, new_item: 5, resin: 5, guide: 5, quiz_right: 2, report: 5 };
export const DAILY_SCAN_CAP = 15;
export const LEVELS = [
  { n: 1, name: "Seed", at: 0 }, { n: 2, name: "Sprout", at: 50 }, { n: 3, name: "Seedling", at: 150 }, { n: 4, name: "Sapling", at: 300 },
  { n: 5, name: "Young tree", at: 500 }, { n: 6, name: "Tree", at: 800 }, { n: 7, name: "Grove", at: 1200 },
];

export function levelFor(points: number) {
  let i = 0;
  while (i + 1 < LEVELS.length && points >= LEVELS[i + 1].at) i++;
  const cur = LEVELS[i], next = LEVELS[i + 1] ?? null;
  return {
    n: cur.n, name: cur.name, floor: cur.at, next_at: next?.at ?? null, next_name: next?.name ?? null,
    to_next: next ? next.at - points : 0,
    progress: next ? (points - cur.at) / (next.at - cur.at) : 1,
  };
}

// A resident's day (daily cap, streak) turns over at midnight in Delhi, whatever time zone the database runs in.
const DAY = "(created_at AT TIME ZONE 'Asia/Kolkata')::date";
const TODAY = "(now() AT TIME ZONE 'Asia/Kolkata')::date";

export const catalogue = () => ({
  items: ITEMS, resins: RESINS, levels: LEVELS, points: POINTS, daily_scan_cap: DAILY_SCAN_CAP,
  zones: zones(), report_kinds: Object.entries(REPORT_KINDS).map(([key, k]) => ({ key, title: k.title })), reports_per_day: REPORTS_PER_DAY,
});

// ------------------------------------------------------------------ profile
function streakOf(days: string[], today: string) {
  const set = new Set(days);
  const d = new Date(`${today}T00:00:00Z`);
  // A streak is still alive if the last action was yesterday.
  if (!set.has(today)) d.setUTCDate(d.getUTCDate() - 1);
  let n = 0;
  while (set.has(d.toISOString().slice(0, 10))) { n++; d.setUTCDate(d.getUTCDate() - 1); }
  return n;
}

export async function profile(userId: number) {
  const tot = (await one<any>(`SELECT COALESCE(SUM(points),0)::int AS points,
      COUNT(*) FILTER (WHERE kind='scan')::int AS scans,
      COUNT(DISTINCT item) FILTER (WHERE kind='resin')::int AS resins,
      COUNT(DISTINCT item) FILTER (WHERE kind='guide')::int AS guides,
      COUNT(DISTINCT material) FILTER (WHERE kind='scan')::int AS materials,
      COUNT(*) FILTER (WHERE kind='quiz')::int AS quizzes,
      COUNT(*) FILTER (WHERE kind='quiz' AND method='5/5')::int AS perfect,
      COUNT(*) FILTER (WHERE kind='report')::int AS reports,
      COUNT(*) FILTER (WHERE kind='quiz' AND ${DAY} = ${TODAY})::int AS quiz_today,
      COUNT(*) FILTER (WHERE kind='scan' AND ${DAY} = ${TODAY})::int AS scans_today,
      to_char(${TODAY},'YYYY-MM-DD') AS today
    FROM citizen_actions WHERE user_id=$1`, [userId]))!;
  const days = await query<{ d: string }>(`SELECT DISTINCT to_char(${DAY},'YYYY-MM-DD') AS d FROM citizen_actions WHERE user_id=$1`, [userId]);
  const byMaterial = await query<any>("SELECT material, COUNT(*)::int AS n FROM citizen_actions WHERE user_id=$1 AND kind='scan' GROUP BY material ORDER BY n DESC", [userId]);
  const byItem = await query<any>("SELECT item, COUNT(*)::int AS n FROM citizen_actions WHERE user_id=$1 AND kind='scan' GROUP BY item ORDER BY n DESC LIMIT 4", [userId]);
  const byVerdict = await query<any>("SELECT verdict, COUNT(*)::int AS n FROM citizen_actions WHERE user_id=$1 AND kind='scan' GROUP BY verdict", [userId]);
  const recent = await query<any>("SELECT id, kind, item, material, verdict, points, method, created_at FROM citizen_actions WHERE user_id=$1 ORDER BY created_at DESC, id DESC LIMIT 8", [userId]);
  const grams = await query<any>("SELECT item, verdict, COUNT(*)::int AS n FROM citizen_actions WHERE user_id=$1 AND kind='scan' GROUP BY item, verdict", [userId]);
  const rank = await one<any>(`SELECT COUNT(*)::int + 1 AS rank FROM (SELECT user_id, SUM(points) AS p FROM citizen_actions GROUP BY user_id) x WHERE x.p > $1`, [tot.points]);

  const streak = streakOf(days.map((x) => x.d), tot.today);
  let sortedG = 0, keptG = 0;
  for (const g of grams) {
    const w = (ITEM_BY_KEY.get(g.item)?.grams ?? 0) * g.n;
    sortedG += w;
    if (g.verdict !== "energy" && g.verdict !== "hazard") keptG += w;
  }
  const badge = (key: string, name: string, how: string, have: number, need: number) => ({ key, name, how, have: Math.min(have, need), need, earned: have >= need });
  return {
    points: tot.points, level: levelFor(tot.points), streak, rank: tot.points > 0 ? rank!.rank : null,
    today: { scans: tot.scans_today, cap: DAILY_SCAN_CAP },
    counts: { scans: tot.scans, resins: tot.resins, guides: tot.guides, materials: tot.materials, quizzes: tot.quizzes, reports: tot.reports },
    quiz_done_today: tot.quiz_today > 0,
    by_material: byMaterial,
    by_verdict: Object.fromEntries(byVerdict.map((v: any) => [v.verdict, v.n])),
    top_items: byItem.map((r: any) => ({ item: r.item, name: ITEM_BY_KEY.get(r.item)?.name ?? r.item, n: r.n })),
    recent: recent.map((r: any) => ({ ...r, name: r.kind === "scan" ? ITEM_BY_KEY.get(r.item)?.name ?? r.item : r.item })),
    // Estimates from a typical weight per item. Nothing here was weighed.
    impact: { sorted_kg: Math.round(sortedG / 10) / 100, kept_from_landfill_kg: Math.round(keptG / 10) / 100 },
    badges: [
      badge("first", "First sort", "Sort your first item", tot.scans, 1),
      badge("ten", "Ten sorted", "Sort 10 items", tot.scans, 10),
      badge("fifty", "Fifty sorted", "Sort 50 items", tot.scans, 50),
      badge("allround", "All-rounder", "Sort items of 5 different materials", tot.materials, 5),
      badge("codes", "Code reader", "Look up all 7 plastic codes", tot.resins, 7),
      badge("maker", "Maker", "Read 3 upcycling ideas", tot.guides, 3),
      badge("week", "Week streak", "Sort something 7 days in a row", streak, 7),
      badge("quiz", "Quiz regular", "Finish the daily quiz 5 times", tot.quizzes, 5),
      badge("perfect", "Full marks", "Get all 5 right in a daily quiz", tot.perfect, 1),
      badge("neighbour", "Good neighbour", "Report a problem in your area", tot.reports, 1),
    ],
  };
}

// ------------------------------------------------------------------ actions
async function record(userId: number, row: Record<string, unknown>) {
  const before = (await one<any>("SELECT COALESCE(SUM(points),0)::int AS p FROM citizen_actions WHERE user_id=$1", [userId]))!.p;
  const earnedBefore = new Set((await profile(userId)).badges.filter((b) => b.earned).map((b) => b.key));
  const action = await insert<any>("citizen_actions", { user_id: userId, ...row });
  const p = await profile(userId);
  return {
    action, awarded: action.points as number, profile: p,
    level_up: p.level.n > levelFor(before).n ? p.level : null,
    new_badges: p.badges.filter((b) => b.earned && !earnedBefore.has(b.key)),
  };
}

export async function logScan(userId: number, itemKey: string, method: "photo" | "picked", confidence?: number) {
  const it = ITEM_BY_KEY.get(itemKey);
  if (!it) throw new HttpError(400, "Unknown item");
  const c = (await one<any>(`SELECT COUNT(*) FILTER (WHERE ${DAY} = ${TODAY})::int AS today, COUNT(*) FILTER (WHERE item=$2)::int AS seen
    FROM citizen_actions WHERE user_id=$1 AND kind='scan'`, [userId, itemKey]))!;
  const capped = c.today >= DAILY_SCAN_CAP;
  const isNew = c.seen === 0;
  const points = capped ? 0 : POINTS.scan + (isNew ? POINTS.new_item : 0);
  const out = await record(userId, { kind: "scan", item: it.key, material: it.material, verdict: it.verdict, points, method, confidence: confidence ?? null });
  return { ...out, item: it, new_item: isNew, capped };
}

export async function logResin(userId: number, code: number) {
  const r = RESINS.find((x) => x.code === code);
  if (!r) throw new HttpError(400, "Plastic codes run from 1 to 7");
  const seen = await one("SELECT 1 FROM citizen_actions WHERE user_id=$1 AND kind='resin' AND item=$2", [userId, String(code)]);
  if (seen) return { action: null, awarded: 0, profile: await profile(userId), level_up: null, new_badges: [], resin: r };
  return { ...(await record(userId, { kind: "resin", item: String(code), material: "plastic", verdict: null, points: POINTS.resin, method: "picked" })), resin: r };
}

export async function logGuide(userId: number, slug: string) {
  const seen = await one("SELECT 1 FROM citizen_actions WHERE user_id=$1 AND kind='guide' AND item=$2", [userId, slug]);
  if (seen) return { action: null, awarded: 0, profile: await profile(userId), level_up: null, new_badges: [] };
  return record(userId, { kind: "guide", item: slug, material: null, verdict: null, points: POINTS.guide, method: "picked" });
}

export async function leaderboard(range: "week" | "all", userId: number) {
  const since = range === "week" ? new Date(Date.now() - 7 * 86_400_000) : new Date(0);
  const rows = await query<any>(`SELECT u.id, u.name, u.organization,
      COALESCE(SUM(a.points) FILTER (WHERE a.created_at >= $1),0)::int AS points,
      COUNT(*) FILTER (WHERE a.kind='scan' AND a.created_at >= $1)::int AS items,
      SUM(a.points)::int AS total
    FROM users u JOIN citizen_actions a ON a.user_id=u.id
    GROUP BY u.id, u.name, u.organization
    HAVING COALESCE(SUM(a.points) FILTER (WHERE a.created_at >= $1),0) > 0
    ORDER BY points DESC, u.id LIMIT 50`, [since]);
  return {
    range,
    rows: rows.map((r, i) => ({ rank: i + 1, id: r.id, name: r.name, points: r.points, items: r.items, level: levelFor(r.total).n, level_name: levelFor(r.total).name, me: r.id === userId, demo: r.organization === DEMO_ORG })),
  };
}

// ------------------------------------------------------------------ daily quiz
const todayInDelhi = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
export const QUIZ_LENGTH = 5;

/** Five items for this person today: the same five all day, a different five tomorrow, never the same item twice. */
export function quizItems(userId: number, day = todayInDelhi()): Item[] {
  const r = rng(userId * 100_003 + Number(day.replaceAll("-", "")));
  const pool = [...ITEMS];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, QUIZ_LENGTH);
}

async function quizToday(userId: number) {
  return one<any>(`SELECT points, method FROM citizen_actions WHERE user_id=$1 AND kind='quiz' AND ${DAY} = ${TODAY}`, [userId]);
}

export async function quiz(userId: number) {
  const done = await quizToday(userId);
  return { day: todayInDelhi(), items: quizItems(userId).map((i) => i.key), done: done ? { score: Number(String(done.method).split("/")[0]), points: done.points } : null, points_per_right: POINTS.quiz_right };
}

/** Grades today's quiz. Points are given once a day; a second try is graded but earns nothing. */
export async function submitQuiz(userId: number, answers: Record<string, Bin>) {
  const items = quizItems(userId);
  const results = items.map((it) => ({ item: it.key, answer: answers[it.key] ?? null, bin: it.bin, right: answers[it.key] === it.bin }));
  const score = results.filter((r) => r.right).length;
  const done = await quizToday(userId);
  if (done) return { action: null, awarded: 0, profile: await profile(userId), level_up: null, new_badges: [], score, results, already: true };
  const out = await record(userId, { kind: "quiz", item: todayInDelhi(), material: null, verdict: null, points: score * POINTS.quiz_right, method: `${score}/${QUIZ_LENGTH}` });
  return { ...out, score, results, already: false };
}

// ------------------------------------------------------------------ drop-off points
const DEFAULT_ZONE = "Central Zone"; // the demo resident lives in Lajpat Nagar
export const zones = () => ZONES.map((z) => ({ name: z.name, ref: z.ref, lat: z.lat, lng: z.lng }));

function nearestZone(p: { lat: number; lng: number }) {
  return ZONES.reduce((best, z) => (haversineKm(p, z) < haversineKm(p, best) ? z : best), ZONES[0]);
}

/** What each partner category means for a household. */
const PARTNER_TAKES: Record<string, string[]> = {
  textile: ["textile"], glass_container: ["glass"], pet_bottle: ["plastic"], hdpe_container: ["plastic"], cardboard: ["paper"],
};

/**
 * Places a resident can take things to, nearest first: material recovery facilities (dry recyclables),
 * upcycling workshops (clothes, jars, bottles, boxes) and the authorised battery recycler.
 * Distances are straight-line from the zone's reference locality or the person's own location.
 */
export async function dropoffs(at: { lat?: number; lng?: number; zone?: string }) {
  const here = at.lat != null && at.lng != null ? { lat: at.lat, lng: at.lng } : (ZONES.find((z) => z.name === at.zone) ?? ZONES.find((z) => z.name === DEFAULT_ZONE)!);
  const zone = at.lat != null && at.lng != null ? nearestZone(here).name : (ZONES.find((z) => z.name === at.zone)?.name ?? DEFAULT_ZONE);
  const mrfs = await query<any>("SELECT code, label, name, lat, lng, capacity_tpd, status FROM facilities WHERE technology='material_recovery' AND status <> 'offline'");
  const partners = await query<any>("SELECT code, name, kind, lat, lng, prices, products, is_simulated FROM circular_partners WHERE status='active'");
  const places = [
    ...mrfs.map((f) => ({ code: f.code, name: f.label, detail: f.name, kind: "mrf", takes: ["paper", "plastic", "metal"], products: null as string | null, example: false, lat: f.lat, lng: f.lng })),
    ...partners.map((p) => ({
      code: p.code, name: String(p.name).split(/\s+[—-]\s+/)[0], detail: String(p.name).replace(/\s+[—-]\s+/, ", "),
      kind: p.kind === "battery_recycler" ? "battery" : "upcycler",
      takes: p.kind === "battery_recycler" ? ["battery"] : [...new Set(Object.keys(p.prices ?? {}).flatMap((k) => PARTNER_TAKES[k] ?? []))],
      products: p.products as string | null, example: !!p.is_simulated, lat: p.lat, lng: p.lng,
    })),
  ].map((x) => ({ ...x, km: Math.round(haversineKm(here, x) * 10) / 10 }))
    .filter((x) => x.km <= 40) // Delhi only; the Panipat cluster takes bulk loads, not households
    .sort((a, b) => a.km - b.km);
  return { zone, from: here, places };
}

// ------------------------------------------------------------------ problem reports
export const REPORT_KINDS = {
  overflowing_bin: { title: "Overflowing bin", severity: "warning" },
  missed_collection: { title: "Missed collection", severity: "warning" },
  dumping: { title: "Waste dumped in the open", severity: "warning" },
  burning: { title: "Waste being burned", severity: "critical" },
  other: { title: "Something else", severity: "info" },
} as const;
export type ReportKind = keyof typeof REPORT_KINDS;
export const REPORTS_PER_DAY = 5;

export async function createReport(userId: number, b: { kind: ReportKind; zone?: string; lat?: number; lng?: number; note?: string }, photo?: { body: Buffer; ext: string; type: string }) {
  const today = (await one<any>(`SELECT COUNT(*)::int AS n FROM citizen_reports WHERE user_id=$1 AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = ${TODAY}`, [userId]))!.n;
  if (today >= REPORTS_PER_DAY) throw new HttpError(429, `You can send up to ${REPORTS_PER_DAY} reports a day`);
  const zone = b.lat != null && b.lng != null ? nearestZone({ lat: b.lat, lng: b.lng }).name : ZONES.find((z) => z.name === b.zone)?.name;
  if (!zone) throw new HttpError(400, "Pick your area");
  let image_key: string | null = null;
  if (photo) {
    image_key = `uploads/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${photo.ext}`;
    await putObject(image_key, photo.body, photo.type);
  }
  const note = b.note?.trim() || null;
  const k = REPORT_KINDS[b.kind];
  const rep = await insert<any>("citizen_reports", { user_id: userId, kind: b.kind, zone, lat: b.lat ?? null, lng: b.lng ?? null, note, image_key });
  const alert = await raiseAlert({
    severity: k.severity, type: "resident_report", title: `Resident report: ${k.title.toLowerCase()}`,
    message: `Reported in ${zone}.${note ? ` ${note}` : ""}`, entity_type: "citizen_report", entity_id: rep.id,
  });
  await query("UPDATE citizen_reports SET alert_id=$2 WHERE id=$1", [rep.id, alert?.id ?? null]);
  // Points for the first report of the day only, so reporting stays about the problem.
  const points = today === 0 ? POINTS.report : 0;
  const out = await record(userId, { kind: "report", item: b.kind, material: null, verdict: null, points, method: "picked" });
  return { ...out, report: { ...rep, alert_id: alert?.id ?? null, status: "open" } };
}

export async function myReports(userId: number) {
  return query<any>(`SELECT r.id, r.kind, r.zone, r.note, r.image_key IS NOT NULL AS has_photo, r.created_at, COALESCE(a.status, 'open') AS status
    FROM citizen_reports r LEFT JOIN alerts a ON a.id = r.alert_id WHERE r.user_id=$1 ORDER BY r.created_at DESC, r.id DESC LIMIT 20`, [userId]);
}

export async function reportPhotoKey(id: number) {
  return (await one<{ image_key: string | null }>("SELECT image_key FROM citizen_reports WHERE id=$1", [id]))?.image_key ?? null;
}

// ------------------------------------------------------------------ demo data
export const DEMO_EMAIL = "resident@wattcycle.demo";
const DEMO_ORG = "Demo neighbour";
const NEIGHBOURS = ["Kavya Menon", "Arjun Bhatia", "Sana Qureshi", "Rohan Das", "Neha Kulkarni", "Farhan Ali", "Divya Pillai", "Karan Sethi", "Lakshmi Iyer"];

/**
 * The demo resident's history before today: three different items over the last two days, 45 points.
 * Any item sorted in the demo then crosses 50 points, so the plant visibly grows into a Sprout.
 */
export const DEMO_BASELINE = [
  { item: "newspaper", daysAgo: 2 },
  { item: "food_waste", daysAgo: 2 },
  { item: "aluminum_soda_cans", daysAgo: 1 },
] as const;

/** mulberry32: the same demo data on every run */
function rng(seed: number) {
  let s = seed;
  return () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

async function insertScans(userId: number, scans: { item: Item; when: Date }[]) {
  if (!scans.length) return;
  const seen = new Set<string>(); const vals: unknown[] = []; const rows: string[] = [];
  for (const { item: it, when } of [...scans].sort((a, b) => a.when.getTime() - b.when.getTime())) {
    const pts = POINTS.scan + (seen.has(it.key) ? 0 : POINTS.new_item);
    seen.add(it.key);
    const b = vals.length;
    rows.push(`($${b + 1},'scan',$${b + 2},$${b + 3},$${b + 4},$${b + 5},'picked',$${b + 6})`);
    vals.push(userId, it.key, it.material, it.verdict, pts, when);
  }
  await query(`INSERT INTO citizen_actions (user_id, kind, item, material, verdict, points, method, created_at) VALUES ${rows.join(",")}`, vals);
}

async function writeBaseline(userId: number) {
  await insertScans(userId, DEMO_BASELINE.map((b) => ({ item: ITEM_BY_KEY.get(b.item)!, when: new Date(Date.now() - b.daysAgo * 86_400_000) })));
}

/** Simulated neighbours, always active over the last three weeks, so this week's leaderboard is never empty in a demo. */
async function refreshNeighbours() {
  const ns = await query<{ id: number }>("SELECT id FROM users WHERE organization=$1 ORDER BY id", [DEMO_ORG]);
  if (!ns.length) return;
  await query("DELETE FROM citizen_actions WHERE user_id = ANY($1::int[])", [ns.map((n) => n.id)]);
  const r = rng(20261011);
  for (const n of ns) {
    const count = 6 + Math.floor(r() * 60);
    await insertScans(n.id, Array.from({ length: count }, () => ({ item: ITEMS[Math.floor(r() * ITEMS.length)], when: new Date(Date.now() - r() * 21 * 86_400_000) })));
  }
}

/** Adds the resident demo account and a few simulated neighbours for the leaderboard. Safe to call on every start. */
export async function seedResidents() {
  let created = false;
  if (!(await one("SELECT 1 FROM users WHERE email=$1", [DEMO_EMAIL]))) {
    const hash = await bcrypt.hash("demo1234", 10);
    const me = await insert<any>("users", { email: DEMO_EMAIL, password_hash: hash, name: "Asha Verma", role: "citizen", organization: "Lajpat Nagar, Delhi (demo account)" });
    for (const [i, name] of NEIGHBOURS.entries()) {
      // "!" is not a bcrypt hash, so nobody can log in as a simulated neighbour.
      await insert("users", { email: `neighbour${i + 1}@wattcycle.demo`, password_hash: "!", name, role: "citizen", organization: DEMO_ORG });
    }
    await writeBaseline(me.id);
    created = true;
  }
  // A database seeded days ago would otherwise show an empty "this week" board.
  const last = await one<{ t: string | null }>("SELECT max(a.created_at) AS t FROM citizen_actions a JOIN users u ON u.id=a.user_id WHERE u.organization=$1", [DEMO_ORG]);
  if (created || !last?.t || Date.now() - new Date(last.t).getTime() > 2 * 86_400_000) await refreshNeighbours();
  return created;
}

/** Puts the demo resident back at the start of the demo story. Only the demo account can be reset. */
export async function resetDemo(user: { id: number; email: string }) {
  if (user.email.toLowerCase() !== DEMO_EMAIL) throw new HttpError(403, "The demo runs on the demo resident account only");
  await query("DELETE FROM citizen_actions WHERE user_id=$1", [user.id]);
  await query("DELETE FROM citizen_reports WHERE user_id=$1", [user.id]);
  await writeBaseline(user.id);
  await refreshNeighbours();
  return profile(user.id);
}
