"use client";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, CircleCheck, Flame, LocateFixed, MoreHorizontal, Trash2, Truck, TriangleAlert, X } from "lucide-react";
import { api } from "@/lib/api";
import { ErrorBox, Loading, Select } from "@/components/ui";
import { ago, cx } from "@/lib/format";
import { t } from "@/lib/i18n";
import { saveZone, savedZone, shrink, useApplyReward, useCatalogue, zoneShort, type ReportKind, type Reward } from "@/lib/resident";
import { BigButton, Card, ResidentPage, showReward } from "@/features/resident/ui";

interface MyReport { id: number; kind: ReportKind; zone: string; note: string | null; has_photo: boolean; created_at: string; status: "open" | "acknowledged" | "resolved" }

const ICON: Record<ReportKind, typeof Trash2> = { overflowing_bin: Trash2, missed_collection: Truck, dumping: TriangleAlert, burning: Flame, other: MoreHorizontal };
const STATUS: Record<MyReport["status"], { label: string; color: string }> = {
  open: { label: "Sent", color: "var(--ink-3)" },
  acknowledged: { label: "Seen by the team", color: "var(--blue)" },
  resolved: { label: "Sorted out", color: "var(--accent)" },
};

export default function Report() {
  const cat = useCatalogue();
  const qc = useQueryClient();
  const apply = useApplyReward();
  const mine = useQuery({ queryKey: ["resident", "reports"], queryFn: () => api.get<MyReport[]>("/citizen/reports"), refetchInterval: 30_000 });
  const [kind, setKind] = useState<ReportKind | null>(null);
  const [zone, setZone] = useState(savedZone);
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const file = useRef<HTMLInputElement>(null);

  async function pick(f: File | undefined) {
    if (!f) return;
    const blob = await shrink(f);
    setPhoto({ blob, url: URL.createObjectURL(blob) });
  }
  function locate() {
    navigator.geolocation?.getCurrentPosition((p) => setHere({ lat: p.coords.latitude, lng: p.coords.longitude }), () => setHere(null), { timeout: 10_000 });
  }
  async function send() {
    if (!kind) return;
    setSending(true); setErr(null);
    const fd = new FormData();
    fd.append("kind", kind);
    if (here) { fd.append("lat", String(here.lat)); fd.append("lng", String(here.lng)); } else fd.append("zone", zone);
    if (note.trim()) fd.append("note", note.trim());
    if (photo) fd.append("file", photo.blob, "report.jpg");
    try {
      const r = await api.upload<Reward>("/citizen/reports", fd);
      apply(r); showReward(r);
      qc.invalidateQueries({ queryKey: ["resident", "reports"] });
      setSent(true); setKind(null); setNote(""); setPhoto(null);
    } catch (e) { setErr(e); } finally { setSending(false); }
  }

  if (cat.isLoading) return <Loading />;
  if (cat.error || !cat.data) return <ErrorBox error={cat.error} />;

  return (
    <ResidentPage title={t("Report a problem")} subtitle={t("A full bin, a truck that did not come, waste dumped or burning. The collection team for your area sees it straight away.")}>
      {sent && (
        <Card className="flex items-start gap-3 border-accent/50">
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-accent" />
          <div className="flex-1 text-[15px] text-ink">{t("Thank you. Your report is on the team's alerts screen. You will see here when they pick it up.")}</div>
          <button onClick={() => setSent(false)} aria-label={t("Close")} className="text-ink-3 hover:text-ink"><X className="size-4" /></button>
        </Card>
      )}
      {err != null && <ErrorBox error={err} />}

      <Card className="space-y-5">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">{t("What is the problem?")}</h2>
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
            {cat.data.report_kinds.map((k) => {
              const I = ICON[k.key];
              return (
                <button key={k.key} onClick={() => setKind(k.key)} aria-pressed={kind === k.key}
                  className={cx("flex flex-col items-center gap-2 rounded-2xl border px-2 py-4 text-center text-sm transition-all hover:-translate-y-0.5",
                    kind === k.key ? "border-accent bg-accent/10 text-ink" : "border-line text-ink-2 hover:border-line-2")}>
                  <I className={cx("size-6", k.key === "burning" ? "text-warn" : "text-accent")} />{t(k.title)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="w-full min-w-0 text-sm sm:w-auto sm:flex-1">
            <span className="mb-1 block text-xs text-ink-3">{t("Where")}</span>
            <Select value={here ? "" : zone} onChange={(e) => { setZone(e.target.value); saveZone(e.target.value); setHere(null); }}>
              {here && <option value="">{t("My location")}</option>}
              {cat.data.zones.map((z) => <option key={z.name} value={z.name}>{t(zoneShort(z.name))} ({t(z.ref)})</option>)}
            </Select>
          </label>
          <button onClick={locate} className={cx("inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm", here ? "border-accent bg-accent/10 text-accent" : "border-line-2 text-ink hover:border-ink-3")}>
            <LocateFixed className="size-4" />{t("Use my location")}
          </button>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block text-xs text-ink-3">{t("A few words (optional)")}</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} rows={3}
            placeholder={t("For example: the bin outside the market gate, full since Monday")}
            className="w-full rounded-xl border border-line-2 bg-panel px-3 py-2 text-[15px] text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none" />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <input ref={file} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          {photo ? (
            <span className="relative">
              <img src={photo.url} alt="" className="size-20 rounded-xl object-cover" />
              <button onClick={() => setPhoto(null)} aria-label={t("Remove photo")} className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full border border-line-2 bg-panel text-ink-2"><X className="size-3.5" /></button>
            </span>
          ) : (
            <button onClick={() => file.current?.click()} className="inline-flex h-10 items-center gap-2 rounded-full border border-line-2 px-4 text-sm text-ink hover:border-ink-3"><Camera className="size-4" />{t("Add a photo")}</button>
          )}
          <BigButton className="ml-auto" disabled={!kind || sending} onClick={send}>{sending ? t("Sending") + "…" : t("Send report")}</BigButton>
        </div>
        {!kind && <p className="-mt-2 text-right text-xs text-ink-3">{t("Pick what the problem is first.")}</p>}
      </Card>

      <Card>
        <h2 className="text-[15px] font-semibold text-ink">{t("Your reports")}</h2>
        {mine.isLoading ? <Loading /> : !mine.data?.length ? <p className="mt-3 text-sm text-ink-3">{t("You have not reported anything yet.")}</p> : (
          <ul className="mt-2 divide-y divide-line/70">
            {mine.data.map((r) => {
              const I = ICON[r.kind]; const s = STATUS[r.status];
              const title = cat.data.report_kinds.find((k) => k.key === r.kind)?.title ?? r.kind;
              return (
                <li key={r.id} className="flex items-start gap-3 py-3 text-sm">
                  <I className="mt-0.5 size-4 shrink-0 text-ink-3" />
                  <div className="min-w-0 flex-1">
                    <div className="text-ink">{t(title)} <span className="text-ink-3">· {t(zoneShort(r.zone))}</span></div>
                    {r.note && <div data-notr className="truncate text-xs text-ink-3">{r.note}</div>}
                  </div>
                  <span className="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ color: s.color, background: `color-mix(in srgb, ${s.color} 12%, transparent)` }}>{t(s.label)}</span>
                  <span className="hidden w-20 shrink-0 text-right text-xs text-ink-3 sm:block">{ago(r.created_at)}</span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-xs text-ink-3">{t("The first report each day earns {n} points. You can send up to {m} a day.", { n: cat.data.points.report, m: cat.data.reports_per_day })}</p>
      </Card>
    </ResidentPage>
  );
}
