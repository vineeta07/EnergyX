"use client";
import { create } from "zustand";
import type { QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { t } from "@/lib/i18n";
import { IDEAS } from "@/lib/ideas";
import { BIN, RECYCLED_LABEL, VERDICT, type Catalogue, type Item, type Profile, type Reward } from "@/lib/resident";

/**
 * "Play the demo" for residents. Like "Run a full load" for operators, every step calls the real API
 * (photo model, points, plastic codes, ideas, leaderboard) and the app moves through the real screens.
 * It runs only on the demo resident account, which the server resets to 45 points at the start.
 */
export const DEMO_EMAIL = "resident@wattcycle.demo";
/** Public-domain photo bundled with the app (see public/demo/README.md). */
export const DEMO_PHOTO = "/demo/plastic-bottle.jpg";
/** Used when the photo model is not running: the demo picks the item instead, as a resident would. */
const FALLBACK_ITEM = "plastic_water_bottles";

export type DemoStepKey = "reset" | "photo" | "result" | "count" | "code" | "idea" | "rank" | "home";
export const DEMO_STEPS: { key: DemoStepKey; title: string }[] = [
  { key: "reset", title: "Fresh start" },
  { key: "photo", title: "Photo taken" },
  { key: "result", title: "Item recognised" },
  { key: "count", title: "Points added" },
  { key: "code", title: "Plastic code" },
  { key: "idea", title: "Upcycling idea" },
  { key: "rank", title: "Leaderboard" },
  { key: "home", title: "Back home" },
];

type LogReply = Reward & { item: Item; new_item: boolean; capped: boolean };
type ScanReply = { mode: "photo"; guesses: { item: Item; p: number }[]; unsure: boolean } | { mode: "manual"; reason: string };

/** What the scan screen shows while the demo drives it. */
export interface DemoScan { photo: string | null; looking: boolean; guesses: { item: Item; p: number }[]; chosen: Item | null; unsure: boolean; reply: LogReply | null }

interface DemoState {
  open: boolean;
  running: boolean;
  /** Changes on every start and stop, so a stopped run can tell it is no longer wanted. */
  run: number;
  /** Index of the active step in DEMO_STEPS; -1 before the first. */
  at: number;
  notes: Partial<Record<DemoStepKey, string>>;
  error: string | null;
  done: boolean;
  scan: DemoScan | null;
  summary: { gained: number; from: Profile; to: Profile } | null;
}

const IDLE: Omit<DemoState, "run"> = { open: false, running: false, at: -1, notes: {}, error: null, done: false, scan: null, summary: null };
export const useResidentDemo = create<DemoState>()(() => ({ ...IDLE, run: 0 }));

export function stopResidentDemo() {
  useResidentDemo.setState((s) => ({ running: false, run: s.run + 1, scan: null }));
}
export function closeResidentDemo() {
  useResidentDemo.setState((s) => ({ ...IDLE, run: s.run + 1 }));
}

class Stopped extends Error {}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function scanSample(): Promise<ScanReply> {
  const res = await fetch(DEMO_PHOTO);
  const blob = await res.blob();
  if (!res.ok || !blob.type.startsWith("image/")) throw new Error("no sample photo");
  const form = new FormData();
  form.append("file", blob, "plastic-bottle.jpg");
  return api.upload<ScanReply>("/citizen/scan", form);
}

/** Start (or restart) the resident demo. `show` pops the points toast; it lives with the resident page frame. */
export async function startResidentDemo(ctx: { push: (href: string) => void; qc: QueryClient; show: (r: Reward) => void }) {
  const run = useResidentDemo.getState().run + 1;
  useResidentDemo.setState({ ...IDLE, open: true, running: true, run });
  const alive = () => { const s = useResidentDemo.getState(); return s.running && s.run === run; };
  const pause = async (ms: number) => { await sleep(ms); if (!alive()) throw new Stopped(); };
  const begin = (key: DemoStepKey) => { if (!alive()) throw new Stopped(); useResidentDemo.setState({ at: DEMO_STEPS.findIndex((s) => s.key === key) }); };
  const note = (key: DemoStepKey, text: string) => { if (alive()) useResidentDemo.setState((s) => ({ notes: { ...s.notes, [key]: text } })); };
  const setScan = (patch: Partial<DemoScan>) => { if (alive()) useResidentDemo.setState((s) => ({ scan: { ...(s.scan ?? { photo: null, looking: false, guesses: [], chosen: null, unsure: false, reply: null }), ...patch } })); };
  const reward = (r: Reward) => {
    ctx.qc.setQueryData(["resident", "me"], r.profile);
    ctx.qc.invalidateQueries({ queryKey: ["resident", "leaderboard"] });
    if (alive()) ctx.show(r);
  };
  const plus = (n: number) => (n > 0 ? ` ${t("+{n} points.", { n })}` : "");

  try {
    // 1. Fresh start: the server puts the demo account back at 45 points (a seed) and refreshes the neighbours.
    begin("reset");
    const from = await api.post<Profile>("/citizen/demo/reset");
    ctx.qc.setQueryData(["resident", "me"], from);
    ctx.qc.invalidateQueries({ queryKey: ["resident", "leaderboard"] });
    ctx.push("/home");
    note("reset", t("Back to {n} points and a {name}. Rank {r} this week.", { n: from.points, name: t(from.level.name).toLowerCase(), r: from.rank ?? "–" }));
    await pause(3400);

    // 2. A photo of a bottle goes to the image model.
    begin("photo");
    setScan({ photo: DEMO_PHOTO, looking: true });
    ctx.push("/scan");
    let guesses: { item: Item; p: number }[] = [];
    let unsure = false;
    try {
      // A missing photo or a slow, busy model must not stall the demo: after 10 s it picks the item instead.
      const r = await Promise.race([scanSample(), sleep(10_000).then(() => null)]);
      if (r && r.mode === "photo" && r.guesses.length) { guesses = r.guesses; unsure = r.unsure; }
    } catch { /* falls back to picking the item below */ }
    const byPhoto = guesses.length > 0;
    if (!byPhoto) {
      const cat = await ctx.qc.fetchQuery({ queryKey: ["resident", "catalogue"], queryFn: () => api.get<Catalogue>("/citizen/catalogue"), staleTime: Infinity });
      const item = cat.items.find((i) => i.key === FALLBACK_ITEM)!;
      guesses = [{ item, p: 1 }];
      setScan({ photo: null });
    }
    await pause(1800); // long enough to see the photo being read
    note("photo", byPhoto ? t("A sample photo of a plastic bottle went to the image model.") : t("The image model is not running, so the bottle was picked from the list instead."));

    // 3. What it is and where it goes.
    begin("result");
    const top = guesses[0];
    setScan({ looking: false, guesses, chosen: top.item, unsure });
    const v = VERDICT[top.item.verdict];
    note("result", `${t(top.item.name)}${byPhoto ? ` (${Math.round(top.p * 100)}%)` : ""}: ${t(v.title)}. ${t(BIN[top.item.bin])}.`);
    await pause(4200);

    // 4. Counted: points, and the plant grows past 50.
    begin("count");
    const counted = await api.post<LogReply>("/citizen/log", { item: top.item.key, method: byPhoto ? "photo" : "picked", confidence: byPhoto ? top.p : undefined });
    reward(counted);
    setScan({ reply: counted });
    note("count", counted.level_up ? `${t("+{n} points.", { n: counted.awarded })} ${t("The plant grew into a {name}.", { name: t(counted.level_up.name).toLowerCase() })}` : t("+{n} points.", { n: counted.awarded }));
    await pause(4200);

    // 5. Its plastic code.
    begin("code");
    const code = top.item.resin ?? 1;
    const coded = await api.post<Reward & { resin: { short: string; recycled: keyof typeof RECYCLED_LABEL } }>("/citizen/resin", { code });
    reward(coded);
    ctx.push(`/resin?code=${code}`);
    note("code", `${t("Code {n} is {short}: {how}.", { n: code, short: coded.resin.short, how: t(RECYCLED_LABEL[coded.resin.recycled]).toLowerCase() })}${plus(coded.awarded)}`);
    await pause(4000);

    // 6. Something to make from it.
    begin("idea");
    const idea = IDEAS.find((i) => i.category === top.item.ideas) ?? IDEAS[0];
    const read = await api.post<Reward>("/citizen/guide", { slug: idea.slug });
    reward(read);
    ctx.push(`/ideas?read=${idea.slug}`);
    note("idea", `${t("Opened an idea: {title}.", { title: idea.title })}${plus(read.awarded)}`);
    await pause(4400);

    // 7. The leaderboard has moved.
    begin("rank");
    ctx.push("/leaderboard");
    const to = read.profile;
    note("rank", from.rank && to.rank && to.rank < from.rank ? t("Up from rank {a} to rank {b} this week.", { a: from.rank, b: to.rank }) : t("Rank {n} this week.", { n: to.rank ?? "–" }));
    await pause(4000);

    // 8. Home again, with a bigger plant.
    begin("home");
    ctx.push("/home");
    const gained = to.points - from.points;
    note("home", t("{n} points earned in this demo. {p} points in total.", { n: gained, p: to.points }));
    useResidentDemo.setState({ running: false, done: true, scan: null, summary: { gained, from, to }, at: DEMO_STEPS.length });
  } catch (e) {
    if (e instanceof Stopped || !alive()) return;
    useResidentDemo.setState({ running: false, error: (e as Error).message, scan: null });
  }
}
