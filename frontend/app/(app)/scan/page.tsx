"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Camera, Check, ImagePlus, RotateCcw, Search } from "lucide-react";
import { api } from "@/lib/api";
import { ErrorBox, Loading } from "@/components/ui";
import { cx } from "@/lib/format";
import { t } from "@/lib/i18n";
import { MATERIAL_LABEL, shrink, useApplyReward, useCatalogue, type Item, type Reward } from "@/lib/resident";
import { ItemVerdict } from "@/features/resident/ItemVerdict";
import { BigButton, Card, MaterialDot, ResidentPage, showReward } from "@/features/resident/ui";
import { useResidentDemo } from "@/features/resident/demo";

type Guess = { item: Item; p: number };
type ScanReply = { mode: "photo"; guesses: Guess[]; unsure: boolean } | { mode: "manual"; reason: string };
type LogReply = Reward & { item: Item; new_item: boolean; capped: boolean };
type Step =
  | { at: "start" }
  | { at: "looking" }
  | { at: "pick"; note?: string }
  | { at: "guess"; guesses: Guess[]; chosen: Item; unsure: boolean }
  | { at: "done"; reply: LogReply };

export default function Scan() {
  const cat = useCatalogue();
  const apply = useApplyReward();
  const [step, setStep] = useState<Step>({ at: "start" });
  const [photo, setPhoto] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo); }, [photo]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setErr(null); setStep({ at: "looking" });
    try {
      const blob = await shrink(file);
      setPhoto(URL.createObjectURL(blob));
      const form = new FormData();
      form.append("file", blob, "scan.jpg");
      const r = await api.upload<ScanReply>("/citizen/scan", form);
      if (r.mode === "manual" || r.guesses.length === 0) setStep({ at: "pick", note: t("Photo recognition is resting right now. Pick the item from the list instead.") });
      else setStep({ at: "guess", guesses: r.guesses, chosen: r.guesses[0].item, unsure: r.unsure });
    } catch {
      // A scan never dead-ends: whatever went wrong with the photo, the list still works.
      setStep({ at: "pick", note: t("The photo could not be read just now. Pick the item from the list instead.") });
    }
  }

  async function count(item: Item, method: "photo" | "picked", confidence?: number) {
    setSaving(true); setErr(null);
    try {
      const reply = await api.post<LogReply>("/citizen/log", { item: item.key, method, confidence });
      apply(reply); showReward(reply);
      setStep({ at: "done", reply });
    } catch (e) { setErr(e); } finally { setSaving(false); }
  }

  function reset() { setPhoto(null); setErr(null); setStep({ at: "start" }); }

  // While "Play the demo" drives this screen, show its photo and result instead of the local state.
  const demo = useResidentDemo((s) => s.scan);
  const driven = demo != null;
  const view: Step = !demo ? step
    : demo.reply ? { at: "done", reply: demo.reply }
    : demo.looking || !demo.chosen ? { at: "looking" }
    : { at: "guess", guesses: demo.guesses, chosen: demo.chosen, unsure: demo.unsure };
  const shownPhoto = demo ? demo.photo : photo;

  return (
    <ResidentPage title={t("Scan an item")} subtitle={t("Take a photo of one item. You will see what it is, which bin it belongs in, and whether it can be recycled or remade.")}>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={gallery} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
      {err != null && <ErrorBox error={err} />}

      {view.at === "start" && (
        <Card className="text-center">
          <div className="mx-auto grid size-24 place-items-center rounded-full bg-accent-dim text-accent"><Camera className="size-10" /></div>
          <h2 className="mt-4 font-serif text-xl font-medium text-ink">{t("One item, good light, plain background")}</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink-2">{t("The photo is only used to recognise the item. It is not saved.")}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <BigButton onClick={() => camera.current?.click()}><Camera className="size-5" />{t("Take a photo")}</BigButton>
            <BigButton tone="quiet" onClick={() => gallery.current?.click()}><ImagePlus className="size-5" />{t("Choose a picture")}</BigButton>
          </div>
          <button onClick={() => setStep({ at: "pick" })} className="mt-4 text-sm text-accent underline underline-offset-4">{t("No camera? Pick the item from a list")}</button>
          <p className="mt-3 text-sm text-ink-3">{t("Got a whole bag?")} <Link href="/bag" className="text-accent underline underline-offset-4">{t("Check everything in one photo")}</Link></p>
        </Card>
      )}

      {view.at === "looking" && (
        <Card className="flex flex-col items-center py-10">
          {shownPhoto && <img src={shownPhoto} alt="" className="scan-pulse size-40 rounded-2xl object-cover" />}
          <Loading label="Looking at your photo" />
        </Card>
      )}

      {view.at === "guess" && (
        <>
          <Card>
            <p className="text-sm text-ink-2">{view.unsure ? t("I am not sure about this one. Which is it?") : t("This looks like:")}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {view.guesses.map((g) => (
                <button key={g.item.key} disabled={driven} onClick={() => setStep({ ...view, chosen: g.item })}
                  className={cx("inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm transition-colors", view.chosen.key === g.item.key ? "border-accent bg-accent/10 text-ink" : "border-line-2 text-ink-2 hover:border-ink-3")}>
                  {view.chosen.key === g.item.key && <Check className="size-4 text-accent" />}{t(g.item.name)}<span className="num text-xs text-ink-3">{Math.round(g.p * 100)}%</span>
                </button>
              ))}
              <button disabled={driven} onClick={() => setStep({ at: "pick" })} className="rounded-full border border-dashed border-line-2 px-3.5 py-2 text-sm text-ink-2 hover:border-ink-3">{t("Something else")}</button>
            </div>
          </Card>
          <ItemVerdict item={view.chosen} photo={shownPhoto} />
          <div className="flex flex-wrap gap-3">
            <BigButton disabled={saving || driven} onClick={() => count(view.chosen, "photo", view.guesses.find((g) => g.item.key === view.chosen.key)?.p)}><Check className="size-5" />{t("That is right, count it")}</BigButton>
            <BigButton tone="quiet" disabled={driven} onClick={reset}><RotateCcw className="size-4" />{t("Try another photo")}</BigButton>
          </div>
        </>
      )}

      {view.at === "pick" && (
        cat.isLoading ? <Loading /> : cat.error ? <ErrorBox error={cat.error} /> : (
          <Picker items={cat.data!.items} note={view.note} saving={saving} onPick={(it) => count(it, "picked")} onBack={reset} />
        )
      )}

      {view.at === "done" && (
        <>
          <Card className="flex flex-wrap items-center gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-accent-dim text-accent"><Check className="size-6" /></span>
            <div className="min-w-[11rem] flex-1">
              <div className="text-[15px] font-medium text-ink">
                {view.reply.capped ? t("Counted. You have reached today's points limit.") : view.reply.new_item ? t("Counted. First time for this item: +{n} points.", { n: view.reply.awarded }) : t("Counted: +{n} points.", { n: view.reply.awarded })}
              </div>
              <div className="text-sm text-ink-2">
                {view.reply.profile.level.next_name ? t("{n} more points and your plant becomes a {name}.", { n: view.reply.profile.level.to_next, name: t(view.reply.profile.level.next_name).toLowerCase() }) : t("Your plant is fully grown. Keep the grove going.")}
              </div>
            </div>
            <BigButton disabled={driven} onClick={reset} className="w-full sm:w-auto"><Camera className="size-5" />{t("Scan another")}</BigButton>
          </Card>
          <ItemVerdict item={view.reply.item} photo={shownPhoto} />
        </>
      )}
    </ResidentPage>
  );
}

