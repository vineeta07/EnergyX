"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Crown } from "lucide-react";
import { api } from "@/lib/api";
import { ErrorBox, Loading, SimTag } from "@/components/ui";
import { cx, n } from "@/lib/format";
import { t } from "@/lib/i18n";
import { Plant } from "@/features/resident/Plant";
import { Card, ResidentPage } from "@/features/resident/ui";

interface Row { rank: number; id: number; name: string; points: number; items: number; level: number; level_name: string; me: boolean; demo: boolean }
const initials = (name: string) => name.split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase();
const RING = ["var(--gold)", "var(--blue)", "var(--warn)"];

function Avatar({ row, size }: { row: Row; size: number }) {
  return (
    <span data-notr className="grid place-items-center rounded-full bg-raised font-medium text-ink-2" style={{ width: size, height: size, fontSize: size * 0.34, border: row.rank <= 3 ? `3px solid ${RING[row.rank - 1]}` : "1px solid var(--line-2)" }}>
      {initials(row.name)}
    </span>
  );
}

export default function Leaderboard() {
  const [range, setRange] = useState<"week" | "all">("week");
  const { data, isLoading, error } = useQuery({ queryKey: ["resident", "leaderboard", range], queryFn: () => api.get<{ rows: Row[] }>(`/citizen/leaderboard?range=${range}`) });
  const rows = data?.rows ?? [];
  const podium = [rows[1], rows[0], rows[2]].filter(Boolean) as Row[];
  const me = rows.find((r) => r.me);

  return (
    <ResidentPage title={t("Leaderboard")} subtitle={t("Points from sorting items, the daily quiz, plastic codes, ideas and reports.")}
      actions={
        <div className="flex rounded-full border border-line-2 bg-panel p-1 text-sm" role="tablist">
          {(["week", "all"] as const).map((r) => (
            <button key={r} role="tab" aria-selected={range === r} onClick={() => setRange(r)} className={cx("rounded-full px-4 py-1.5 transition-colors", range === r ? "bg-accent text-on-accent" : "text-ink-2 hover:text-ink")}>{r === "week" ? t("This week") : t("All time")}</button>
          ))}
        </div>
      }>
      {isLoading ? <Loading /> : error ? <ErrorBox error={error} /> : rows.length === 0 ? (
        <Card className="text-center text-sm text-ink-2">{t("Nobody has scored yet this week. Scan an item and take first place.")}</Card>
      ) : (
        <>
          <Card>
            <div className="flex items-end justify-center gap-4 sm:gap-10">
              {podium.map((r) => (
                <div key={r.id} className={cx("flex w-24 flex-col items-center text-center", r.rank === 1 ? "pb-4" : "")}>
                  {r.rank === 1 && <Crown className="mb-1 size-6 text-gold" />}
                  <div className="relative">
                    <Avatar row={r} size={r.rank === 1 ? 84 : 64} />
                    <span className="num absolute -bottom-2 left-1/2 grid size-6 -translate-x-1/2 place-items-center rounded-full text-xs font-semibold text-on-accent" style={{ background: RING[r.rank - 1] }}>{r.rank}</span>
                  </div>
                  <div data-notr className={cx("mt-3 w-full truncate text-sm font-medium", r.me ? "text-accent" : "text-ink")}>{r.me ? t("You") : r.name.split(" ")[0]}</div>
                  <div className="num text-sm text-ink-2">{n(r.points)}</div>
                  <div className="text-xs text-ink-3">{t(r.level_name)}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-0">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <h2 className="text-[15px] font-semibold text-ink">{t("Everyone")}</h2>
              {rows.some((r) => r.demo) && <SimTag label={t("Neighbours are simulated")} />}
            </div>
            <ol>
              {rows.map((r) => (
                <li key={r.id} className={cx("flex items-center gap-3 border-b border-line/70 px-5 py-3 last:border-0", r.me && "bg-accent/10")}>
                  <span className="num w-7 text-sm text-ink-3">#{r.rank}</span>
                  <Avatar row={r} size={38} />
                  <div className="min-w-0 flex-1">
                    <div data-notr className="truncate text-[15px] font-medium text-ink">{r.name}{r.me && <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-on-accent">{t("You")}</span>}</div>
                    <div className="text-xs text-ink-3">{r.items === 1 ? t("1 item") : t("{n} items", { n: r.items })} · {t("Level {n}", { n: r.level })} {t(r.level_name)}</div>
                  </div>
                  <Plant level={r.level} size={40} />
                  <span className="num w-14 text-right text-[15px] font-semibold text-ink">{n(r.points)}</span>
                </li>
              ))}
            </ol>
          </Card>
          {!me && <p className="text-center text-sm text-ink-3">{t("You are not on the board for this period yet. One scan puts you on it.")}</p>}
        </>
      )}
    </ResidentPage>
  );
}
