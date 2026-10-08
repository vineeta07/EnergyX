"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Factory, Truck, Warehouse, Zap, ShieldCheck, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth, type User } from "@/store/auth";
import { Button, ErrorBox, Field, Input } from "@/components/ui";
import { Logo } from "@/components/shell/Logo";

const DEMO = [
  { email: "admin@wattcycle.demo", role: "System Operator", d: "Whole network, AI decisions, models, admin", icon: ShieldCheck },
  { email: "generator@wattcycle.demo", role: "Waste Generator", d: "Restaurant ABC — register waste, request pickups", icon: Factory },
  { email: "fleet@wattcycle.demo", role: "Fleet Operator", d: "Pickup board, OR-Tools routes, vehicles", icon: Truck },
  { email: "hub@wattcycle.demo", role: "Hub Operator", d: "Weigh, classify, approve destinations", icon: Warehouse },
  { email: "facility@wattcycle.demo", role: "Energy Facility", d: "Facility B — incoming loads, report output", icon: Zap },
];

export default function Login() {
  const router = useRouter();
  const setSession = useAuth((s) => s.setSession);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function login(e: string, p: string) {
    setBusy(e); setErr(null);
    try {
      const r = await api.post<{ token: string; user: User }>("/auth/login", { email: e, password: p });
      setSession(r.token, r.user);
      const next = new URLSearchParams(location.search).get("next");
      router.replace(next && next.startsWith("/") ? next : "/dashboard");
    } catch (x) { setErr(x); } finally { setBusy(null); }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Logo />
          <h1 className="mt-8 text-2xl font-semibold">Sign in</h1>
          <p className="mt-1 text-sm text-ink-2">Use your WattCycle account, or pick a demo role.</p>
          <form className="mt-6 space-y-4" onSubmit={(e) => { e.preventDefault(); login(email, password); }}>
            <Field label="Email"><Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
            <Field label="Password"><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
            {err != null && <ErrorBox error={err} />}
            <Button variant="primary" className="w-full" loading={busy === email}>Sign in</Button>
          </form>
          <p className="mt-4 text-sm text-ink-3">No account? <Link href="/register" className="text-accent hover:underline">Register your organisation</Link></p>
        </div>
      </div>
      <div className="grid-bg border-l border-line bg-panel/50 px-6 py-12 sm:px-12">
        <div className="mx-auto max-w-md">
          <div className="text-xs font-medium uppercase tracking-[0.2em] text-accent">Demo mode</div>
          <h2 className="mt-2 text-lg font-semibold">One network, five perspectives</h2>
          <p className="mt-1 text-sm text-ink-2">Each role sees the dashboard and actions its job needs. All demo accounts use the seeded password <code className="num rounded bg-canvas px-1 text-ink">demo1234</code>.</p>
          <div className="mt-6 space-y-2">
            {DEMO.map((d) => (
              <button key={d.email} onClick={() => login(d.email, "demo1234")} disabled={!!busy}
                className="group flex w-full items-center gap-3 rounded-md border border-line bg-panel px-4 py-3 text-left transition-colors hover:border-accent/40 disabled:opacity-60">
                <d.icon className="size-5 shrink-0 text-accent" />
                <div className="min-w-0 flex-1"><div className="text-sm font-medium text-ink">{d.role}</div><div className="truncate text-xs text-ink-3">{d.d}</div></div>
                <ArrowRight className="size-4 text-ink-3 group-hover:text-accent" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
