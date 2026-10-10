"use client";
import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { X, Send, Wrench } from "lucide-react";
import { api } from "@/lib/api";
import { Markdown } from "./Markdown";
import { cx } from "@/lib/format";

import { t } from "@/lib/i18n";
type Msg = { role: "user" | "assistant"; content: string; tools?: { name: string; input: any }[]; engine?: string; notice?: string };

const SUGGESTIONS = [
  "Why was Tehkhand WtE chosen?",
  "How much energy did organic waste generate this month?",
  "Which waste source should be collected first today?",
  "Why is this route so long?",
  "Which plant has the most spare capacity?",
  "How much CO₂ did we avoid this week?",
];

export function AssistantDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const ask = useMutation({
    mutationFn: (history: Msg[]) => api.post<{ answer: string; tools: any[]; engine: string; notice?: string }>("/assistant/chat", { messages: history.map(({ role, content }) => ({ role, content })) }),
    onSuccess: (r) => setMsgs((m) => [...m, { role: "assistant", content: r.answer, tools: r.tools, engine: r.engine, notice: r.notice }]),
    onError: (e: any) => setMsgs((m) => [...m, { role: "assistant", content: e.message }]),
  });
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, ask.isPending]);

  const send = (text: string) => {
    if (!text.trim() || ask.isPending) return;
    const next = [...msgs, { role: "user" as const, content: text.trim() }];
    setMsgs(next);
    setInput("");
    ask.mutate(next);
  };

  return (
    <div className={cx("fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-line-2 bg-panel transition-transform duration-300", open ? "translate-x-0" : "translate-x-full")} aria-hidden={!open}>
      <div className="flex h-14 items-center justify-between border-b border-line px-4">
        <div className="flex items-center gap-2"><span className="font-serif text-lg font-medium">{t("Ask WattCycle")}</span></div>
        <button onClick={onClose} aria-label={t("Close assistant")} className="text-ink-3 hover:text-ink"><X className="size-4" /></button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {msgs.length === 0 && (
          <div>
            <p className="text-sm text-ink-2">{t("Ask about your network. Each answer is worked out from live data using the lookups listed under it. It does not guess numbers.")}</p>
            <div className="mt-4 space-y-1.5">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="block w-full rounded-md border border-line bg-raised px-3 py-2 text-left text-sm text-ink-2 hover:border-line-2 hover:text-ink">{t(s)}</button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={cx(m.role === "user" ? "ml-10" : "mr-4")}>
            <div className={cx("rounded-lg px-3 py-2 text-sm leading-relaxed", m.role === "user" ? "bg-accent/10 text-ink" : "border border-line bg-raised text-ink-2")}>
              {m.role === "assistant" ? <Markdown text={m.content} /> : t(m.content)}
            </div>
            {m.tools && m.tools.length > 0 && (
              <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-ink-3">
                <Wrench className="size-3" />
                {m.tools.map((tool, k) => <span key={k} className="num rounded bg-canvas px-1 py-px">{tool.name}({Object.entries(tool.input ?? {}).filter(([, v]) => v != null).map(([k2, v]) => `${k2}=${v}`).join(", ")})</span>)}
              </div>
            )}
            {m.engine && <div className="mt-0.5 text-xs text-ink-3">{t("Engine")}: {m.engine}{m.notice ? `. ${m.notice}` : ""}</div>}
          </div>
        ))}
        {ask.isPending && <div className="mr-4 rounded-md border border-line bg-raised px-3 py-2 text-xs text-ink-3">{t("Looking up the data…")}</div>}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-2 border-t border-line p-3">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={t("Ask about waste, routes, plants or energy")} maxLength={1000}
          className="h-9 flex-1 rounded-md border border-line-2 bg-canvas px-3 text-sm outline-none focus:border-accent" />
        <button type="submit" disabled={ask.isPending} className="grid size-9 place-items-center rounded-md bg-accent text-on-accent hover:opacity-90 disabled:opacity-50" aria-label={t("Send")}><Send className="size-4" /></button>
      </form>
    </div>
  );
}
