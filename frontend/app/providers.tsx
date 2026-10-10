"use client";
import { Fragment, useEffect, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { restoreLang, useLang } from "@/lib/i18n";
import { restoreTheme } from "@/lib/theme";

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  const make = () => new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: false, retry: 1 } } });
  if (typeof window === "undefined") return make();
  browserQueryClient ??= make();
  return browserQueryClient;
}

export function Providers({ children }: { children: ReactNode }) {
  const lang = useLang((s) => s.lang);
  useEffect(() => { restoreLang(); restoreTheme(); }, []);
  // t() reads the language from the store, so remounting the tree on a language change
  // re-renders every string. The query cache lives above the key and survives.
  return (
    <QueryClientProvider client={getQueryClient()}>
      <Fragment key={lang}>{children}</Fragment>
    </QueryClientProvider>
  );
}
