"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { X } from "lucide-react";
import { api } from "@/lib/api";
import { Button, ErrorBox, Field, Input, Select } from "@/components/ui";
import { inr, kg, n } from "@/lib/format";

import { t, tEnum } from "@/lib/i18n";
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
    <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(24,19,12,0.55)] p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg border border-line-2 bg-panel shadow-[var(--popover-shadow)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3"><div className="text-sm font-medium">{t("Request a pickup")}</div><button onClick={onClose} aria-label={t("Close")}><X className="size-4 text-ink-3" /></button></div>
        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("Quantity (kg)")}><Input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value)))} /></Field>
            <Field label={t("Pickup urgency")}><Select value={urgency} onChange={(e) => setUrgency(e.target.value)}><option value="low">{t("Low")}</option><option value="normal">{t("Normal")}</option><option value="high">{t("High")}</option><option value="critical">{t("Critical")}</option></Select></Field>
          </div>
          {qErr != null && <ErrorBox error={qErr} />}
          {quote && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-line bg-raised/60 p-4 text-sm">
              <dt className="text-ink-3">{t("Waste source")}</dt><dd className="text-right text-ink">{quote.source.name}</dd>
              <dt className="text-ink-3">{t("Waste type")}</dt><dd className="text-right text-ink">{tEnum(quote.source.waste_type)}</dd>
              <dt className="text-ink-3">{t("Location")}</dt><dd className="text-right text-ink">{quote.source.address}</dd>
              <dt className="text-ink-3">{t("Pickup window")}</dt><dd className="text-right text-ink">{t("Within the next 1 to 6 hours")}</dd>
              <dt className="text-ink-3">{t("Suggested vehicle")}</dt><dd className="text-right text-ink">{quote.suggested_vehicle ? `${quote.suggested_vehicle.code} · ${quote.suggested_vehicle.type}` : t("Next one free")}</dd>
              <dt className="text-ink-3">{t("Suggested route")}</dt><dd className="text-right text-xs text-ink">{quote.suggested_route.join(" → ")}</dd>
              <dt className="text-ink-3">{t("Estimated cost")}</dt><dd className="num text-right text-ink">{inr(quote.estimated_cost_inr)} <span className="text-ink-3">({t("{a} as a separate trip", { a: inr(quote.standalone_cost_inr) })})</span></dd>
              <dt className="text-ink-3">{t("Estimated CO₂")}</dt><dd className="num text-right text-ink">{n(quote.estimated_co2_kg, 1)} kg</dd>
            </dl>
          )}
          {quote && <p className="text-xs text-ink-3">{quote.note}</p>}
          {confirm.error && <ErrorBox error={confirm.error} />}
          <Button variant="primary" className="w-full" loading={confirm.isPending} onClick={() => confirm.mutate()}>{t("Book pickup of {q}", { q: kg(qty) })}</Button>
        </div>
      </div>
    </div>
  );
}
