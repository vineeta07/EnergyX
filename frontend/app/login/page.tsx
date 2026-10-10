"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Factory, Truck, Warehouse, Zap, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth, type User } from "@/store/auth";
import { Button, ErrorBox, Field, Input } from "@/components/ui";
import { Logo } from "@/components/shell/Logo";
import { LangSwitcher, ThemeToggle } from "@/components/shell/Prefs";
import { t } from "@/lib/i18n";
import { loadGsap, prefersReducedMotion } from "@/components/landing/gsapKit";

const DEMO = [
  { email: "admin@wattcycle.demo", role: "System operator", d: "The whole network, plant decisions, models and admin", icon: ShieldCheck },
  { email: "generator@wattcycle.demo", role: "Waste generator", d: "MCD Central and South zone office: forecasts and transfer-load requests", icon: Factory },
  { email: "fleet@wattcycle.demo", role: "Fleet operator", d: "Pickup board, truck routes, vehicles", icon: Truck },
  { email: "hub@wattcycle.demo", role: "Hub operator", d: "Weigh loads, check the sort, approve the plant", icon: Warehouse },
  { email: "facility@wattcycle.demo", role: "Plant operator", d: "Tehkhand WtE: incoming loads and output readings", icon: Zap },
];

export default function Login() {
  const router = useRouter();
  const setSession = useAuth((s) => s.setSession);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    loadGsap().then(({ gsap }) => {
      gsap.from("[data-role-row]", { x: 24, opacity: 0, duration: 0.6, ease: "power2.out", stagger: 0.09, delay: 0.2 });
      gsap.from("[data-login-card] > *", { y: 14, opacity: 0, duration: 0.5, ease: "power2.out", stagger: 0.07 });
    });
  }, []);

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
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <div className="flex items-center justify-between"><Logo /><div className="flex gap-2"><LangSwitcher /><ThemeToggle /></div></div>
        <div data-login-card className="mx-auto my-auto w-full max-w-sm py-12">
          <h1 className="font-serif text-3xl font-medium text-ink">{t("Login")}</h1>
          <p className="mt-2 text-sm text-ink-2">{t("Use your WattCycle account, or pick a demo role.")}</p>
          <form className="mt-6 space-y-4" onSubmit={(e) => { e.preventDefault(); login(email, password); }}>
            <Field label={t("Email")}><Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
            <Field label={t("Password")}><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
            {err != null && <ErrorBox error={err} />}
            <Button variant="primary" className="w-full" loading={busy === email}>{t("Login")}</Button>
          </form>
          <p className="mt-4 text-sm text-ink-3">{t("No account yet?")} <Link href="/register" className="text-accent underline underline-offset-2">{t("Register your organisation")}</Link></p>
        </div>
      </div>
      <div className="border-l border-line bg-panel px-6 py-12 sm:px-12 lg:py-20">
        <div className="mx-auto max-w-md">
          <span className="inline-flex rounded-full bg-accent/15 px-3 py-1 text-xs text-accent">{t("Demo mode")}</span>
          <h2 className="mt-3 font-serif text-2xl font-medium text-ink">{t("One network, five roles")}</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">{t("Each role sees the screens and buttons its job needs. These accounts run in demo mode on simulated data.")}</p>
          <ul className="mt-6 divide-y divide-line border-y border-line">
            {DEMO.map((d) => (
              <li key={d.email} data-role-row>
                <button onClick={() => login(d.email, "demo1234")} disabled={!!busy}
                  className="group flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-left transition-all hover:bg-raised hover:pl-4 disabled:opacity-60">
                  <d.icon className="size-5 shrink-0 text-ink-3" />
                  <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-ink">{t(d.role)}</span><span className="block text-xs leading-snug text-ink-3">{t(d.d)}</span></span>
                  <span className="shrink-0 text-xs text-accent">{busy === d.email ? t("Logging in…") : t("Open dashboard")}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
