import Link from "next/link";

export function LogoMark({ size = 22 }: { size?: number }) {
  // Closed loop with an energy bolt: the product concept in one glyph.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9.5" stroke="var(--accent)" strokeWidth="1.6" strokeDasharray="44 6" strokeLinecap="round" />
      <path d="M13.2 5.5 8.6 12.7h3.3l-1.1 5.8 4.6-7.3h-3.3l1.1-5.7Z" fill="var(--accent)" />
    </svg>
  );
}

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2">
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-tight text-ink">Watt<span className="text-accent">Cycle</span></span>
    </Link>
  );
}
