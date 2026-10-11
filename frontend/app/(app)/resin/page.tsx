"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ScanLine } from "lucide-react";
import { api } from "@/lib/api";
import { ErrorBox, Loading } from "@/components/ui";
import { cx } from "@/lib/format";
import { t } from "@/lib/i18n";
import { RECYCLED_COLOR, RECYCLED_LABEL, param, useApplyReward, useCatalogue, useProfile, type Resin, type Reward } from "@/lib/resident";
import { Card, ResidentPage, showReward } from "@/features/resident/ui";

/** The chasing-arrows triangle with the code inside, as it is moulded into the plastic. */
function Triangle({ code, size = 56, color = "var(--ink-2)" }: { code: number; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" aria-hidden>
      <path d="M30 7 53 49H7Z" fill="none" stroke={color} strokeWidth="3.4" strokeLinejoin="round" strokeDasharray="34 7" />
      <text x="30" y="41" textAnchor="middle" fontSize="20" fontWeight="600" fill={color} className="num">{code}</text>
    </svg>
  );
}

export default function ResinCodes() {
  const cat = useCatalogue();
  const me = useProfile();
  const apply = useApplyReward();
  // Arriving from a scan result: /resin?code=1. This screen only ever renders in the browser, after sign-in.
  const [code, setCode] = useState<number | null>(() => { const c = Number(param("code")); return c >= 1 && c <= 7 ? c : null; });
  const [err, setErr] = useState<unknown>(null);

  // The server gives the points the first time each code is looked up.
  const award = (c: number) => api.post<Reward>("/citizen/resin", { code: c }).then((r) => { apply(r); showReward(r); }, setErr);
  function open(c: number) { setCode(c); setErr(null); award(c); }
  const first = useRef(code);
  useEffect(() => { if (first.current) award(first.current); /* once, for the code in the address */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (cat.isLoading) return <Loading />;
  if (cat.error || !cat.data) return <ErrorBox error={cat.error} />;
  const resins = cat.data.resins;
  const cur = resins.find((r) => r.code === code) ?? null;
  const seen = me.data?.counts.resins ?? 0;

  return (
    <ResidentPage title={t("Plastic codes")} subtitle={t("Turn the item over. Inside a small triangle there is a number from 1 to 7. Tap the number you see.")}
      actions={<span className="rounded-full bg-raised px-3 py-1.5 text-sm text-ink-2">{t("{a} of 7 looked up", { a: seen })}</span>}>
      {err != null && <ErrorBox error={err} />}
      <Card>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {resins.map((r) => (
            <button key={r.code} onClick={() => open(r.code)} aria-pressed={code === r.code}
              className={cx("flex flex-col items-center rounded-2xl border px-1 py-3 transition-all hover:-translate-y-0.5", code === r.code ? "border-accent bg-accent/10" : "border-line hover:border-line-2")}>
              <Triangle code={r.code} color={code === r.code ? "var(--accent)" : "var(--ink-2)"} />
              <span data-notr className="mt-1 text-sm font-medium text-ink">{r.short}</span>
              <span className="mt-1 size-2 rounded-full" style={{ background: RECYCLED_COLOR[r.recycled] }} />
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-3">
          {(Object.keys(RECYCLED_LABEL) as Resin["recycled"][]).map((k) => <span key={k} className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: RECYCLED_COLOR[k] }} />{t(RECYCLED_LABEL[k])}</span>)}
        </div>
      </Card>

      {cur ? (
        <div className="overflow-hidden rounded-2xl border border-line bg-panel shadow-[var(--shadow)]">
          <div className="flex items-center gap-4 p-5" style={{ background: `color-mix(in srgb, ${RECYCLED_COLOR[cur.recycled]} 12%, var(--panel))` }}>
            <Triangle code={cur.code} size={72} color={RECYCLED_COLOR[cur.recycled]} />
            <div className="min-w-0">
              <h2 className="font-serif text-2xl font-medium leading-tight text-ink"><span data-notr>{cur.short}</span></h2>
              <div data-notr className="text-sm text-ink-2">{cur.code === 7 ? t(cur.name) : cur.name}</div>
              <div className="mt-1 text-[15px] font-semibold" style={{ color: RECYCLED_COLOR[cur.recycled] }}>{t(RECYCLED_LABEL[cur.recycled])}</div>
            </div>
          </div>
          <dl className="grid gap-3 p-5 text-sm sm:grid-cols-3">
            <div className="rounded-xl bg-raised/70 p-3"><dt className="text-xs text-ink-3">{t("You find it in")}</dt><dd data-notr className="mt-0.5 leading-relaxed text-ink-2">{cur.found}</dd></div>
            <div className="rounded-xl bg-raised/70 p-3"><dt className="text-xs text-ink-3">{t("What happens to it")}</dt><dd data-notr className="mt-0.5 leading-relaxed text-ink-2">{cur.note}</dd></div>
            <div className="rounded-xl bg-raised/70 p-3"><dt className="text-xs text-ink-3">{t("Using it again at home")}</dt><dd data-notr className="mt-0.5 leading-relaxed text-ink-2">{cur.reuse}</dd></div>
          </dl>
        </div>
      ) : (
        <Card className="text-center text-sm text-ink-2">{t("No number on it? Thin wrappers and multi-layer packets often have none. Treat them as code 7.")}</Card>
      )}

      <Link href="/scan" className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-panel p-4 text-sm text-ink-2 shadow-[var(--shadow)] hover:border-line-2">
        <span className="flex items-center gap-3"><ScanLine className="size-5 text-accent" />{t("Cannot find the triangle? Scan the item and we will suggest the likely code.")}</span>
      </Link>
    </ResidentPage>
  );
}