function Picker({ items, note, saving, onPick, onBack }: { items: Item[]; note?: string; saving: boolean; onPick: (i: Item) => void; onBack: () => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Item | null>(null);
  const groups = useMemo(() => {
    const k = q.trim().toLowerCase();
    const hit = items.filter((i) => !k || i.name.toLowerCase().includes(k) || t(i.name).toLowerCase().includes(k) || i.material.includes(k));
    return Object.keys(MATERIAL_LABEL).map((m) => ({ m, items: hit.filter((i) => i.material === m) })).filter((g) => g.items.length);
  }, [items, q]);

  if (sel) {
    return (
      <>
        <ItemVerdict item={sel} />
        <div className="flex flex-wrap gap-3">
          <BigButton disabled={saving} onClick={() => onPick(sel)}><Check className="size-5" />{t("Count it")}</BigButton>
          <BigButton tone="quiet" onClick={() => setSel(null)}>{t("Back to the list")}</BigButton>
        </div>
      </>
    );
  }
  return (
    <Card>
      {note && <p className="mb-4 rounded-xl bg-raised px-4 py-3 text-sm text-ink-2">{note}</p>}
      <div className="flex items-center gap-2 rounded-full border border-line-2 bg-canvas px-4 focus-within:border-accent">
        <Search className="size-4 text-ink-3" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search: bottle, newspaper, tea")} className="h-11 w-full bg-transparent text-[15px] text-ink placeholder:text-ink-3" style={{ outline: "none" }} autoFocus />
      </div>
      <div className="mt-4 space-y-4">
        {groups.map((g) => (
          <div key={g.m}>
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-ink-3"><MaterialDot material={g.m} />{t(MATERIAL_LABEL[g.m])}</div>
            <div className="flex flex-wrap gap-2">
              {g.items.map((i) => <button key={i.key} onClick={() => setSel(i)} className="rounded-full border border-line-2 px-3.5 py-2 text-sm text-ink hover:border-accent hover:bg-accent/10">{t(i.name)}</button>)}
            </div>
          </div>
        ))}
        {groups.length === 0 && <p className="py-6 text-center text-sm text-ink-3">{t("Nothing matches. Try a simpler word.")}</p>}
      </div>
      <button onClick={onBack} className="mt-5 text-sm text-accent underline underline-offset-4">{t("Use a photo instead")}</button>
    </Card>
  );
}
