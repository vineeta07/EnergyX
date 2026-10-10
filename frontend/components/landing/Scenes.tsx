"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { t } from "@/lib/i18n";
import { loadGsap, prefersReducedMotion } from "./gsapKit";

/** Shows /media/hero.mp4 when you add one, and the drawn scene otherwise. */
export function MediaFrame({ children }: { children: ReactNode }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-raised">
      {children}
      <video className={`pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${playing ? "opacity-100" : "opacity-0"}`}
        src="/media/hero.mp4" poster="/media/hero.jpg" autoPlay muted loop playsInline onLoadedData={() => setPlaying(true)} onError={() => setPlaying(false)} />
    </div>
  );
}

/** The whole route in one picture. The truck follows the scroll, the smoke rises on its own. */
export function RoadScene() {
  const root = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);
  const [arrived, setArrived] = useState(false);
  const lit = hover || arrived;

  useEffect(() => {
    let ctx: { revert: () => void } | undefined;
    let dead = false;
    loadGsap().then(({ gsap }) => {
      if (dead || !root.current) return;
      ctx = gsap.context(() => {
        if (prefersReducedMotion()) { gsap.set("#truck", { x: 470 }); return; }
        gsap.fromTo("#truck", { x: 0 }, { x: 470, ease: "none", scrollTrigger: { trigger: root.current, start: "top 85%", end: "bottom 25%", scrub: 0.6, onUpdate: (self) => setArrived(self.progress > 0.92) } });
        gsap.to(".wheel", { rotation: 360, transformOrigin: "50% 50%", ease: "none", scrollTrigger: { trigger: root.current, start: "top 85%", end: "bottom 25%", scrub: 0.6 }, duration: 1 });
        gsap.fromTo(".puff", { y: 0, opacity: 0.8, scale: 0.6 }, { y: -46, opacity: 0, scale: 1.4, duration: 3.2, stagger: 1.05, repeat: -1, ease: "sine.out", transformOrigin: "50% 50%" });
      }, root);
    });
    return () => { dead = true; ctx?.revert(); };
  }, []);

  return (
    <div ref={root}>
      <MediaFrame>
        <svg viewBox="0 0 1200 280" className="block h-auto w-full" role="img" aria-label={t("A waste truck driving towards a power plant")}>
          <circle cx="170" cy="62" r="28" fill="var(--gold)" opacity="0.85" />
          <path d="M0 200 C150 150 280 190 430 170 C600 145 760 195 900 165 C1010 142 1110 170 1200 160 V280 H0Z" fill="var(--accent-dim)" />
          <path d="M0 225 C200 195 360 225 560 210 C760 195 980 225 1200 205 V280 H0Z" fill="var(--line)" />
          <rect x="0" y="232" width="1200" height="48" fill="var(--line-2)" opacity="0.55" />
          <path d="M0 256 H1200" stroke="var(--panel)" strokeWidth="3" strokeDasharray="26 22" />
          {/* collection point: bins and a stall */}
          <g transform="translate(70 168)">
            <rect x="0" y="22" width="34" height="42" rx="4" fill="var(--s-organic)" /><rect x="-3" y="16" width="40" height="9" rx="3" fill="var(--ink-3)" />
            <rect x="46" y="28" width="30" height="36" rx="4" fill="var(--s-plastic)" /><rect x="43" y="22" width="36" height="9" rx="3" fill="var(--ink-3)" />
            <path d="M100 64 V20 H168 V64" fill="var(--panel)" stroke="var(--line-2)" strokeWidth="2" /><path d="M94 22 L134 0 L174 22Z" fill="var(--warn)" opacity="0.8" />
          </g>
          {/* plant */}
          <g transform="translate(930 80)" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onClick={() => setHover(!hover)} style={{ cursor: "pointer" }} className="plant">
            <rect x="0" y="70" width="190" height="112" rx="6" fill="var(--panel)" stroke="var(--line-2)" strokeWidth="2" />
            <rect x="26" y="20" width="26" height="52" fill="var(--raised)" stroke="var(--line-2)" strokeWidth="2" />
            <rect x="96" y="0" width="26" height="72" fill="var(--raised)" stroke="var(--line-2)" strokeWidth="2" />
            {[28, 74, 120].map((x) => <rect key={x} x={x} y="96" width="30" height="26" rx="3" fill={lit ? "var(--gold)" : "var(--line)"} style={{ transition: "fill .5s, filter .5s", filter: lit ? "drop-shadow(0 0 6px var(--gold))" : "none" }} />)}
            <rect x="150" y="136" width="28" height="46" rx="3" fill="var(--accent)" />
            {[0, 1, 2].map((i) => <circle key={i} className="puff" cx="109" cy="-6" r="9" fill="var(--ink-3)" />)}
          </g>
          {/* truck */}
          <g id="truck" transform="translate(120 0)" pointerEvents="none">
            <g transform="translate(150 196)">
              <rect x="0" y="0" width="110" height="46" rx="5" fill="var(--panel)" stroke="var(--ink-2)" strokeWidth="2" />
              <path d="M110 12 H138 L156 32 V46 H110Z" fill="var(--panel)" stroke="var(--ink-2)" strokeWidth="2" />
              <rect x="124" y="18" width="18" height="12" fill="var(--raised)" stroke="var(--ink-2)" />
              <path d="M10 0 c0-16 18-16 18 0Z M32 0 c0-20 20-20 20 0Z M56 0 c0-14 16-14 16 0Z M76 0 c0-18 18-18 18 0Z" fill="var(--s-organic)" opacity="0.9" />
              {[24, 124].map((x) => <g key={x} className="wheel"><circle cx={x} cy="48" r="11" fill="var(--ink-2)" /><circle cx={x} cy="48" r="4" fill="var(--panel)" /><path d={`M${x - 8} 48 H${x + 8}`} stroke="var(--panel)" strokeWidth="2" /></g>)}
            </g>
          </g>
        </svg>
      </MediaFrame>
      <p className="mt-2 text-xs text-ink-3">{t("Scroll and the truck follows the road to the plant. The lights come on when it arrives, or hover the plant.")}</p>
    </div>
  );
}

