"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { loadGsap, prefersReducedMotion } from "./gsapKit";

/** Thin bar at the top of the page that fills as you scroll. */
export function ScrollProgress() {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let kill: (() => void) | undefined; let off = false;
    loadGsap().then(({ gsap, ScrollTrigger }) => {
      if (off || !bar.current) return;
      const tween = gsap.fromTo(bar.current, { scaleX: 0 }, { scaleX: 1, ease: "none", transformOrigin: "left center", scrollTrigger: { start: 0, end: "max", scrub: 0.2 } });
      kill = () => { tween.scrollTrigger?.kill(); tween.kill(); };
      ScrollTrigger.refresh();
    });
    return () => { off = true; kill?.(); };
  }, []);
  return <div className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5"><div ref={bar} className="h-full origin-left scale-x-0 bg-accent" /></div>;
}

/** Card that leans a few degrees towards the pointer. */
export function Tilt({ children, className, max = 5 }: { children: ReactNode; className?: string; max?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const [ok, setOk] = useState(false);
  useEffect(() => { setOk(!prefersReducedMotion() && window.matchMedia("(hover: hover)").matches); }, []);
  const move = async (e: React.PointerEvent) => {
    if (!ok || !el.current) return;
    const { gsap } = await loadGsap();
    const r = el.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    gsap.to(el.current, { rotateY: x * max * 2, rotateX: -y * max * 2, transformPerspective: 900, duration: 0.5, ease: "power2.out" });
  };
  const leave = async () => { if (!el.current) return; const { gsap } = await loadGsap(); gsap.to(el.current, { rotateX: 0, rotateY: 0, duration: 0.7, ease: "elastic.out(1,0.6)" }); };
  return <div ref={el} onPointerMove={move} onPointerLeave={leave} className={className}>{children}</div>;
}

/** Pulls a button slightly towards the pointer. */
export function Magnetic({ children, className }: { children: ReactNode; className?: string }) {
  const el = useRef<HTMLSpanElement>(null);
  const move = async (e: React.PointerEvent) => {
    if (prefersReducedMotion() || !el.current) return;
    const { gsap } = await loadGsap();
    const r = el.current.getBoundingClientRect();
    gsap.to(el.current, { x: (e.clientX - (r.left + r.width / 2)) * 0.18, y: (e.clientY - (r.top + r.height / 2)) * 0.25, duration: 0.3, ease: "power2.out" });
  };
  const leave = async () => { if (!el.current) return; const { gsap } = await loadGsap(); gsap.to(el.current, { x: 0, y: 0, duration: 0.6, ease: "elastic.out(1,0.5)" }); };
  return <span ref={el} onPointerMove={move} onPointerLeave={leave} className={`inline-block ${className ?? ""}`}>{children}</span>;
}
