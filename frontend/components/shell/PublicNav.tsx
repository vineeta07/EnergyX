import Link from "next/link";
import { Logo } from "./Logo";

export function PublicNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-line/60 bg-canvas/70 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-5 text-[13px] text-ink-2 md:flex">
          <Link href="/about" className="hover:text-ink">How it works</Link>
          <Link href="/impact" className="hover:text-ink">Impact</Link>
          <Link href="/about#architecture" className="hover:text-ink">Architecture</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/login" className="rounded px-3 py-1.5 text-[13px] text-ink-2 hover:text-ink">Sign in</Link>
          <Link href="/dashboard" className="rounded bg-accent px-3 py-1.5 text-[13px] font-semibold text-[#04140b] hover:bg-[#5ae89a]">Launch Dashboard</Link>
        </div>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-xs text-ink-3 sm:px-6">
        <Logo />
        <span>Demo network data is simulated and labelled as such. Built for the Amazon hackathon.</span>
        <div className="flex gap-4"><Link href="/about">How it works</Link><Link href="/impact">Impact</Link><Link href="/login">Sign in</Link></div>
      </div>
    </footer>
  );
}
