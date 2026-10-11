"use client";
import Link from "next/link";
import { ChevronRight, Lightbulb, MapPin, Recycle, Trash2 } from "lucide-react";
import { t } from "@/lib/i18n";
import { BIN, MATERIAL_LABEL, VERDICT, type Item } from "@/lib/resident";
import { IDEAS, IDEA_CATEGORY } from "@/lib/ideas";
import { MaterialDot } from "./ui";

/** What to do with one item: the verdict, the bin, why, and how to get it ready. The why and how are English only for now. */
export function ItemVerdict({ item, photo }: { item: Item; photo?: string | null }) {
  const v = VERDICT[item.verdict];
  const ideas = item.ideas ? IDEAS.filter((i) => i.category === item.ideas).length : 0;
  // Recyclables and things worth remaking have somewhere better to go than the bin.
  const dropoff = (item.verdict === "recycle" || item.verdict === "upcycle") && item.material !== "organic";
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-panel shadow-[var(--shadow)]">
      <div className="flex items-center gap-4 p-5" style={{ background: `color-mix(in srgb, ${v.color} 12%, var(--panel))` }}>
        {photo && <img src={photo} alt="" className="size-20 shrink-0 rounded-xl object-cover" />}
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-ink-2"><MaterialDot material={item.material} />{t(MATERIAL_LABEL[item.material] ?? item.material)}</div>
          <h2 className="mt-0.5 font-serif text-2xl font-medium leading-tight text-ink">{t(item.name)}</h2>
          <p className="mt-1 text-[15px] font-semibold" style={{ color: v.color }}>{t(v.title)}</p>
        </div>
      </div>
      <div className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full" style={{ background: `color-mix(in srgb, ${v.color} 16%, transparent)`, color: v.color }}><Trash2 className="size-4" /></span>
          <div><div className="text-xs text-ink-3">{t("Where it goes")}</div><div className="text-[15px] font-medium text-ink">{t(BIN[item.bin])}</div><div className="text-sm text-ink-2">{t(v.line)}</div></div>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-xl bg-raised/70 p-3"><dt className="text-xs text-ink-3">{t("Why")}</dt><dd data-notr className="mt-0.5 leading-relaxed text-ink-2">{item.why}</dd></div>
          <div className="rounded-xl bg-raised/70 p-3"><dt className="text-xs text-ink-3">{t("Before you bin it")}</dt><dd data-notr className="mt-0.5 leading-relaxed text-ink-2">{item.prep}</dd></div>
        </dl>
        {(item.resin || ideas > 0 || dropoff) && (
          <div className="flex flex-wrap gap-2">
            {item.resin && (
              <Link href={`/resin?code=${item.resin}`} className="inline-flex items-center gap-2 rounded-full border border-line-2 px-3.5 py-2 text-sm text-ink hover:border-ink-3">
                <Recycle className="size-4 text-accent" />{t("Probably plastic code {n}. Check the triangle.", { n: item.resin })}<ChevronRight className="size-4 text-ink-3" />
              </Link>
            )}
            {dropoff && (
              <Link href={`/dropoff?m=${item.material}`} className="inline-flex items-center gap-2 rounded-full border border-line-2 px-3.5 py-2 text-sm text-ink hover:border-ink-3">
                <MapPin className="size-4 text-accent" />{t("Where to take it")}<ChevronRight className="size-4 text-ink-3" />
              </Link>
            )}
            {ideas > 0 && (
              <Link href={`/ideas?m=${item.ideas}`} className="inline-flex items-center gap-2 rounded-full border border-line-2 px-3.5 py-2 text-sm text-ink hover:border-ink-3">
                <Lightbulb className="size-4 text-gold" />{t(ideas === 1 ? "1 idea for {what}" : "{n} ideas for {what}", { n: ideas, what: t(IDEA_CATEGORY[item.ideas!]).toLowerCase() })}<ChevronRight className="size-4 text-ink-3" />
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
