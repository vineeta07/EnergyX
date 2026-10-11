"use client";
import { useEffect } from "react";
import { useLang } from "@/lib/i18n";
import { translitText, translitWord, type ScriptKey } from "@/lib/translit";
import { translatePhrase } from "@/lib/phrases";

const SKIP = "[data-notr], code, pre, script, style, textarea, input, select option:checked, [contenteditable=true], .maplibregl-canvas";

/**
 * Anything still in English once the dictionary has had its say (sentences from the server,
 * names, codes inside text) is translated if it is a known sentence, and otherwise written out
 * phonetically in the language's own script. Runs on the page as it changes.
 */
export function Localizer() {
  const lang = useLang((s) => s.lang);
  useEffect(() => {
    if (lang === "en") return;
    const key = lang as ScriptKey;
    const done = new WeakMap<Text, string>();

    const fix = (node: Text) => {
      const text = node.data;
      if (done.get(node) === text || !/[A-Za-z]/.test(text)) return;
      const parent = node.parentElement;
      if (!parent || parent.closest(SKIP)) return;
      const lead = text.match(/^\s*/)![0], trail = text.match(/\s*$/)![0], core = text.trim();
      const out = translatePhrase(core, key, (w) => translitWord(w, key)) ?? core;
      const next = lead + translitText(out, key) + trail;
      done.set(node, next);
      if (next !== text) node.data = next;
    };
    const walk = (root: Node) => {
      if (root.nodeType === Node.TEXT_NODE) return fix(root as Text);
      if (root.nodeType !== Node.ELEMENT_NODE) return;
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) fix(n as Text);
    };

    let queue = new Set<Node>(); let raf = 0;
    const flush = () => { raf = 0; const q = queue; queue = new Set(); q.forEach((n) => { if (n.isConnected) walk(n); }); };
    const obs = new MutationObserver((ms) => {
      for (const m of ms) {
        if (m.type === "characterData") queue.add(m.target);
        else m.addedNodes.forEach((n) => queue.add(n));
      }
      if (!raf) raf = requestAnimationFrame(flush);
    });
    walk(document.body);
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => { obs.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, [lang]);
  return null;
}
