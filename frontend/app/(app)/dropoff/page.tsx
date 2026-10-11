"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BatteryCharging, Factory, LocateFixed, Navigation, Shirt } from "lucide-react";
import { api } from "@/lib/api";
import { ErrorBox, Loading, Select } from "@/components/ui";
import { cx, n } from "@/lib/format";
import { t } from "@/lib/i18n";
import { MATERIAL_COLOR, MATERIAL_LABEL, param, saveZone, savedZone, useCatalogue, zoneShort } from "@/lib/resident";
import { Card, MaterialDot, ResidentPage } from "@/features/resident/ui";

interface Place { code: string; name: string; detail: string; kind: "mrf" | "upcycler" | "battery"; takes: string[]; products: string | null; example: boolean; lat: number; lng: number; km: number }
interface Dropoffs { zone: string; places: Place[] }

const KIND = {
  mrf: { label: "Recycling centre (MRF)", icon: Factory },
  upcycler: { label: "Upcycling workshop", icon: Shirt },
  battery: { label: "Battery recycler", icon: BatteryCharging },
} as const;
const FILTERS = ["all", "paper", "plastic", "metal", "glass", "textile", "battery"] as const;
const TAKES_LABEL: Record<string, string> = { ...MATERIAL_LABEL, battery: "Batteries" };

export default function DropOff() {
  const cat = useCatalogue();
  const [zone, setZone] = useState(savedZone);
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locErr, setLocErr] = useState<string | null>(null);
  const [m, setM] = useState<(typeof FILTERS)[number]>(() => { const x = param("m"); return (FILTERS as readonly string[]).includes(x ?? "") ? (x as (typeof FILTERS)[number]) : "all"; });

  const qs = here ? `lat=${here.lat}&lng=${here.lng}` : `zone=${encodeURIComponent(zone)}`;
  const d = useQuery({ queryKey: ["resident", "dropoff", qs], queryFn: () => api.get<Dropoffs>(`/citizen/dropoff?${qs}`) });

  function locate() {
    if (!("geolocation" in navigator)) { setLocErr(t("This browser cannot share its location. Pick your area instead.")); return; }
    setLocating(true); setLocErr(null);
    navigator.geolocation.getCurrentPosition(
      (p) => { setHere({ lat: p.coords.latitude, lng: p.coords.longitude }); setLocating(false); },
      () => { setLocErr(t("Location was not shared. Pick your area instead.")); setLocating(false); },
      { timeout: 10_000, maximumAge: 300_000 },
    );
  }

  if (cat.isLoading) return <Loading />;
  if (cat.error || !cat.data) return <ErrorBox error={cat.error} />;
  const places = (d.data?.places ?? []).filter((p) => m === "all" || p.takes.includes(m));

  return (
    <ResidentPage title={t("Where to take it")} subtitle={t("Recycling centres, upcycling workshops and the battery recycler nearest to you. Bring things clean and dry.")}>
      <Card className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="w-full min-w-0 text-sm sm:w-auto sm:flex-1">
            <span className="mb-1 block text-xs text-ink-3">{t("Your area")}</span>
            <Select value={here ? "" : zone} onChange={(e) => { setZone(e.target.value); saveZone(e.target.value); setHere(null); }}>
              {here && <option value="">{t("My location")}</option>}
              {cat.data.zones.map((z) => <option key={z.name} value={z.name}>{t(zoneShort(z.name))} ({t(z.ref)})</option>)}
            </Select>
          </label>
          <button onClick={locate} disabled={locating} className={cx("inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm transition-colors", here ? "border-accent bg-accent/10 text-accent" : "border-line-2 text-ink hover:border-ink-3")}>
            <LocateFixed className="size-4" />{locating ? t("Finding you") + "…" : t("Use my location")}
          </button>
        </div>
        {locErr && <p className="text-sm text-warn">{locErr}</p>}
        <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("What are you bringing?")}>
          {FILTERS.map((f) => (
            <button key={f} role="tab" aria-selected={m === f} onClick={() => setM(f)}
              className={cx("inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition-colors", m === f ? "bg-accent text-on-accent" : "bg-raised text-ink-2 hover:text-ink")}>
              {f !== "all" && f !== "battery" && <MaterialDot material={f} className="size-2" />}
              {f === "all" ? t("Everything") : t(TAKES_LABEL[f])}
            </button>
          ))}
        </div>
      </Card>

      {d.isLoading ? <Loading /> : d.error ? <ErrorBox error={d.error} /> : places.length === 0 ? (
        <Card className="text-center text-sm text-ink-2">{t("Nothing nearby takes this yet. The blue dry bin is the next best place for it.")}</Card>
      ) : (
        <ul className="space-y-3">
          {places.map((p, idx) => {
            const K = KIND[p.kind];
            return (
              <li key={p.code}>
                <Card className={cx("flex gap-4", idx === 0 && "border-accent/50")}>
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-dim text-accent"><K.icon className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <h2 className="text-[15px] font-semibold text-ink">{p.name}</h2>
                      <span className="num text-sm text-ink-2">{t("{n} km away", { n: n(p.km, 1) })}</span>
                    </div>
                    <div className="text-xs text-ink-3">{t(K.label)}{idx === 0 ? ` · ${t("Nearest")}` : ""}{p.example ? ` · ${t("Example partner")}` : ""}</div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {p.takes.map((x) => (
                        <span key={x} className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-xs text-ink-2">
                          <span className="size-2 rounded-full" style={{ background: MATERIAL_COLOR[x] ?? "var(--warn)" }} />{t(TAKES_LABEL[x] ?? x)}
                        </span>
                      ))}
                    </div>
                    {p.products && <p className="mt-2 text-sm text-ink-3">{t("Turns it into")}: <span>{p.products}</span></p>}
                  </div>
                  <a href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`} target="_blank" rel="noopener noreferrer"
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-full border border-line-2 px-3 text-sm text-ink hover:border-ink-3">
                    <Navigation className="size-4 text-accent" /><span className="hidden sm:inline">{t("Directions")}</span>
                  </a>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      {d.data && <p className="text-center text-xs text-ink-3">{t("Distances are in a straight line from {area}. Roads add a little.", { area: here ? t("your location") : t(zoneShort(d.data.zone)) })}</p>}
    </ResidentPage>
  );
}
