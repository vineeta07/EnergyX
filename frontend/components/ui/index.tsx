"use client";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import Link from "next/link";
import { Loader2, AlertTriangle, Info, OctagonAlert, CheckCircle2 } from "lucide-react";
import { cx } from "@/lib/format";
import { t, tEnum } from "@/lib/i18n";

export function Panel({ title, subtitle, actions, children, className, bodyClass, id }: {
  title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string; id?: string;
}) {
  return (
    <section id={id} className={cx("min-w-0 rounded-xl border border-line bg-panel shadow-[var(--shadow)]", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-ink-3">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cx("overflow-x-auto p-4", bodyClass)}>{children}</div>
    </section>
  );
}

/** One figure with a caption. `accent` marks energy output, which is the one number shown in marigold. */
export function Kpi({ label, value, unit, sub, icon, accent, href }: { label: string; value: ReactNode; unit?: string; sub?: ReactNode; icon?: ReactNode; accent?: boolean; href?: string }) {
  const body = (
    <div className={cx("group h-full rounded-xl border bg-panel px-4 py-3 shadow-[var(--shadow)] transition-all duration-200", "border-line", href && "hover:-translate-y-0.5 hover:border-line-2 hover:shadow-[var(--popover-shadow)]")}>
      <div className="flex items-center justify-between gap-2 text-xs text-ink-3">
        <span>{label}</span>
        {icon && <span className="text-ink-3">{icon}</span>}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className={cx("num text-2xl font-medium", accent ? "text-gold" : "text-ink")}>{value}</span>
        {unit && <span className="text-xs text-ink-3">{unit}</span>}
      </div>
      {sub && <div className="mt-1 text-xs text-ink-3">{sub}</div>}
    </div>
  );
  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}

const TONES = {
  neutral: "border-line-2 text-ink-2 bg-raised",
  green: "border-accent/35 text-accent bg-accent/10",
  blue: "border-blue/35 text-blue bg-blue/10",
  gold: "border-gold/35 text-gold bg-gold/10",
  warn: "border-warn/35 text-warn bg-warn/10",
  crit: "border-crit/40 text-crit bg-crit/10",
};
export type Tone = keyof typeof TONES;

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-xs", TONES[tone], className)}>{children}</span>;
}

const STATUS_TONE: Record<string, Tone> = {
  REQUESTED: "neutral", ASSIGNED: "blue", EN_ROUTE: "blue", COLLECTED: "green", DELIVERED: "green", CANCELLED: "crit",
  planned: "neutral", active: "blue", completed: "green", cancelled: "crit",
  awaiting_classification: "warn", in_transit: "blue", classified: "blue", dispatched: "blue", processed: "green",
  pending_review: "warn", confirmed: "green", corrected: "blue", rejected: "crit",
  proposed: "warn", approved: "green", overridden: "blue",
  online: "green", maintenance: "warn", offline: "crit", idle: "neutral", assigned: "blue", en_route: "blue",
  open: "warn", acknowledged: "neutral", resolved: "green", running: "blue", failed: "crit", archived: "neutral",
  paused: "neutral",
};
export function Status({ s }: { s: string }) {
  return <Badge tone={STATUS_TONE[s] ?? "neutral"}>{tEnum(s)}</Badge>;
}

export function SimTag({ label }: { label?: string }) {
  return <span title={t("Demo data produced by the simulator. It is not a real-world measurement.")} className="whitespace-nowrap rounded-full bg-raised px-2 py-0.5 text-xs text-ink-3">{label ?? t("Simulated")}</span>;
}

export function Button({ variant = "secondary", size = "md", loading, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md"; loading?: boolean }) {
  const v = {
    primary: "bg-accent text-on-accent border-accent font-medium hover:opacity-90",
    secondary: "bg-panel text-ink border-line-2 hover:border-ink-3",
    ghost: "bg-transparent text-ink-2 border-transparent hover:text-ink hover:bg-raised",
    danger: "bg-transparent text-crit border-crit/50 hover:bg-crit/10",
  }[variant];
  return (
    <button {...rest} disabled={rest.disabled || loading}
      className={cx("inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-50", size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3.5 text-sm", v, className)}>
      {loading && <Loader2 className="size-3.5 animate-spin" />}
      {children}
    </button>
  );
}

export function PageHeader({ title, subtitle, actions, crumb }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; crumb?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {crumb && <div className="mb-1 text-xs text-ink-3">{crumb}</div>}
        <h1 className="font-serif text-2xl font-medium text-ink">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return <div className="flex items-center gap-2 py-10 text-sm text-ink-3"><Loader2 className="size-4 animate-spin" />{t(label)}…</div>;
}

export function ErrorBox({ error }: { error: unknown }) {
  const msg = (error as Error)?.message ?? String(error);
  return <div className="rounded-md border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">{t(msg)}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-dashed border-line-2 px-4 py-8 text-center text-sm text-ink-3">{children}</div>;
}

export function Meter({ value, max = 100, tone = "green", className }: { value: number; max?: number; tone?: "green" | "blue" | "gold" | "warn" | "crit"; className?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const c = { green: "bg-accent", blue: "bg-blue", gold: "bg-gold", warn: "bg-warn", crit: "bg-crit" }[tone];
  return <div className={cx("h-1.5 w-full overflow-hidden rounded-full bg-line", className)}><div className={cx("h-full rounded-full", c)} style={{ width: `${pct}%` }} /></div>;
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
    </label>
  );
}
export function Input(p: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cx("h-9 w-full rounded-md border border-line-2 bg-canvas px-3 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-accent", p.className)} />;
}
export function Select({ children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={cx("h-9 w-full rounded-md border border-line-2 bg-canvas px-2.5 text-sm text-ink outline-none focus:border-accent", p.className)}>{children}</select>;
}

export function Th({ children, right, className }: { children?: ReactNode; right?: boolean; className?: string }) {
  return <th className={cx("whitespace-nowrap border-b border-line px-3 py-2 text-xs font-medium text-ink-3", right ? "text-right" : "text-left", className)}>{children}</th>;
}
export function Td({ children, right, className, mono }: { children?: ReactNode; right?: boolean; className?: string; mono?: boolean }) {
  return <td className={cx("border-b border-line/70 px-3 py-2.5 text-sm text-ink-2", right && "text-right", mono && "num", className)}>{children}</td>;
}

export function SeverityIcon({ s, className = "size-4" }: { s: string; className?: string }) {
  if (s === "critical") return <OctagonAlert className={cx(className, "text-crit")} aria-label={t("Critical")} />;
  if (s === "warning") return <AlertTriangle className={cx(className, "text-warn")} aria-label={t("Warning")} />;
  if (s === "ok") return <CheckCircle2 className={cx(className, "text-accent")} aria-label={t("OK")} />;
  return <Info className={cx(className, "text-blue")} aria-label={t("Info")} />;
}

/** Labeled horizontal bar list (used for explainability / feature importance). */
export function BarList({ items, color = "var(--accent)", format = (v: number) => `${Math.round(v * 100)}%` }: { items: { label: string; value: number; note?: string }[]; color?: string; format?: (v: number) => string }) {
  const max = Math.max(...items.map((i) => i.value), 0.0001);
  return (
    <div className="space-y-2">
      {items.map((it) => (
        <div key={it.label} className="grid grid-cols-[140px_1fr_52px] items-center gap-3 text-xs">
          <span className="truncate text-ink-2" title={it.note}>{it.label}</span>
          <div className="h-2 rounded-sm bg-line"><div className="h-full rounded-sm" style={{ width: `${(it.value / max) * 100}%`, background: color }} /></div>
          <span className="num text-right text-ink">{format(it.value)}</span>
        </div>
      ))}
    </div>
  );
}
