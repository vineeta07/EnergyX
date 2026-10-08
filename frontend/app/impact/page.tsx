"use client";
import { useQuery } from "@tanstack/react-query";
import { PublicNav, PublicFooter } from "@/components/shell/PublicNav";
import { SimTag } from "@/components/ui";
import { n } from "@/lib/format";

export default function Impact() {
  const { data } = useQuery({ queryKey: ["public-impact"], queryFn: () => fetch("/api/public/impact").then((r) => (r.ok ? r.json() : null)) });
  const cards = [
    ["Waste processed", data && `${n(data.waste_processed_kg / 1000, 1)} t`, "Measured at hub weighbridges"],
    ["Useful energy generated", data && `${n(data.energy_kwh)} kWh`, "Facility meter readings"],
    ["CO₂e avoided", data && `${n(data.co2_avoided_kg / 1000, 1)} t`, "Grid displacement + landfill methane"],
    ["Energy prediction accuracy", data?.prediction_accuracy != null && `${n(data.prediction_accuracy, 1)}%`, "100 − MAPE on predicted vs actual"],
  ];
  return (
    <div className="min-h-screen">
      <PublicNav />
      <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <div className="text-xs font-medium uppercase tracking-[0.2em] text-accent">Environmental impact</div>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">Measured, not marketed.</h1>
        <p className="mt-3 flex items-center gap-2 text-ink-2"><SimTag /> Figures below come from the demo network&apos;s simulated meters and are recomputed live.</p>
        <div className="mt-10 grid gap-3 sm:grid-cols-2">
          {cards.map(([l, v, s]) => (
            <div key={l as string} className="rounded-md border border-line bg-panel p-6">
              <div className="text-xs uppercase tracking-wider text-ink-3">{l}</div>
              <div className="num mt-2 text-3xl font-semibold">{v || "—"}</div>
              <div className="mt-1 text-xs text-ink-3">{s}</div>
            </div>
          ))}
        </div>
        <h2 className="mt-16 text-xl font-semibold">Methodology</h2>
        <div className="mt-4 space-y-3 text-sm text-ink-2">
          <p><b className="text-ink">Grid displacement:</b> useful energy × {data?.factors?.grid_kg_co2_per_kwh ?? 0.71} kg CO₂/kWh (approximate Indian grid emission factor).</p>
          <p><b className="text-ink">Avoided landfill methane:</b> organic kg diverted × {data?.factors?.landfill_kg_co2e_per_kg_organic ?? 0.45} kg CO₂e/kg (rounded IPCC first-order-decay estimate for food waste).</p>
          <p><b className="text-ink">Transport:</b> 0.85 kg CO₂/km + 6 kg handling per trip for diesel trucks; the analytics page nets these against the savings.</p>
          <p>Factors are configuration constants in the API, shown here so every number can be audited. Replace them with your jurisdiction&apos;s official factors for production use.</p>
        </div>
      </div>
      <PublicFooter />
    </div>
  );
}
