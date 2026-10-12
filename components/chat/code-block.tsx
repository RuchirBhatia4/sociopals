"use client";

import { Check, ChevronDown, Copy, Keyboard, Play } from "lucide-react";
import { useMemo, useState } from "react";

import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { highlight, labelFor } from "@/lib/highlight";
import { cn } from "@/lib/utils";
import { BROWSER_LANGS } from "@/lib/runner";

import { RunButton, RunOutput, useRunnable, useRunner } from "./run-output";

/** A code block in a message: highlighted, with its language, copy, and Run for Python / JavaScript. */
export const CodeBlock = ({ code, lang }: { code: string; lang?: string }) => {
  const [copied, setCopied] = useState(false);
  const { html, lang: used } = useMemo(() => highlight(code, lang), [code, lang]);
  const runner = useRunner();
  const runnable = useRunnable();
  const runLang = runnable.forLang(used);
  const [stdinOpen, setStdinOpen] = useState(false);
  const [stdin, setStdin] = useState("");
  const onServer = !!runLang && !(BROWSER_LANGS as readonly string[]).includes(runLang);
  // Unlabelled snippets: offer to run them as either language.
  const unknown = !runLang && (!used || used === "plaintext");
  const lines = code.split("\n").length;

  return (
    <div className="my-1.5 rounded-lg border border-border bg-[hsl(var(--code-bg))] overflow-hidden max-w-full group/code">
      <div className="flex items-center gap-2 h-8 px-2 pl-3 border-b border-border/70 bg-foreground/[0.03]">
        <span className="text-[11px] font-medium text-muted-foreground">{used && used !== "plaintext" ? labelFor(used) : "Code"}</span>
        <span className="text-[11px] text-muted-foreground/60">{lines} {lines === 1 ? "line" : "lines"}</span>
        <div className="ml-auto flex items-center gap-1">
          {onServer && (
            <button type="button" aria-pressed={stdinOpen} title="Give the program input (stdin)" onClick={() => setStdinOpen(!stdinOpen)} className={cn("h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/[0.08]", stdinOpen && "text-brand")}>
              <Keyboard className="h-3.5 w-3.5" />
            </button>
          )}
          {runLang && <RunButton lang={runLang} running={runner.running} onRun={() => runner.run(runLang, code, stdin)} onStop={runner.stop} />}
          {unknown && (runner.running ? (
            <RunButton lang="python" running onRun={() => {}} onStop={runner.stop} />
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="h-6 px-2 rounded-md text-[11px] font-semibold bg-brand/[0.15] text-brand hover:bg-brand/25 flex items-center gap-1">
                  <Play className="h-3 w-3 fill-current" /> Run <ChevronDown className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="text-xs text-muted-foreground">Run as</DropdownMenuLabel>
                {runnable.all.map((l) => (
                  <DropdownMenuItem key={l.id} onClick={() => runner.run(l.id, code)}>{l.label}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ))}
          <button
            type="button"
            onClick={() => { navigator.clipboard?.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="h-6 px-2 rounded-md text-[11px] text-muted-foreground hover:text-foreground hover:bg-foreground/[0.08] flex items-center gap-1"
          >
            {copied ? <><Check className="h-3 w-3 text-brand" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
          </button>
        </div>
      </div>
      <pre className="hljs p-3 font-mono text-[13px] leading-[1.6] overflow-x-auto whitespace-pre scrollbar-thin">
        <code dangerouslySetInnerHTML={{ __html: html || "&nbsp;" }} />
      </pre>
      {stdinOpen && (
        <div className="border-t border-border/70 px-3 py-2">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Input (stdin)</label>
          <textarea value={stdin} onChange={(e) => setStdin(e.target.value)} rows={2} placeholder="What the program reads, one value per line" className="mt-1 w-full rounded-md bg-background border border-border px-2 py-1.5 font-mono text-[12px] outline-none focus:border-brand resize-y" />
        </div>
      )}
      <RunOutput lines={runner.lines} running={runner.running} status={runner.status} onClear={runner.clear} />
    </div>
  );
};
