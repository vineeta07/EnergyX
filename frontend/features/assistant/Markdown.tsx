import type { ReactNode } from "react";

/** Minimal, safe Markdown renderer (bold, italic, lists, tables, paragraphs). No HTML injection. */
function inline(s: string, key: string | number): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("**")) out.push(<strong key={`${key}-${i++}`}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={`${key}-${i++}`} className="num rounded bg-canvas px-1">{t.slice(1, -1)}</code>);
    else out.push(<em key={`${key}-${i++}`}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.trim().startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        if (!cells.every((c) => /^-+$/.test(c))) rows.push(cells);
        i++;
      }
      blocks.push(
        <table key={i}><thead><tr>{rows[0].map((c, j) => <th key={j}>{inline(c, j)}</th>)}</tr></thead>
          <tbody>{rows.slice(1).map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j}>{inline(c, `${k}${j}`)}</td>)}</tr>)}</tbody></table>,
      );
      continue;
    }
    if (/^\s*[-*] /.test(l) || /^\s*\d+\. /.test(l)) {
      const ordered = /^\s*\d+\. /.test(l);
      const items: string[] = [];
      while (i < lines.length && (/^\s*[-*] /.test(lines[i]) || /^\s*\d+\. /.test(lines[i]))) {
        items.push(lines[i].replace(/^\s*([-*]|\d+\.) /, ""));
        i++;
      }
      const L = ordered ? "ol" : "ul";
      blocks.push(<L key={i}>{items.map((it, k) => <li key={k}>{inline(it, k)}</li>)}</L>);
      continue;
    }
    if (l.trim()) blocks.push(<p key={i}>{inline(l.replace(/^#+\s*/, ""), i)}</p>);
    i++;
  }
  return <div className="md">{blocks}</div>;
}
