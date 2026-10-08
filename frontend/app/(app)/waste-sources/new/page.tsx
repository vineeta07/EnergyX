"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Crosshair, Upload, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { Button, ErrorBox, Field, Input, PageHeader, Panel, Select } from "@/components/ui";
import { BUSINESS_LABEL, kg, kwh } from "@/lib/format";

const WASTE_TYPES: Record<string, string> = { food_organic: "Food / organic", mixed_organic: "Mixed organic", agricultural: "Agricultural residue", packaging_mixed: "Packaging (mixed dry)", municipal_mixed: "Municipal mixed" };

export default function NewSource() {
  const router = useRouter();
  const [f, setF] = useState<any>({
    name: "", business_type: "restaurant", address: "", city: "Delhi", lat: 28.5672, lng: 77.2436, waste_type: "food_organic",
    quantity: 300, unit: "kg", frequency: "daily", operating_hours: "11:00–23:00", storage_capacity_kg: 450, contamination_pct: 10,
  });
  const [est, setEst] = useState<any>(null);
  const [img, setImg] = useState<{ key: string; name: string } | null>(null);
  const set = (k: string, num = false) => (e: any) => setF({ ...f, [k]: num ? Number(e.target.value) : e.target.value });

  // Live estimates as the form changes (debounced).
  useEffect(() => {
    const t = setTimeout(() => {
      api.post("/waste-sources/estimate", { business_type: f.business_type, quantity: f.quantity, unit: f.unit, frequency: f.frequency, storage_capacity_kg: f.storage_capacity_kg || undefined, contamination_pct: f.contamination_pct, city: f.city })
        .then(setEst).catch(() => setEst(null));
    }, 300);
    return () => clearTimeout(t);
  }, [f.business_type, f.quantity, f.unit, f.frequency, f.storage_capacity_kg, f.contamination_pct, f.city]);

  const upload = useMutation({
    mutationFn: async (file: File) => { const fd = new FormData(); fd.append("file", file); return api.upload<{ key: string }>("/uploads", fd); },
    onSuccess: (r, file) => setImg({ key: r.key, name: file.name }),
  });
  const save = useMutation({
    mutationFn: () => api.post<any>("/waste-sources", { ...f, image_key: img?.key, storage_capacity_kg: f.storage_capacity_kg || undefined, address: f.address || undefined }),
    onSuccess: (r) => router.push(`/waste-sources/${r.source.id}`),
  });

  return (
    <div className="space-y-5">
      <PageHeader crumb="Waste Network / New" title="Add Waste Source" subtitle="Register a generator. WattCycle estimates weekly volume, energy potential and the right pickup cadence immediately." />
      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <Panel title="Source profile">
          <form className="grid gap-4 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
            <Field label="Business name"><Input required minLength={2} value={f.name} onChange={set("name")} placeholder="Restaurant ABC" /></Field>
            <Field label="Business type"><Select value={f.business_type} onChange={set("business_type")}>{Object.entries(BUSINESS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="Address"><Input value={f.address} onChange={set("address")} placeholder="Lajpat Nagar II, New Delhi" /></Field>
            <Field label="City"><Select value={f.city} onChange={set("city")}><option>Delhi</option><option>Gurugram</option><option>Noida</option></Select></Field>
            <Field label="GPS location" hint="Use device location or enter coordinates">
              <div className="flex gap-2">
                <Input type="number" step="0.0001" value={f.lat} onChange={set("lat", true)} />
                <Input type="number" step="0.0001" value={f.lng} onChange={set("lng", true)} />
                <Button type="button" onClick={() => navigator.geolocation?.getCurrentPosition((p) => setF({ ...f, lat: +p.coords.latitude.toFixed(5), lng: +p.coords.longitude.toFixed(5) }))} title="Use my location"><Crosshair className="size-4" /></Button>
              </div>
            </Field>
            <Field label="Waste type"><Select value={f.waste_type} onChange={set("waste_type")}>{Object.entries(WASTE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="Waste quantity">
              <div className="flex gap-2"><Input type="number" min={1} value={f.quantity} onChange={set("quantity", true)} /><Select className="w-28" value={f.unit} onChange={set("unit")}><option value="kg">kg</option><option value="tonnes">tonnes</option></Select></div>
            </Field>
            <Field label="Generation frequency"><Select value={f.frequency} onChange={set("frequency")}><option value="daily">Daily</option><option value="twice_weekly">Twice weekly</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></Select></Field>
            <Field label="Operating hours"><Input value={f.operating_hours} onChange={set("operating_hours")} /></Field>
            <Field label="Storage capacity (kg)"><Input type="number" min={0} value={f.storage_capacity_kg} onChange={set("storage_capacity_kg", true)} /></Field>
            <Field label={`Contamination estimate: ${f.contamination_pct}%`} hint="Share of non-target material (plastics in food waste, etc.)"><input type="range" min={0} max={60} value={f.contamination_pct} onChange={set("contamination_pct", true)} className="w-full accent-[var(--accent)]" /></Field>
            <Field label="Image (optional)" hint="JPEG/PNG/WebP ≤ 8 MB · validated by file signature · stored privately">
              <label className="flex h-9 cursor-pointer items-center gap-2 rounded border border-dashed border-line-2 px-3 text-sm text-ink-2 hover:border-ink-3">
                <Upload className="size-4" />{upload.isPending ? "Uploading…" : img ? img.name : "Choose image"}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])} />
              </label>
            </Field>
            {(save.error || upload.error) && <div className="md:col-span-2"><ErrorBox error={save.error ?? upload.error} /></div>}
            <div className="md:col-span-2"><Button variant="primary" loading={save.isPending}>Register waste source</Button></div>
          </form>
        </Panel>
        <Panel title={<span className="flex items-center gap-2"><Sparkles className="size-4 text-cyan" />Calculated for this source</span>} subtitle="Updates as you type">
          {est ? (
            <div className="space-y-4">
              <Big label="Estimated weekly waste" value={kg(est.weekly_kg)} sub={`${kg(est.daily_kg)} per day`} />
              <Big label="Estimated energy potential" value={`${kwh(est.energy_potential_kwh_week)} / week`} sub={`~${kwh(est.energy_potential_kwh_day)} per day at the best-performing compatible facility`} />
              <Big label="Recommended pickup frequency" value={est.pickup.label} sub={est.pickup.reason} />
              <p className="border-t border-line pt-3 text-[11px] text-ink-3">Potential uses the average lab-audited composition for this business type and observed facility yields from the network&apos;s historical records.</p>
            </div>
          ) : <div className="text-sm text-ink-3">Enter quantity to see estimates.</div>}
        </Panel>
      </div>
    </div>
  );
}

function Big({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div><div className="text-[11px] uppercase tracking-wider text-ink-3">{label}</div><div className="num mt-1 text-xl font-semibold text-ink">{value}</div>{sub && <div className="mt-0.5 text-xs text-ink-2">{sub}</div>}</div>;
}
