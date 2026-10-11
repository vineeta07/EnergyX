"use client";
import type { ReactNode } from "react";

const leaf = (x: number, y: number, flip: boolean, s = 1) => (
  // An oval tilted up and away from the stem, with its near end on the stem at (x, y).
  <ellipse key={`${x}-${y}-${flip}`} cx={x + (flip ? -7 : 7) * s} cy={y - 4 * s} rx={8 * s} ry={3.6 * s} transform={`rotate(${flip ? 30 : -30} ${x + (flip ? -7 : 7) * s} ${y - 4 * s})`} fill="var(--accent)" />
);
const tree = (x: number, base: number, h: number, r: number) => (
  <g key={x}>
    <path d={`M${x} ${base}V${base - h}`} stroke="var(--ink-3)" strokeWidth={Math.max(2.5, r / 5)} strokeLinecap="round" />
    <circle cx={x} cy={base - h - r * 0.55} r={r} fill="var(--accent)" />
    <circle cx={x - r * 0.35} cy={base - h - r * 0.75} r={r * 0.28} fill="var(--accent-dim)" opacity="0.7" />
  </g>
);

/** The plant for a level, 1 (a seed) to 7 (a grove). Drawn from the theme colours, so it follows light and dark. */
export function Plant({ level, size = 96 }: { level: number; size?: number }) {
  const base = 78;
  let body: ReactNode;
  if (level <= 1) body = <ellipse cx="50" cy={base - 6} rx="8" ry="5.6" fill="var(--gold)" />;
  else if (level === 2) body = <><path d={`M50 ${base}V${base - 26}`} stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />{leaf(50, base - 24, false, 1.2)}{leaf(50, base - 24, true, 1.2)}</>;
  else if (level === 3) body = <><path d={`M50 ${base}V${base - 38}`} stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />{leaf(50, base - 14, false, 1.1)}{leaf(50, base - 23, true, 1.1)}{leaf(50, base - 36, false, 1.1)}{leaf(50, base - 36, true, 1.1)}</>;
  else if (level === 4) body = <><path d={`M50 ${base}V${base - 52}`} stroke="var(--ink-3)" strokeWidth="3.2" strokeLinecap="round" />{leaf(50, base - 14, false, 1.2)}{leaf(50, base - 24, true, 1.2)}{leaf(50, base - 34, false, 1.2)}{leaf(50, base - 42, true, 1.1)}{leaf(50, base - 50, false, 1.1)}{leaf(50, base - 50, true, 1.1)}</>;
  else if (level === 5) body = tree(50, base, 30, 20);
  else if (level === 6) body = tree(50, base, 30, 27);
  else body = <>{tree(26, base, 18, 13)}{tree(74, base, 20, 14)}{tree(50, base, 30, 20)}</>;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      {body}
      <path d={`M22 ${base + 2}c8 -7 48 -7 56 0Z`} fill="var(--ink-2)" opacity="0.55" />
      <path d={`M18 ${base + 2}h64`} stroke="var(--line-2)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Progress to the next level as a ring, with the plant growing inside it. */
export function GrowthRing({ level, progress, size = 200, children }: { level: number; progress: number; size?: number; children?: ReactNode }) {
  const r = 46, c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--accent-dim)" strokeWidth="6" />
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p)} className="ring-progress" />
      </svg>
      <div className="grid place-items-center">
        <Plant level={level} size={size * 0.6} />
        {children}
      </div>
    </div>
  );
}
