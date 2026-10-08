"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Truck, X } from "lucide-react";
import { api } from "@/lib/api";
import { Button, ErrorBox, Field, Input, Select } from "@/components/ui";
import { inr, kg, n } from "@/lib/format";

/** Pickup request screen: quote (vehicle, route, cost, CO2) → confirm. */
export function RequestPickup({ source, defaultKg, onClose }: { source: { id: number; name: string }; defaultKg: number; onClose: () => void }) {
  const router = useRouter();
  const [qty, setQty] = useState(Math.round(defaultKg));
  const [urgency, setUrgency] = useState("normal");
  const [quote, setQuote] = useState<any>(null);
  const [qErr, setQErr] = useState<unknown>(null);
  useEffect(() => {
    const t = setTimeout(() => api.post("/pickups/quote", { source_id: source.id, quantity_kg: qty, urgency }).then((q) => { setQuote(q); setQErr(null); }).catch(setQErr), 250);
    return () => clearTimeout(t);
  }, [qty, urgency, source.id]);
  const confirm = useMutation({
    mutationFn: () => api.post<any>("/pickups", { source_id: source.id, quantity_kg: qty, urgency }),
    onSuccess: (p) => router.push(`/pickups/${p.id}`),
  });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-md border border-line-2 bg-panel shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3"><div className="flex items-center gap-2 text-sm font-semibold"><Truck className="size-4 text-accent" />Request pickup</div><button onClick={onClose} aria-label="Close"><X className="size-4 text-ink-3" /></button></div>
        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantity (kg)"><Input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value)))} /></Field>
            <Field label="Pickup urgency"><Select value={urgency} onChange={(e) => setUrgency(e.target.value)}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></Select></Field>
          </div>
          {qErr != null && <ErrorBox error={qErr} />}
          {quote && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded border border-line bg-raised/50 p-4 text-sm">
              <dt className="text-ink-3">Waste source</dt><dd className="text-right text-ink">{quote.source.name}</dd>
              <dt className="text-ink-3">Waste type</dt><dd className="text-right text-ink">{quote.source.waste_type.replace(/_/g, " ")}</dd>
              <dt className="text-ink-3">Location</dt><dd className="text-right text-ink">{quote.source.address}</dd>
              <dt className="text-ink-3">Pickup window</dt><dd className="text-right text-ink">next 1–6 h</dd>
              <dt className="text-ink-3">Suggested vehicle</dt><dd className="text-right text-ink">{quote.suggested_vehicle ? `${quote.suggested_vehicle.code} · ${quote.suggested_vehicle.type}` : "next available"}</dd>
              <dt className="text-ink-3">Suggested route</dt><dd className="text-right text-xs text-ink">{quote.suggested_route.join(" → ")}</dd>
              <dt className="text-ink-3">Estimated cost</dt><dd className="num text-right text-ink">{inr(quote.estimated_cost_inr)} <span className="text-ink-3">(vs {inr(quote.standalone_cost_inr)} solo)</span></dd>
              <dt className="text-ink-3">Estimated CO₂</dt><dd className="num text-right text-ink">{n(quote.estimated_co2_kg, 1)} kg</dd>
            </dl>
          )}
          {quote && <p className="text-[11px] text-ink-3">{quote.note}</p>}
          {confirm.error && <ErrorBox error={confirm.error} />}
          <Button variant="primary" className="w-full" loading={confirm.isPending} onClick={() => confirm.mutate()}>Confirm Pickup · {kg(qty)}</Button>
        </div>
      </div>
    </div>
  );
}
