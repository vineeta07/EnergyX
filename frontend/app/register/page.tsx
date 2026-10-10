"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth, type User } from "@/store/auth";
import { Button, ErrorBox, Field, Input, Select } from "@/components/ui";
import { Logo } from "@/components/shell/Logo";
import { LangSwitcher, ThemeToggle } from "@/components/shell/Prefs";
import { t } from "@/lib/i18n";

export default function Register() {
  const router = useRouter();
  const setSession = useAuth((s) => s.setSession);
  const [f, setF] = useState({ name: "", email: "", password: "", organization: "", role: "generator" });
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const r = await api.post<{ token: string; user: User }>("/auth/register", f);
      setSession(r.token, r.user);
      router.replace(f.role === "generator" ? "/waste-sources/new" : "/dashboard");
    } catch (x) { setErr(x); } finally { setBusy(false); }
  }

  return (
    <div className="flex min-h-screen flex-col px-4 py-6">
      <div className="mx-auto flex w-full max-w-md items-center justify-between"><Logo /><div className="flex gap-2"><LangSwitcher /><ThemeToggle /></div></div>
      <div className="mx-auto my-auto w-full max-w-md py-10">
        <h1 className="font-serif text-3xl font-medium text-ink">{t("Register your organisation")}</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">{t("Generators add their waste sources. Fleets, hubs and plants join the same loop.")}</p>
        <form className="mt-6 space-y-4 rounded-lg border border-line bg-panel p-6" onSubmit={submit}>
          <Field label={t("I am a")}>
            <Select value={f.role} onChange={set("role")}>
              <option value="generator">{t("Waste generator (restaurant, hotel, market, farm, factory)")}</option>
              <option value="fleet">{t("Collection or fleet operator")}</option>
              <option value="hub">{t("Processing hub operator")}</option>
              <option value="facility">{t("Waste-to-energy plant")}</option>
            </Select>
          </Field>
          <Field label={t("Organisation")}><Input value={f.organization} onChange={set("organization")} placeholder={t("MCD zone office, RWA, market, hotel")} /></Field>
          <Field label={t("Your name")}><Input value={f.name} onChange={set("name")} required minLength={2} /></Field>
          <Field label={t("Work email")}><Input type="email" value={f.email} onChange={set("email")} required /></Field>
          <Field label={t("Password")} hint={t("At least 8 characters. It is stored as a bcrypt hash.")}><Input type="password" value={f.password} onChange={set("password")} required minLength={8} /></Field>
          {err != null && <ErrorBox error={err} />}
          <Button variant="primary" className="w-full" loading={busy}>{t("Create account")}</Button>
        </form>
        <p className="mt-4 text-sm text-ink-3">{t("Already registered?")} <Link href="/login" className="text-accent underline underline-offset-2">{t("Login")}</Link></p>
      </div>
    </div>
  );
}
