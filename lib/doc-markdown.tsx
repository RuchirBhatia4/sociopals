import { Fragment, ReactNode } from "react";

import { CodeBlock } from "@/components/chat/code-block";
import { inline } from "@/lib/format";
import { cn } from "@/lib/utils";

/*
  Markdown for project docs: # headings, - lists, 1. lists, - [ ] checklists (clickable),
  > quotes, --- rules, ``` code blocks, and the chat's inline styles (**bold**, `code`, links).
*/
export function renderDoc(md: string, onToggle?: (line: number) => void): ReactNode {
  const lines = md.split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  const key = () => `b${out.length}`;

  while (i < lines.length) {
    const line = lines[i];

    const fence = /^```([\w+#-]*)\s*$/.exec(line);
    if (fence) {
      const start = ++i;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) i++;
      out.push(<CodeBlock key={key()} lang={fence[1] || undefined} code={lines.slice(start, i).join("\n")} />);
      i++;
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const cls = h[1].length === 1 ? "text-2xl font-bold mt-6 mb-2" : h[1].length === 2 ? "text-lg font-semibold mt-5 mb-1.5" : "text-base font-semibold mt-4 mb-1";
      const Tag = (`h${h[1].length}` as "h1");
      out.push(<Tag key={key()} className={cn(cls, "first:mt-0 tracking-tight")}>{inline(h[2], {}, key())}</Tag>);
      i++;
      continue;
    }
    if (/^\s*(---|\*\*\*)\s*$/.test(line)) { out.push(<hr key={key()} className="my-5 border-border" />); i++; continue; }
    if (/^>\s?/.test(line)) {
      const start = i;
      while (i < lines.length && /^>\s?/.test(lines[i])) i++;
      out.push(
        <blockquote key={key()} className="my-3 border-l-[3px] border-brand/60 pl-3 text-muted-foreground">
          {lines.slice(start, i).map((l, j) => <p key={j}>{inline(l.replace(/^>\s?/, ""), {}, `${key()}-${j}`)}</p>)}
        </blockquote>
      );
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: ReactNode[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        const at = i;
        const text = lines[i].replace(/^\s*([-*]|\d+\.)\s+/, "");
        const task = /^\[( |x|X)\]\s?(.*)$/.exec(text);
        const indent = Math.min(3, Math.floor((/^\s*/.exec(lines[i])![0].length) / 2));
        items.push(
          <li key={at} className={cn(task && "list-none -ml-5 flex items-start gap-2")} style={indent ? { marginLeft: indent * 16 } : undefined}>
            {task ? (
              <>
                <input
                  type="checkbox"
                  checked={task[1] !== " "}
                  disabled={!onToggle}
                  onChange={() => onToggle?.(at)}
                  className="mt-1.5 h-4 w-4 accent-[hsl(var(--brand))] cursor-pointer"
                  aria-label={task[2] || "Checklist item"}
                />
                <span className={cn(task[1] !== " " && "line-through text-muted-foreground")}>{inline(task[2], {}, `t${at}`)}</span>
              </>
            ) : inline(text, {}, `l${at}`)}
          </li>
        );
        i++;
      }
      const List = ordered ? "ol" : "ul";
      out.push(<List key={key()} className={cn("my-2 pl-5 space-y-1", ordered ? "list-decimal" : "list-disc")}>{items}</List>);
      continue;
    }
    if (!line.trim()) { i++; continue; }
    const start = i;
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|```|>|\s*([-*]|\d+\.)\s+|\s*---\s*$)/.test(lines[i])) i++;
    out.push(
      <p key={key()} className="my-2 leading-relaxed">
        {lines.slice(start, i).map((l, j, arr) => <Fragment key={j}>{inline(l, {}, `p${start}-${j}`)}{j < arr.length - 1 && <br />}</Fragment>)}
      </p>
    );
  }
  return out;
}

/** Flip "- [ ]" / "- [x]" on one line. */
export const toggleChecklist = (md: string, line: number) =>
  md.split("\n").map((l, i) => (i === line ? l.replace(/\[( |x|X)\]/, (m) => (m === "[ ]" ? "[x]" : "[ ]")) : l)).join("\n");
