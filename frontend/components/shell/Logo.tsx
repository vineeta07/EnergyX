"use client";
import Link from "next/link";

export function LogoMark({ size = 22 }: { size?: number }) {
  // An open loop with a short leaf-shaped tick: collection coming back as energy.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5" stroke="var(--accent)" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M12 12.5c0-3.2 2.3-5.4 6.3-5.7-.1 3.9-2.4 6-6.3 5.7Z" fill="var(--gold)" />
    </svg>
  );
}

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2">
      <LogoMark />
      <span className="font-serif text-[17px] font-medium text-ink">WattCycle</span>
    </Link>
  );
}
