"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth, type User } from "@/store/auth";
import { Button, ErrorBox, Field, Input, Select } from "@/components/ui";
import { Logo } from "@/components/shell/Logo";

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
    <div className="grid-bg flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-md border border-line bg-panel p-8">
        <Logo />
        <h1 className="mt-6 text-xl font-semibold">Join the WattCycle network</h1>
        <p className="mt-1 text-sm text-ink-2">Generators register waste sources; fleets, hubs and facilities plug into the optimisation loop.</p>
        <form className="mt-6 space-y-4" onSubmit={submit}>
          <Field label="I am a">
            <Select value={f.role} onChange={set("role")}>
              <option value="generator">Waste generator (restaurant, hotel, market, farm, factory…)</option>
              <option value="fleet">Collection / fleet operator</option>
              <option value="hub">Processing hub operator</option>
              <option value="facility">Waste-to-energy facility</option>
            </Select>
          </Field>
          <Field label="Organisation"><Input value={f.organization} onChange={set("organization")} placeholder="MCD zone office, RWA, market, hotel…" /></Field>
          <Field label="Your name"><Input value={f.name} onChange={set("name")} required minLength={2} /></Field>
          <Field label="Work email"><Input type="email" value={f.email} onChange={set("email")} required /></Field>
          <Field label="Password" hint="At least 8 characters. Stored as a bcrypt hash."><Input type="password" value={f.password} onChange={set("password")} required minLength={8} /></Field>
          {err != null && <ErrorBox error={err} />}
          <Button variant="primary" className="w-full" loading={busy}>Create account</Button>
        </form>
        <p className="mt-4 text-sm text-ink-3">Already registered? <Link href="/login" className="text-accent hover:underline">Sign in</Link></p>
      </div>
    </div>
  );
}
