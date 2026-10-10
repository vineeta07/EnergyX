"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { loadGsap, prefersReducedMotion } from "@/components/landing/gsapKit";

/**
 * Wraps the page area. Whenever a new page root appears (route change or data arriving),
 * its direct children rise in one after another. Content is never hidden if scripts fail.
 */
export function PageFx({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (prefersReducedMotion() || !box.current) return;
    const seen = new WeakSet<Element>();
    let off = false; let obs: MutationObserver | undefined;
    loadGsap().then(({ gsap }) => {
      const el = box.current;
      if (off || !el) return;
      const run = () => {
        const root = el.firstElementChild;
        if (!root || seen.has(root) || root.children.length < 2) return;
        seen.add(root);
        gsap.fromTo(Array.from(root.children), { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.55, ease: "power2.out", stagger: 0.07, clearProps: "transform,opacity" });
      };
      run();
      obs = new MutationObserver(run);
      obs.observe(el, { childList: true });
    });
    return () => { off = true; obs?.disconnect(); };
  }, []);
  return <div ref={box}>{children}</div>;
}
