import Link from "next/link";
import { PublicNav, PublicFooter } from "@/components/shell/PublicNav";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <PublicNav />
      <main className="mx-auto flex flex-1 max-w-xl flex-col items-center justify-center px-4 py-20 text-center">
        <span className="font-serif text-6xl font-medium text-accent">404</span>
        <h1 className="mt-4 font-serif text-2xl font-medium text-ink">Page not found</h1>
        <p className="mt-2 text-sm text-ink-2">
          The page or route you requested does not exist or has moved.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="inline-flex h-10 items-center rounded-full bg-accent px-5 text-sm font-medium text-on-accent hover:opacity-90"
          >
            Return home
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex h-10 items-center rounded-full border border-line-2 px-5 text-sm text-ink hover:border-ink-3"
          >
            Go to dashboard
          </Link>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
