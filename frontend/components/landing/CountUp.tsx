"use client";
import { useEffect, useRef, useState } from "react";
import { n } from "@/lib/format";
import { loadGsap, prefersReducedMotion } from "./gsapKit";

/** Counts up to `value` the first time it scrolls into view. */
export function CountUp({ value, digits = 0 }: { value: number | null; digits?: number }) {
  const el = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState<number | null>(null);

  useEffect(() => {
    if (value == null) return;
    if (prefersReducedMotion()) { setShown(value); return; }
    let off = false; let kill: (() => void) | undefined;
    loadGsap().then(({ gsap, ScrollTrigger }) => {
      if (off || !el.current) return;
      const obj = { v: 0 };
      const st = ScrollTrigger.create({ trigger: el.current, start: "top 92%", once: true, onEnter: () => { gsap.to(obj, { v: value, duration: 1.6, ease: "power2.out", onUpdate: () => setShown(obj.v) }); } });
      kill = () => st.kill();
    });
    return () => { off = true; kill?.(); };
  }, [value]);

  return <span ref={el}>{value == null ? "–" : n(shown ?? 0, digits)}</span>;
}
