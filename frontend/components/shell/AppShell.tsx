"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  LayoutDashboard, Factory, Truck, Route, Warehouse, BrainCircuit, Zap, BarChart3, Cpu, Bell, Settings, ShieldCheck,
  LogOut, Sparkles, Play, Menu, X, Recycle, Map as MapIcon,
} from "lucide-react";
import { Logo } from "./Logo";
import { useAuth, ROLE_LABEL, type Role } from "@/store/auth";
import { useLive } from "@/store/live";
import { api } from "@/lib/api";
import { cx, ago } from "@/lib/format";
import { useLiveSocket } from "@/hooks/useLiveSocket";
import { AssistantDrawer } from "@/features/assistant/AssistantDrawer";
import { DemoOverlay } from "@/features/demo/DemoOverlay";
import { SeverityIcon } from "@/components/ui";

type NavItem = { href: string; label: string; icon: any; roles?: Role[] };
const NAV: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/waste-sources", label: "Waste Network", icon: Factory, roles: ["generator", "fleet", "admin"] },
  { href: "/pickups", label: "Collection", icon: Truck, roles: ["generator", "fleet", "admin"] },
  { href: "/routes", label: "Routes", icon: Route, roles: ["fleet", "admin"] },
  { href: "/hub", label: "Processing Hub", icon: Warehouse, roles: ["hub", "admin"] },
  { href: "/ai-decisions", label: "AI Engine", icon: BrainCircuit, roles: ["hub", "admin", "facility"] },
  { href: "/planner", label: "City Planner", icon: MapIcon, roles: ["admin", "hub", "fleet"] },
  { href: "/facilities", label: "Facilities", icon: Recycle },
  { href: "/energy", label: "Energy", icon: Zap },
  { href: "/analytics", label: "Analytics", icon: BarChart3, roles: ["admin", "fleet", "hub", "facility"] },
  { href: "/ai-model", label: "AI Models", icon: Cpu, roles: ["admin", "hub", "facility"] },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/admin", label: "Admin", icon: ShieldCheck, roles: ["admin"] },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { token, user, clear } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const [hydrated, setHydrated] = useState(false);
  const [assistant, setAssistant] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  useLiveSocket();

  useEffect(() => { setHydrated(true); }, []);
  useEffect(() => { if (hydrated && !token) router.replace(`/login?next=${encodeURIComponent(path)}`); }, [hydrated, token, router, path]);
  useEffect(() => { setMobileNav(false); }, [path]);

  if (!hydrated || !token || !user) return <div className="grid min-h-screen place-items-center text-sm text-ink-3">Loading WattCycle…</div>;
  const nav = NAV.filter((n) => !n.roles || n.roles.includes(user.role));

  return (
    <div className="flex min-h-screen">
      <aside className={cx("fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-line bg-panel transition-transform lg:translate-x-0", mobileNav ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex h-14 items-center justify-between border-b border-line px-4">
          <Logo href="/dashboard" />
          <button className="lg:hidden" onClick={() => setMobileNav(false)} aria-label="Close menu"><X className="size-4" /></button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {nav.map((n) => {
            const active = path === n.href || (n.href !== "/dashboard" && path.startsWith(n.href));
            return (
              <Link key={n.href} href={n.href} className={cx("flex items-center gap-2.5 rounded px-2.5 py-2 text-[13px] transition-colors", active ? "bg-raised text-ink" : "text-ink-2 hover:bg-raised/60 hover:text-ink")}>
                <n.icon className={cx("size-4", active ? "text-accent" : "text-ink-3")} />
                {n.label}
                {active && <span className="ml-auto h-4 w-0.5 rounded bg-accent" />}
              </Link>
            );
          })}
        </nav>
        <SystemStatus />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-canvas/85 px-4 backdrop-blur lg:px-6">
          <button className="lg:hidden" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu className="size-5" /></button>
          <TopNav />
          <div className="ml-auto flex items-center gap-2">
            <RunDemoButton role={user.role} />
            <button onClick={() => setAssistant(true)} className="flex h-8 items-center gap-1.5 rounded border border-cyan/30 bg-cyan/10 px-2.5 text-xs font-medium text-cyan hover:bg-cyan/20">
              <Sparkles className="size-3.5" /> <span className="hidden sm:inline">WattCycle Intelligence</span>
            </button>
            <Notifications />
            <div className="hidden items-center gap-2 border-l border-line pl-3 sm:flex">
              <div className="grid size-7 place-items-center rounded-full bg-raised text-[11px] font-semibold text-ink-2">{user.name.split(" ").map((x) => x[0]).join("")}</div>
              <div className="leading-tight">
                <div className="text-xs text-ink">{user.name}</div>
                <div className="text-[10px] text-ink-3">{ROLE_LABEL[user.role]}</div>
              </div>
              <button title="Sign out" onClick={async () => { await api.post("/auth/logout").catch(() => {}); clear(); router.replace("/login"); }} className="ml-1 text-ink-3 hover:text-ink"><LogOut className="size-4" /></button>
            </div>
          </div>
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 lg:px-6">{children}</main>
      </div>
      <AssistantDrawer open={assistant} onClose={() => setAssistant(false)} />
      <DemoOverlay />
      {mobileNav && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setMobileNav(false)} />}
    </div>
  );
}

