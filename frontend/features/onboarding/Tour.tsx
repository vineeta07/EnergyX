"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { create } from "zustand";
import { useAuth, type Role } from "@/store/auth";
import { LANGS, t, useLang } from "@/lib/i18n";
import { Button } from "@/components/ui";
import { cx } from "@/lib/format";

interface Step {
  target?: string;             // value of data-tour on the element to point at; no target means a centred card
  title: string;
  body: string;
  roles?: Role[];
  language?: boolean;          // show the language picker inside the card
}

const STEPS: Step[] = [
  { title: "Welcome to WattCycle", body: "This is a short tour of the screens you will use most. Pick the language you want to read it in. You can change it later from the top bar.", language: true },
  { target: "nav", title: "Your menu", body: "Every screen you can open is listed here. The list follows your role, so a hub operator and a fleet operator see different things." },
  { target: "kpis", title: "Today's figures", body: "Waste waiting, waste collected this week, loads at the hubs, energy made, CO₂ avoided and routes on the road. Click any of them to open the detail." },
  { target: "map", title: "The network map", body: "Sources, trucks, hubs and plants on one map. Trucks move as their GPS updates. Click a dot to see its name and load." },
  { target: "run", title: "Run one full load", body: "This runs a single load through every stage: pickup, weighing, sorting, choosing a plant, delivery and the meter reading. It takes about 25 seconds.", roles: ["admin", "hub", "fleet"] },
  { target: "assistant", title: "Ask in plain words", body: "For example, which plant took the most organic waste this week. Every answer lists the data it used." },
  { target: "alerts", title: "Alerts", body: "A red number means something needs a person: a full bin, a late truck, a plant that went offline." },
  { target: "language", title: "Language and theme", body: "Switch between English, Hindi, Bengali, Tamil and Punjabi here. The moon button changes between light and dark." },
  { title: "That is all", body: "You can play this tour again any time from the question mark in the top bar." },
];

interface TourState {
  active: boolean;
  step: number;
  start: () => void;
  go: (i: number) => void;
  stop: () => void;
}
export const useTour = create<TourState>()((set) => ({
  active: false,
  step: 0,
  start: () => set({ active: true, step: 0 }),
  go: (step) => set({ step }),
  stop: () => set({ active: false }),
}));

const key = (uid: number | string) => `wattcycle-tour-${uid}`;
const seen = (uid: number | string) => { try { return localStorage.getItem(key(uid)) === "done"; } catch { return true; } };
const markSeen = (uid: number | string) => { try { localStorage.setItem(key(uid), "done"); } catch { /* ignore */ } };

