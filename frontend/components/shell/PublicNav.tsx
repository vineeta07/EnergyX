"use client";
import Link from "next/link";
import { Logo } from "./Logo";
import { LangSwitcher, ThemeToggle } from "./Prefs";
import { t } from "@/lib/i18n";

export function PublicNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-5 text-sm text-ink-2 md:flex">
          <Link href="/about" className="hover:text-ink">{t("How it works")}</Link>
          <Link href="/impact" className="hover:text-ink">{t("Impact")}</Link>
          <Link href="/about#architecture" className="hover:text-ink">{t("Architecture")}</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <LangSwitcher />
          <ThemeToggle />
          <Link href="/login" className="hidden rounded-md px-3 py-1.5 text-sm text-ink-2 hover:text-ink sm:block">{t("Sign in")}</Link>
          <Link href="/login" className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-on-accent hover:opacity-90">{t("Open the demo")}</Link>
        </div>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-xs text-ink-3 sm:px-6">
        <Logo />
        <span>{t("Demo figures come from a simulator and are marked as such. Built for the Amazon hackathon.")}</span>
        <div className="flex gap-4"><Link href="/about">{t("How it works")}</Link><Link href="/impact">{t("Impact")}</Link><Link href="/login">{t("Sign in")}</Link></div>
      </div>
    </footer>
  );
}