const TOP = [
  { href: "/dashboard", label: "Overview" }, { href: "/waste-sources", label: "Waste" }, { href: "/pickups", label: "Collection" },
  { href: "/ai-decisions", label: "AI Engine" }, { href: "/facilities", label: "Facilities" }, { href: "/energy", label: "Energy" }, { href: "/analytics", label: "Analytics" },
];
function TopNav() {
  const path = usePathname();
  return (
    <nav className="hidden items-center gap-1 xl:flex">
      {TOP.map((t) => (
        <Link key={t.href} href={t.href} className={cx("rounded px-2.5 py-1.5 text-xs", path.startsWith(t.href) ? "text-ink" : "text-ink-3 hover:text-ink-2")}>{t.label}</Link>
      ))}
    </nav>
  );
}

function RunDemoButton({ role }: { role: Role }) {
  const demo = useLive((s) => s.demo);
  const start = useMutation({
    mutationFn: () => api.post("/demo/run"),
    onMutate: () => useLive.getState().demoStart(),
    onError: (e: any) => useLive.getState().demoFinish({ error: e.message }),
  });
  if (!["admin", "hub", "fleet"].includes(role)) return null;
  if (demo.running) {
    return <button onClick={() => useLive.getState().demoOpen(true)} className="flex h-8 items-center gap-1.5 rounded border border-accent/40 bg-accent/10 px-2.5 text-xs font-medium text-accent"><span className="size-1.5 rounded-full bg-accent pulse" />Optimizing… {demo.stages.length}/11</button>;
  }
  return (
    <button onClick={() => start.mutate()} className="flex h-8 items-center gap-1.5 rounded bg-accent px-3 text-xs font-semibold text-[#04140b] hover:bg-[#5ae89a]">
      <Play className="size-3.5 fill-current" /> Run Full Optimization
    </button>
  );
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const { data } = useQuery({ queryKey: ["alerts", "open"], queryFn: () => api.get<any[]>("/alerts?status=open"), refetchInterval: 30_000 });
  const count = data?.length ?? 0;
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="relative grid size-8 place-items-center rounded text-ink-2 hover:bg-raised" aria-label="Notifications">
        <Bell className="size-4" />
        {count > 0 && <span className="num absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-crit px-1 text-[9px] font-bold text-white">{count}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-50 w-80 rounded-md border border-line-2 bg-raised shadow-2xl">
          <div className="border-b border-line px-3 py-2 text-xs font-semibold">Open alerts</div>
          <div className="max-h-80 overflow-y-auto">
            {(data ?? []).slice(0, 8).map((a) => (
              <Link key={a.id} href="/alerts" onClick={() => setOpen(false)} className="flex gap-2 border-b border-line/60 px-3 py-2 hover:bg-panel">
                <SeverityIcon s={a.severity} className="mt-0.5 size-3.5 shrink-0" />
                <div className="min-w-0"><div className="text-xs text-ink">{a.title}</div><div className="line-clamp-2 text-[11px] text-ink-3">{a.message}</div><div className="mt-0.5 text-[10px] text-ink-3">{ago(a.created_at)}</div></div>
              </Link>
            ))}
            {count === 0 && <div className="px-3 py-6 text-center text-xs text-ink-3">No open alerts</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function SystemStatus() {
  const connected = useLive((s) => s.connected);
  const { data } = useQuery({ queryKey: ["system-status"], queryFn: () => api.get<any>("/system/status"), refetchInterval: 20_000 });
  const ok = connected && data?.ai === "ok" && data?.models_ready;
  const degraded = data && data.ai !== "ok";
  return (
    <div className="border-t border-line p-3">
      <div className="text-[10px] font-medium uppercase tracking-wider text-ink-3">System Status</div>
      <div className="mt-1.5 flex items-center gap-2 text-xs">
        <span className={cx("size-2 rounded-full", ok ? "bg-accent pulse" : degraded ? "bg-crit" : "bg-warn")} />
        <span className="text-ink-2">{ok ? "All systems operational" : degraded ? "AI service unreachable" : !connected ? "Connecting live feed…" : "Models training…"}</span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1 text-[10px] text-ink-3">
        <span>API <b className="text-accent">●</b></span>
        <span>AI <b className={data?.ai === "ok" ? "text-accent" : "text-crit"}>●</b></span>
        <span>Live <b className={connected ? "text-accent" : "text-warn"}>●</b></span>
      </div>
    </div>
  );
}
