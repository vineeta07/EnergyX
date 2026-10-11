"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Camera, ChevronRight, ImagePlus, Recycle, RotateCcw, ScanLine } from "lucide-react";
import { api } from "@/lib/api";
import { ErrorBox, Loading } from "@/components/ui";
import { cx } from "@/lib/format";
import { t } from "@/lib/i18n";
import { BIN, BIN_CHOICE, VERDICT, shrink, useApplyReward, type Item, type Reward, type Verdict } from "@/lib/resident";
import { BigButton, Card, MaterialDot, ResidentPage, showReward } from "@/features/resident/ui";

interface Guide { key: string; name: string; material: string; verdict: Verdict; bin: Item["bin"]; resin: number[]; why: string; prep: string; exact?: boolean }
interface Found { n: number; p: number; box: [number, number, number, number]; guide: Guide }
type Reply =
  | { mode: "unavailable"; reason: string }
  | { mode: "photo"; model: string; width: number; height: number; detections: Found[]; bins: Record<string, number>; reward: Reward | null };

const binColor = (b: string) => BIN_CHOICE.find((c) => c.bin === b)?.color ?? "var(--ink-3)";

/** The photo with a numbered box round every item the detector found. */
function Boxes({ src, found, active, onPick }: { src: string; found: Found[]; active: number | null; onPick: (n: number) => void }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-raised">
      <img src={src} alt="" className="block w-full" />
      {found.map((d) => {
        const [x1, y1, x2, y2] = d.box;
        const c = binColor(d.guide.bin);
        return (
          <button key={d.n} onClick={() => onPick(d.n)} aria-label={`${d.n}. ${t(d.guide.name)}`}
            className={cx("absolute rounded-md border-[3px] transition-opacity", active != null && active !== d.n && "opacity-35")}
            style={{ left: `${x1 * 100}%`, top: `${y1 * 100}%`, width: `${(x2 - x1) * 100}%`, height: `${(y2 - y1) * 100}%`, borderColor: c, background: active === d.n ? `color-mix(in srgb, ${c} 18%, transparent)` : "transparent" }}>
            <span className="num absolute -left-[3px] -top-[3px] grid size-6 place-items-center rounded-br-md text-xs font-semibold text-on-accent" style={{ background: c }}>{d.n}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function WholeBag() {
  const apply = useApplyReward();
  const [photo, setPhoto] = useState<string | null>(null);
  const [state, setState] = useState<"start" | "looking" | "done">("start");
  const [reply, setReply] = useState<Reply | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo); }, [photo]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setErr(null); setActive(null); setState("looking");
    try {
      const blob = await shrink(file);
      setPhoto(URL.createObjectURL(blob));
      const form = new FormData();
      form.append("file", blob, "bag.jpg");
      const r = await api.upload<Reply>("/citizen/bag", form);
      setReply(r); setState("done");
      if (r.mode === "photo" && r.reward) { apply(r.reward); showReward(r.reward); }
    } catch (e) { setErr(e); setState("start"); }
  }
  function reset() { setPhoto(null); setReply(null); setActive(null); setErr(null); setState("start"); }

  const found = reply?.mode === "photo" ? reply.detections : [];
  const byBin = BIN_CHOICE.map((c) => ({ ...c, items: found.filter((d) => d.guide.bin === c.bin) })).filter((g) => g.items.length);

  return (
    <ResidentPage title={t("Check a whole bag")} subtitle={t("Spread out what is in your bag or bin and take one photo. Every item gets a box and the bin it belongs in.")}>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={gallery} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
      {err != null && <ErrorBox error={err} />}

      {state === "start" && (
        <Card className="text-center">
          <div className="mx-auto grid size-24 place-items-center rounded-full bg-accent-dim text-accent"><ScanLine className="size-10" /></div>
          <h2 className="mt-4 font-serif text-xl font-medium text-ink">{t("Lay things out so they do not overlap")}</h2>
          <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-ink-2">{t("It spots five kinds of waste: food, recyclable packaging, drink bottles and cans, soft plastic, and foil-lined wrappers. The photo is not saved.")}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <BigButton onClick={() => camera.current?.click()}><Camera className="size-5" />{t("Take a photo")}</BigButton>
            <BigButton tone="quiet" onClick={() => gallery.current?.click()}><ImagePlus className="size-5" />{t("Choose a picture")}</BigButton>
          </div>
        </Card>
      )}

      {state === "looking" && (
        <Card className="flex flex-col items-center py-10">
          {photo && <img src={photo} alt="" className="scan-pulse max-h-56 rounded-2xl object-cover" />}
          <Loading label="Finding everything in the photo" />
        </Card>
      )}

      {state === "done" && reply?.mode === "unavailable" && (
        <Card className="text-center">
          <p className="text-[15px] text-ink">{t(reply.reason)}</p>
          <p className="mt-1 text-sm text-ink-2">{t("You can still check things one at a time.")}</p>
          <Link href="/scan" className="mt-4 inline-flex h-12 items-center gap-2 rounded-full bg-accent px-6 text-[15px] font-medium text-on-accent hover:opacity-90"><ScanLine className="size-5" />{t("Scan an item")}</Link>
        </Card>
      )}

      {state === "done" && reply?.mode === "photo" && photo && (
        <>
          <div className="grid items-start gap-5 md:grid-cols-[1.1fr_1fr]">
            <Boxes src={photo} found={found} active={active} onPick={(n) => setActive(active === n ? null : n)} />
            <Card>
              {found.length === 0 ? (
                <>
                  <p className="text-[15px] text-ink">{t("Nothing found in this photo.")}</p>
                  <p className="mt-1 text-sm text-ink-2">{t("Try brighter light, a plain floor, and items spread apart. For a single item, the item scan knows 30 kinds.")}</p>
                </>
              ) : (
                <>
                  <p className="font-serif text-2xl font-medium text-ink">{found.length === 1 ? t("1 item found") : t("{n} items found", { n: found.length })}</p>
                  <ul className="mt-3 space-y-2">
                    {byBin.map((g) => (
                      <li key={g.bin} className="flex items-center gap-3 text-sm">
                        <span className="h-6 w-1.5 rounded-full" style={{ background: g.color }} />
                        <span className="flex-1 text-ink">{t(g.label)}</span>
                        <span className="num font-semibold text-ink">{g.items.length}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs text-ink-3">{t("Tap a box or a row to see it on its own.")}</p>
                </>
              )}
            </Card>
          </div>

          {found.length > 0 && (
            <ul className="space-y-3">
              {found.map((d) => {
                const v = VERDICT[d.guide.verdict];
                const c = binColor(d.guide.bin);
                return (
                  <li key={d.n}>
                    <Card className={cx("cursor-pointer transition-colors", active === d.n && "border-accent/60")}>
                      <div onClick={() => setActive(active === d.n ? null : d.n)} className="flex items-start gap-3">
                        <span className="num grid size-7 shrink-0 place-items-center rounded-md text-sm font-semibold text-on-accent" style={{ background: c }}>{d.n}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                            <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink"><MaterialDot material={d.guide.material} />{t(d.guide.name)}</h3>
                            <span className="num text-xs text-ink-3">{t("{n}% sure", { n: Math.round(d.p * 100) })}</span>
                          </div>
                          <div className="mt-0.5 text-sm"><span className="font-medium" style={{ color: v.color }}>{t(v.title)}</span><span className="text-ink-3"> · {t(BIN[d.guide.bin])}</span></div>
                          {/* Named items reuse the item scan's notes, which are English only for now (as on the scan screen). */}
                          {d.guide.exact
                            ? <p data-notr className="mt-2 text-sm leading-relaxed text-ink-2">{d.guide.why} {d.guide.prep}</p>
                            : <p className="mt-2 text-sm leading-relaxed text-ink-2">{t(d.guide.why)} {t(d.guide.prep)}</p>}
                          {d.guide.resin.length > 0 && (
                            <Link href={`/resin?code=${d.guide.resin[0]}`} onClick={(e) => e.stopPropagation()} className="mt-3 inline-flex items-center gap-2 rounded-full border border-line-2 px-3.5 py-1.5 text-sm text-ink hover:border-ink-3">
                              <Recycle className="size-4 text-accent" />
                              {d.guide.exact ? t("Probably plastic code {n}. Check the triangle.", { n: d.guide.resin[0] })
                                : d.guide.resin.length === 1 ? t("Usually plastic code {a}. Check the triangle.", { a: d.guide.resin[0] }) : t("Usually plastic code {a} or {b}. Check the triangle.", { a: d.guide.resin[0], b: d.guide.resin[1] })}
                              <ChevronRight className="size-4 text-ink-3" />
                            </Link>
                          )}
                        </div>
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex flex-wrap gap-3">
            <BigButton onClick={reset}><RotateCcw className="size-4" />{t("Check another bag")}</BigButton>
            <Link href="/scan" className="inline-flex h-12 items-center gap-2 rounded-full border border-line-2 bg-panel px-6 text-[15px] font-medium text-ink hover:border-ink-3"><ScanLine className="size-4" />{t("Scan one item")}</Link>
          </div>
        </>
      )}
    </ResidentPage>
  );
}