/** One small flat scene per step of the loop. */
export function StepScene({ step }: { step: number }) {
  const bar = (x: number, y: number, w: number, h: number, c: string, k: string) => <rect key={k} className="grow" x={x} y={y} width={w} height={h} rx="3" fill={c} />;
  const scenes: ReactNode[] = [
    <g key="find">
      {[0, 1, 2].map((i) => <g key={i} transform={`translate(${34 + i * 62} 70)`}><rect width="44" height="78" rx="6" fill="var(--raised)" stroke="var(--line-2)" strokeWidth="2" />{bar(4, 78 - [30, 52, 66][i], 36, [30, 52, 66][i] - 4, i === 2 ? "var(--warn)" : "var(--s-organic)", "b" + i)}</g>)}
      <path d="M222 130 C240 118 252 126 268 100 S300 70 330 52" fill="none" stroke="var(--blue)" strokeWidth="3" strokeLinecap="round" strokeDasharray="6 5" />
      <circle cx="330" cy="52" r="5" fill="var(--blue)" />
    </g>,
    <g key="collect">
      <path d="M50 150 C110 150 120 70 190 70 S280 140 320 110" fill="none" stroke="var(--line-2)" strokeWidth="4" strokeDasharray="2 9" strokeLinecap="round" />
      {[[50, 150], [190, 70], [320, 110]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="11" fill="var(--panel)" stroke="var(--accent)" strokeWidth="3" />)}
      <rect x="296" y="124" width="46" height="34" rx="5" fill="var(--panel)" stroke="var(--ink-2)" strokeWidth="2" />
      <text x="319" y="146" fontSize="12" textAnchor="middle" fill="var(--ink-2)">{t("Hub")}</text>
    </g>,
    <g key="sort">
      <path d="M60 160 H150 L132 130 H78Z" fill="var(--raised)" stroke="var(--ink-2)" strokeWidth="2" /><rect x="88" y="104" width="34" height="26" rx="4" fill="var(--s-organic)" /><rect x="52" y="160" width="106" height="10" rx="3" fill="var(--ink-2)" />
      {[["var(--s-organic)", 120], ["var(--s-plastic)", 70], ["var(--s-paper)", 90], ["var(--s-metal)", 40]].map(([c, w], i) => <g key={i}>{bar(196, 62 + i * 30, Number(w), 18, String(c), "s" + i)}</g>)}
    </g>,
    <g key="choose">
      {[["var(--line-2)", 28, 40], ["var(--line-2)", 28, 70], ["var(--accent)", 28, 118]].map(([c, , v], i) => <g key={i} transform={`translate(${40 + i * 100} ${150 - Number(v)})`}><rect width="76" height={Number(v)} rx="5" fill={String(c)} opacity={i === 2 ? 1 : 0.65} />{i === 2 && <circle cx="38" cy="-14" r="9" fill="var(--gold)" />}</g>)}
      <path d="M30 168 H330" stroke="var(--line-2)" strokeWidth="2" />
    </g>,
    <g key="convert">
      <rect x="44" y="96" width="110" height="74" rx="5" fill="var(--panel)" stroke="var(--line-2)" strokeWidth="2" /><rect x="66" y="58" width="22" height="40" fill="var(--raised)" stroke="var(--line-2)" strokeWidth="2" />
      <circle cx="262" cy="110" r="52" fill="var(--panel)" stroke="var(--ink-2)" strokeWidth="3" />
      <path d="M222 130 A42 42 0 0 1 302 130" fill="none" stroke="var(--line-2)" strokeWidth="6" strokeLinecap="round" />
      <path className="needle" d="M262 110 L290 82" stroke="var(--gold)" strokeWidth="4" strokeLinecap="round" />
      <circle cx="262" cy="110" r="6" fill="var(--ink-2)" />
      <path d="M154 130 H208" stroke="var(--gold)" strokeWidth="3" strokeDasharray="5 6" />
    </g>,
    <g key="learn">
      {bar(70, 80, 46, 70, "var(--s-plastic)", "p")}{bar(124, 70, 46, 80, "var(--gold)", "m")}
      <path d="M236 60 a46 46 0 1 1 -34 14" fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" /><path d="M200 56 l6 22 l20 -10Z" fill="var(--accent)" />
      {bar(214, 98, 14, 36, "var(--s-plastic)", "p2")}{bar(232, 90, 14, 44, "var(--gold)", "m2")}
    </g>,
  ];
  return (
    <svg viewBox="0 0 360 200" className="h-full w-full" role="img" aria-hidden>
      <rect width="360" height="200" rx="14" fill="var(--raised)" opacity="0.6" />
      {scenes[step]}
    </svg>
  );
}
