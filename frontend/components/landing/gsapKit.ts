"use client";

/** Load GSAP and ScrollTrigger only in the browser, once. */
export async function loadGsap() {
  const { gsap } = await import("gsap");
  const { ScrollTrigger } = await import("gsap/ScrollTrigger");
  const { Flip } = await import("gsap/Flip");
  gsap.registerPlugin(ScrollTrigger, Flip);
  return { gsap, ScrollTrigger, Flip };
}

export const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
