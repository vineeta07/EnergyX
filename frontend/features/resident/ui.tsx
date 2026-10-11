"use client";
import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { create } from "zustand";
import { House, Lightbulb, ScanLine, Recycle, Trophy, Award, Sprout } from "lucide-react";
import { cx } from "@/lib/format";
import { t } from "@/lib/i18n";
import { MATERIAL_COLOR, type Reward } from "@/lib/resident";
import { useResidentDemo } from "./demo";

/** Soft, roomy card used across the resident screens. */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("rounded-2xl border border-line bg-panel p-5 shadow-[var(--shadow)]", className)}>{children}</section>;
}

export function MaterialDot({ material, className = "size-2.5" }: { material: string | null; className?: string }) {
  return <span className={cx("inline-block shrink-0 rounded-full", className)} style={{ background: MATERIAL_COLOR[material ?? ""] ?? "var(--line-2)" }} />;
}

// ---------------------------------------------------------------- points toast
const useToast = create<{ r: Reward | null; show: (r: Reward) => void; hide: () => void }>((set) => ({
  r: null,
  show: (r) => { if (r.awarded > 0 || r.level_up || r.new_badges.length) set({ r }); },
  hide: () => set({ r: null }),
}));
export const showReward = (r: Reward) => useToast.getState().show(r);

function RewardToast() {
  const { r, hide } = useToast();
  // During the demo its panel sits at the bottom, so rewards appear at the top instead.
  const demoOpen = useResidentDemo((s) => s.open);
  useEffect(() => {
    if (!r) return;
    const id = setTimeout(hide, r.level_up || r.new_badges.length ? 5200 : 3000);
    return () => clearTimeout(id);
  }, [r, hide]);
  if (!r) return null;
  return (
    <div className={cx("pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4", demoOpen ? "top-16" : "bottom-24 lg:bottom-8")} role="status" aria-live="polite">
      <button onClick={hide} className="reward-pop pointer-events-auto flex max-w-sm items-center gap-3 rounded-2xl border border-line-2 bg-panel px-4 py-3 text-left shadow-[var(--popover-shadow)]">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-dim text-accent">{r.new_badges.length && !r.level_up ? <Award className="size-5" /> : <Sprout className="size-5" />}</span>
        <span className="min-w-0 text-sm">
          {r.awarded > 0 && <span className="block font-medium text-ink">{t("+{n} points", { n: r.awarded })}</span>}
          {r.level_up && <span className="block text-ink-2">{t("You grew into a {name}.", { name: t(r.level_up.name) })}</span>}
          {r.new_badges.map((b) => <span key={b.key} className="block text-ink-2">{t("New badge: {name}", { name: t(b.name) })}</span>)}
        </span>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- page frame
const TABS = [
  { href: "/home", label: "Home", icon: House },
  { href: "/ideas", label: "Ideas", icon: Lightbulb },
  { href: "/scan", label: "Scan", icon: ScanLine, main: true },
  { href: "/resin", label: "Codes", icon: Recycle },
  { href: "/leaderboard", label: "Ranks", icon: Trophy },
];

/** Bottom bar on phones. On wide screens the sidebar already lists these screens. */
function Tabs() {
  const path = usePathname();
  return (
    <nav data-tour="nav" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-panel pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label={t("Resident app")}>
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {TABS.map((x) => {
          const active = path.startsWith(x.href);
          return (
            <li key={x.href}>
              <Link href={x.href} aria-current={active ? "page" : undefined} className={cx("flex flex-col items-center gap-0.5 py-2 text-[11px]", active ? "text-accent" : "text-ink-3")}>
                {x.main
                  ? <span className="-mt-6 grid size-12 place-items-center rounded-full bg-accent text-on-accent shadow-[var(--popover-shadow)]"><x.icon className="size-5" /></span>
                  : <x.icon className="size-5" />}
                <span>{t(x.label)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function ResidentPage({ title, subtitle, actions, children, wide }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cx("mx-auto space-y-5 pb-24 lg:pb-4", wide ? "max-w-5xl" : "max-w-3xl")}>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-serif text-[28px] font-medium leading-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-1.5 max-w-xl text-[15px] leading-relaxed text-ink-2">{subtitle}</p>}
        </div>
        {actions}
      </header>
      {children}
      <Tabs />
      <RewardToast />
    </div>
  );
}

/** Big friendly button for the main action on a screen. */
export function BigButton({ children, className, tone = "primary", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "primary" | "quiet" }) {
  return (
    <button {...rest} className={cx("inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-medium transition-colors disabled:opacity-50",
      tone === "primary" ? "bg-accent text-on-accent hover:opacity-90" : "border border-line-2 bg-panel text-ink hover:border-ink-3", className)}>
      {children}
    </button>
  );
}
