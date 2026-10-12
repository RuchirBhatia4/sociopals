"use client";

import { Code2, X } from "lucide-react";
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";

import { LANGUAGES, highlight, labelFor } from "@/lib/highlight";

import { RunButton, RunOutput, useRunnable, useRunner } from "./run-output";
import { cn } from "@/lib/utils";

const INDENT = "  ";
const PAIRS: Record<string, string> = { "(": ")", "[": "]", "{": "}", '"': '"', "'": "'", "`": "`" };

export type CodeEditorHandle = { focus: () => void };

/**
 * An IDE-style editor inside the composer: highlighting as you type, line numbers,
 * Tab / Shift+Tab indenting, auto-indent on Enter, bracket pairs.
 * A transparent textarea sits exactly on top of the highlighted code.
 */
export const CodeEditor = forwardRef<CodeEditorHandle, {
  value: string;
  onChange: (v: string) => void;
  lang: string;
  onLangChange: (l: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}>(({ value, onChange, lang, onLangChange, onClose, onSubmit }, ref) => {
  const ta = useRef<HTMLTextAreaElement>(null);
  const pre = useRef<HTMLPreElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => ta.current?.focus() }));

  const { html, lang: detected } = useMemo(() => highlight(value, lang === "auto" ? null : lang), [value, lang]);
  const lines = value.split("\n").length;
  const runner = useRunner();
  const runLang = useRunnable().forLang(lang === "auto" ? detected : lang);

  const sync = () => {
    if (!ta.current) return;
    if (pre.current) { pre.current.scrollTop = ta.current.scrollTop; pre.current.scrollLeft = ta.current.scrollLeft; }
    if (gutter.current) gutter.current.scrollTop = ta.current.scrollTop;
  };

  /** Replace the selection and put the caret at start+caret. */
  const edit = (start: number, end: number, insert: string, caretFrom: number, caretTo = caretFrom) => {
    const next = value.slice(0, start) + insert + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => ta.current?.setSelectionRange(caretFrom, caretTo));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const { selectionStart: s, selectionEnd: t } = el;

    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); onSubmit(); return; }
    if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
    // Backspace in an empty editor goes back to plain text.
    if (e.key === "Backspace" && !value) { e.preventDefault(); onClose(); return; }

    if (e.key === "Tab") {
      e.preventDefault();
      const lineStart = value.lastIndexOf("\n", s - 1) + 1;
      if (s === t && !e.shiftKey) { edit(s, t, INDENT, s + INDENT.length); return; }
      // indent / outdent every selected line
      const block = value.slice(lineStart, t);
      const changed = e.shiftKey
        ? block.split("\n").map((l) => l.replace(new RegExp(`^ {1,${INDENT.length}}|^\\t`), ""))
        : block.split("\n").map((l) => INDENT + l);
      const joined = changed.join("\n");
      const firstDelta = e.shiftKey ? -(block.split("\n")[0].length - changed[0].length) : INDENT.length;
      edit(lineStart, t, joined, Math.max(lineStart, s + firstDelta), lineStart + joined.length);
      return;
    }

    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      const lineStart = value.lastIndexOf("\n", s - 1) + 1;
      const indent = /^[ \t]*/.exec(value.slice(lineStart, s))![0];
      const before = value[s - 1];
      const after = value[s];
      const opens = before && "([{:".includes(before);
      if (opens && after && PAIRS[before] === after) {
        // {|} -> {\n  |\n}
        const insert = "\n" + indent + INDENT + "\n" + indent;
        edit(s, t, insert, s + 1 + indent.length + INDENT.length);
      } else {
        const insert = "\n" + indent + (opens ? INDENT : "");
        edit(s, t, insert, s + insert.length);
      }
      return;
    }

    if (PAIRS[e.key] && !e.metaKey && !e.ctrlKey) {
      const isQuote = e.key === PAIRS[e.key];
      // wrap a selection, or add the closing partner when the next char is blank
      if (s !== t) { e.preventDefault(); edit(s, t, e.key + value.slice(s, t) + PAIRS[e.key], s + 1, t + 1); return; }
      const next = value[s];
      if (isQuote && next === e.key) { e.preventDefault(); edit(s, s, "", s + 1); return; }
      if (!next || /[\s)\]}]/.test(next)) { e.preventDefault(); edit(s, t, e.key + PAIRS[e.key], s + 1); return; }
    }
    if ([")", "]", "}"].includes(e.key) && value[s] === e.key && s === t) { e.preventDefault(); edit(s, s, "", s + 1); return; }
    if (e.key === "Backspace" && s === t && s > 0 && PAIRS[value[s - 1]] === value[s]) { e.preventDefault(); edit(s - 1, s + 1, "", s - 1); return; }
  };

  const shown = lang === "auto" ? (detected ? `Auto · ${labelFor(detected)}` : "Auto-detect") : labelFor(lang);

  return (
    <div className="rounded-lg border border-border bg-[hsl(var(--code-bg))] overflow-hidden mx-1.5 mb-1 animate-in fade-in slide-in-from-bottom-1 duration-150">
      <div className="flex items-center gap-2 h-8 pl-3 pr-1 border-b border-border/70 bg-foreground/[0.03]">
        <span className="flex gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        </span>
        <Code2 className="h-3.5 w-3.5 text-brand ml-1" />
        <label className="sr-only" htmlFor="code-lang">Language</label>
        <select
          id="code-lang"
          value={lang}
          onChange={(e) => { onLangChange(e.target.value); ta.current?.focus(); }}
          className="h-6 bg-transparent text-[12px] text-muted-foreground hover:text-foreground outline-none cursor-pointer [color-scheme:dark]"
        >
          {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.id === "auto" ? shown : l.label}</option>)}
        </select>
        <span className="ml-auto text-[11px] text-muted-foreground/70 hidden lg:inline">Tab indents · ⌘/Ctrl + Enter sends · Esc closes</span>
        {runLang && value.trim() && (
          <span className={cn("lg:ml-0", "ml-auto")}>
            <RunButton compact lang={runLang} running={runner.running} onRun={() => runner.run(runLang, value)} onStop={runner.stop} />
          </span>
        )}
        <button type="button" aria-label="Close code editor" onClick={onClose} className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/[0.08]">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="relative flex max-h-72 min-h-[96px] font-mono text-[13px] leading-[1.6]">
        <div ref={gutter} aria-hidden className="select-none overflow-hidden py-2.5 pl-3 pr-2 text-right text-muted-foreground/50 tabular-nums border-r border-border/50 bg-foreground/[0.02]">
          {Array.from({ length: lines }, (_, i) => <div key={i}>{i + 1}</div>)}
        </div>
        <div className="relative flex-1 min-w-0">
          <pre
            ref={pre}
            aria-hidden
            className="hljs absolute inset-0 m-0 py-2.5 px-3 overflow-hidden whitespace-pre pointer-events-none"
          >
            <code dangerouslySetInnerHTML={{ __html: html + "\n" }} />
          </pre>
          <textarea
            ref={ta}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            onScroll={sync}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            wrap="off"
            aria-label="Code"
            placeholder="// write or paste code"
            className={cn(
              "relative block w-full h-full min-h-[96px] max-h-72 resize-none bg-transparent py-2.5 px-3 outline-none focus-visible:ring-0 focus-visible:ring-offset-0 focus:shadow-none whitespace-pre overflow-auto scrollbar-thin",
              "text-transparent caret-[hsl(var(--brand))] selection:bg-brand/30 placeholder:text-muted-foreground/50"
            )}
            style={{ height: `${Math.min(18, Math.max(4, lines)) * 1.6 * 13 + 20}px` }}
          />
        </div>
      </div>
      <RunOutput lines={runner.lines} running={runner.running} status={runner.status} onClear={runner.clear} />
    </div>
  );
});
CodeEditor.displayName = "CodeEditor";
