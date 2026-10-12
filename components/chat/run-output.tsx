"use client";

import { Loader2, Play, Square, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { runCode, runLabel, type RunEvent, type RunLang } from "@/lib/runner";
import { cn } from "@/lib/utils";

type Line = { kind: "out" | "err" | "info"; text: string };

/** Run state + a terminal-style output panel, shared by message code blocks and the editor. */
export function useRunner() {
  const [lines, setLines] = useState<Line[] | null>(null);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");
  const stopRef = useRef<() => void>();

  useEffect(() => () => stopRef.current?.(), []);

  const run = useCallback((lang: RunLang, code: string, stdin?: string) => {
    stopRef.current?.();
    setLines([]);
    setRunning(true);
    stopRef.current = runCode(lang, code, (e: RunEvent) => {
      if (e.type === "status") setStatus(e.text);
      else if (e.type === "out" || e.type === "err") setLines((l) => [...(l ?? []), { kind: e.type as "out" | "err", text: e.text }]);
      else {
        setRunning(false);
        setStatus("");
        setLines((l) => [...(l ?? []), { kind: "info", text: e.type === "done" ? `Finished in ${e.ms < 1000 ? `${e.ms} ms` : `${(e.ms / 1000).toFixed(1)} s`}` : e.reason }]);
      }
    }, { stdin });
  }, []);
  const stop = useCallback(() => stopRef.current?.(), []);
  const clear = useCallback(() => { stopRef.current?.(); setLines(null); }, []);
  return { lines, running, status, run, stop, clear };
}

export const RunButton = ({ lang, running, onRun, onStop, compact }: { lang: RunLang; running: boolean; onRun: () => void; onStop: () => void; compact?: boolean }) =>
  running ? (
    <button type="button" onClick={onStop} className="h-6 px-2 rounded-md text-[11px] font-medium bg-destructive/15 text-destructive hover:bg-destructive/25 flex items-center gap-1">
      <Square className="h-3 w-3 fill-current" /> Stop
    </button>
  ) : (
    <button
      type="button"
      onClick={onRun}
      title={`Run this ${runLabel(lang)} in a sandbox in your browser`}
      className="h-6 px-2 rounded-md text-[11px] font-semibold bg-brand/[0.15] text-brand hover:bg-brand/25 flex items-center gap-1"
    >
      <Play className="h-3 w-3 fill-current" /> {compact ? "Run" : `Run ${runLabel(lang)}`}
    </button>
  );

export const RunOutput = ({ lines, running, status, onClear }: { lines: Line[] | null; running: boolean; status: string; onClear: () => void }) => {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }); }, [lines]);
  if (lines === null) return null;
  return (
    <div className="border-t border-border/70 bg-black/40">
      <div className="flex items-center gap-2 h-7 px-3 text-[11px] text-muted-foreground">
        <span className="font-semibold uppercase tracking-wider">Output</span>
        {running && <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> {status || "Running…"}</span>}
        <button type="button" aria-label="Close output" onClick={onClear} className="ml-auto h-5 w-5 rounded flex items-center justify-center hover:bg-foreground/10 hover:text-foreground">
          <X className="h-3 w-3" />
        </button>
      </div>
      <div ref={box} className="max-h-60 overflow-auto scrollbar-thin px-3 pb-2.5 font-mono text-[12.5px] leading-[1.55] whitespace-pre-wrap break-words" aria-live="polite">
        {!running && !lines.some((l) => l.kind !== "info") && <div className="text-muted-foreground">(no output)</div>}
        {lines.map((l, i) => (
          <div key={i} className={cn(l.kind === "err" && "text-rose-400", l.kind === "info" && "text-muted-foreground/70 text-[11px] mt-1", l.kind === "out" && "text-foreground/90")}>
            {l.text}
          </div>
        ))}
      </div>
    </div>
  );
};

/** Which languages can run here: Python/JavaScript in the browser, plus whatever the code runner offers. */
export function useRunnable() {
  const { data } = useQuery<{ configured: boolean; languages: { id: string; label: string }[] }>({
    queryKey: ["run-langs"],
    queryFn: () => fetch("/api/run").then((r) => (r.ok ? r.json() : { configured: false, languages: [] })),
    staleTime: 5 * 60_000,
  });
  const server = (data?.languages ?? []).filter((l) => l.id !== "python" && l.id !== "javascript");
  const all = [{ id: "python", label: "Python" }, { id: "javascript", label: "JavaScript" }, ...server];
  const forLang = (lang?: string | null): RunLang | null => (lang && all.some((l) => l.id === lang) ? lang : null);
  return { all, forLang, serverReady: !!server.length };
}