function findTarget(name?: string): HTMLElement | null {
  if (!name) return null;
  const els = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`));
  return els.find((e) => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0) ?? null;
}

const PAD = 6;
const CARD_W = 340;

export function Tour() {
  const user = useAuth((s) => s.user);
  const { active, step } = useTour();
  const lang = useLang((s) => s.lang);
  const setLang = useLang((s) => s.setLang);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [cardH, setCardH] = useState(220);
  const card = useRef<HTMLDivElement>(null);
  const next = useRef<HTMLButtonElement>(null);

  // First visit for this account: wait until the shell (and the dashboard figures, if that is the page) are on screen, then start.
  useEffect(() => {
    if (!user || active || seen(user.id)) return;
    const began = Date.now();
    const id = setInterval(() => {
      if (seen(user.id)) return clearInterval(id);
      const ready = findTarget("nav") && (!location.pathname.startsWith("/dashboard") || findTarget("kpis"));
      if (ready || Date.now() - began > 8000) { clearInterval(id); useTour.getState().start(); }
    }, 300);
    return () => clearInterval(id);
  }, [user, active]);

  const visible = useCallback((i: number) => {
    const s = STEPS[i];
    if (!s) return false;
    if (s.roles && user && !s.roles.includes(user.role)) return false;
    return !s.target || !!findTarget(s.target);
  }, [user]);

  const move = useCallback((from: number, dir: 1 | -1) => {
    let i = from + dir;
    while (i >= 0 && i < STEPS.length && !visible(i)) i += dir;
    return i;
  }, [visible]);

  const finish = useCallback(() => {
    if (user) markSeen(user.id);
    useTour.getState().stop();
  }, [user]);

  // Make sure the first step we land on can actually be shown.
  useEffect(() => { if (active && !visible(step)) { const i = move(step, 1); if (i < STEPS.length) useTour.getState().go(i); else finish(); } }, [active, step, visible, move, finish]);

  const s = STEPS[step];

  const measure = useCallback(() => {
    const el = s?.target ? findTarget(s.target) : null;
    setRect(el ? el.getBoundingClientRect() : null);
    if (card.current) setCardH(card.current.offsetHeight);
  }, [s]);

  useLayoutEffect(() => {
    if (!active || !s) return;
    const el = s.target ? findTarget(s.target) : null;
    el?.scrollIntoView({ block: "center", behavior: "auto" });
    const raf = requestAnimationFrame(measure);
    const id = setTimeout(measure, 120);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => { cancelAnimationFrame(raf); clearTimeout(id); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [active, s, measure, lang]);

  useEffect(() => { if (active) next.current?.focus(); }, [active, step]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, step]);

  if (!active || !s || !user) return null;

  const total = STEPS.filter((_, i) => visible(i)).length;
  const position = STEPS.slice(0, step + 1).filter((_, i) => visible(i)).length;
  const last = move(step, 1) >= STEPS.length;
  const first = move(step, -1) < 0;

  function go(dir: 1 | -1) {
    const i = move(useTour.getState().step, dir);
    if (i >= STEPS.length) finish();
    else if (i >= 0) useTour.getState().go(i);
  }

  // Place the card beside the target when there is room, otherwise below or above; centre it when there is no target.
  const vw = typeof window === "undefined" ? 1200 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const w = Math.min(CARD_W, vw - 24);
  let left = (vw - w) / 2;
  let top = (vh - cardH) / 2;
  if (rect) {
    const below = rect.bottom + PAD + 12;
    const above = rect.top - PAD - 12 - cardH;
    const rightSide = rect.right + PAD + 12;
    if (rightSide + w <= vw - 12 && rect.width < vw * 0.4) { left = rightSide; top = Math.min(Math.max(12, rect.top), vh - cardH - 12); }
    else if (below + cardH <= vh - 12) { top = below; left = Math.min(Math.max(12, rect.left), vw - w - 12); }
    else if (above >= 12) { top = above; left = Math.min(Math.max(12, rect.left), vw - w - 12); }
    else { top = Math.max(12, vh - cardH - 12); left = Math.min(Math.max(12, rect.left), vw - w - 12); }
  }

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {rect ? (
        <div className="pointer-events-none fixed rounded-md border border-ink-2" style={{ left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2, boxShadow: "0 0 0 9999px rgba(24, 19, 12, 0.55)" }} />
      ) : (
        <div className="fixed inset-0 bg-[rgba(24,19,12,0.55)]" />
      )}
      <div ref={card} className="fixed rounded-lg border border-line-2 bg-panel p-5 shadow-[var(--popover-shadow)]" style={{ left, top, width: w }}>
        <div className="num text-xs text-ink-3">{t("Step {a} of {b}", { a: position, b: total })}</div>
        <h2 id="tour-title" className="mt-1 font-serif text-xl font-medium text-ink">{t(s.title)}</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">{t(s.body)}</p>
        {s.language && (
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t("Language")}>
            {LANGS.map((l) => (
              <button key={l.code} onClick={() => setLang(l.code)} aria-pressed={l.code === lang}
                className={cx("h-8 rounded-md border px-3 text-sm", l.code === lang ? "border-accent bg-accent/10 text-ink" : "border-line-2 text-ink-2 hover:border-ink-3")}>{l.label}</button>
            ))}
          </div>
        )}
        <div className="mt-5 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={finish}>{t("Skip tour")}</Button>
          <div className="flex gap-2">
            {!first && <Button size="sm" onClick={() => go(-1)}>{t("Back")}</Button>}
            <button ref={next} onClick={() => go(1)} className="inline-flex h-7 items-center rounded-md border border-accent bg-accent px-3 text-xs font-medium text-on-accent hover:opacity-90">{last ? t("Finish") : t("Next")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
