"use client";

import { diffLines } from "diff";
import { Check, ChevronDown, ExternalLink, FilePlus2, FileMinus2, FileCode2, GitCommit, Loader2 } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

export type ProposalFile = { path: string; action: "create" | "update" | "delete"; content?: string; original?: string | null };
export type ProposalData = { summary: string; files: ProposalFile[] };

/** The AI's proposed changes as a diff, with Apply to branch. */
export const ProposalView = ({
  proposal, appliedSha, commitBase, canApply, blocked, onApply,
}: {
  proposal: ProposalData;
  appliedSha: string | null;
  commitBase: string | null;
  canApply: boolean;
  blocked?: string | null;
  onApply: () => Promise<void>;
}) => {
  const [busy, setBusy] = useState(false);
  const [openFile, setOpenFile] = useState<string | null>(proposal.files[0]?.path ?? null);
  const stats = proposal.files.map((f) => {
    const parts = diffLines(f.original ?? "", f.action === "delete" ? "" : f.content ?? "");
    return {
      ...f,
      parts,
      added: parts.filter((p) => p.added).reduce((n, p) => n + (p.count ?? 0), 0),
      removed: parts.filter((p) => p.removed).reduce((n, p) => n + (p.count ?? 0), 0),
    };
  });

  return (
    <div className="mt-2 rounded-xl border border-border overflow-hidden bg-[hsl(var(--code-bg))]">
      <div className="px-3 py-2 border-b border-border/70 flex items-center gap-2">
        <GitCommit className="h-4 w-4 text-brand flex-shrink-0" />
        <p className="text-sm font-medium flex-1 min-w-0 truncate">{proposal.summary}</p>
        <span className="text-[11px] text-muted-foreground whitespace-nowrap">{proposal.files.length} {proposal.files.length === 1 ? "file" : "files"}</span>
      </div>
      {stats.map((f) => {
        const Icon = f.action === "create" ? FilePlus2 : f.action === "delete" ? FileMinus2 : FileCode2;
        const isOpen = openFile === f.path;
        return (
          <div key={f.path} className="border-b border-border/50 last:border-0">
            <button type="button" onClick={() => setOpenFile(isOpen ? null : f.path)} className="w-full flex items-center gap-2 px-3 h-8 text-left hover:bg-foreground/[0.03]">
              <Icon className={cn("h-3.5 w-3.5 flex-shrink-0", f.action === "create" ? "text-brand" : f.action === "delete" ? "text-rose-400" : "text-sky-400")} />
              <span className="font-mono text-[12px] truncate flex-1">{f.path}</span>
              <span className="text-[11px] tabular-nums text-brand">+{f.added}</span>
              <span className="text-[11px] tabular-nums text-rose-400">−{f.removed}</span>
              <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", !isOpen && "-rotate-90")} />
            </button>
            {isOpen && (
              <pre className="max-h-80 overflow-auto scrollbar-thin text-[12px] leading-[1.55] font-mono pb-2">
                {f.parts.map((p, i) => {
                  const lines = p.value.replace(/\n$/, "").split("\n");
                  // Long unchanged stretches are folded.
                  const shown = !p.added && !p.removed && lines.length > 8 ? [...lines.slice(0, 3), `⋯ ${lines.length - 6} unchanged lines`, ...lines.slice(-3)] : lines;
                  return shown.map((l, j) => (
                    <div
                      key={`${i}-${j}`}
                      className={cn(
                        "px-3 whitespace-pre",
                        p.added && "bg-brand/[0.12] text-emerald-200",
                        p.removed && "bg-rose-500/[0.12] text-rose-200",
                        !p.added && !p.removed && l.startsWith("⋯") && "text-muted-foreground/60 italic"
                      )}
                    >
                      <span className="select-none opacity-50 mr-2">{p.added ? "+" : p.removed ? "−" : " "}</span>
                      {l}
                    </div>
                  ));
                })}
              </pre>
            )}
          </div>
        );
      })}
      <div className="px-3 py-2 border-t border-border/70 flex items-center gap-2">
        {appliedSha ? (
          <span className="text-xs text-brand flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5" /> Committed
            {commitBase && (
              <a href={`${commitBase}/commit/${appliedSha}`} target="_blank" rel="noopener noreferrer" className="underline flex items-center gap-0.5">
                {appliedSha.slice(0, 7)} <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </span>
        ) : blocked ? (
          <span className="text-xs text-amber-300">{blocked}</span>
        ) : (
          <span className="text-xs text-muted-foreground">Review the changes, then commit them to your task branch.</span>
        )}
        {!appliedSha && canApply && !blocked && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => { setBusy(true); try { await onApply(); } finally { setBusy(false); } }}
            className="ml-auto h-8 px-3 rounded-lg text-xs font-semibold bg-brand text-brand-foreground disabled:opacity-50 flex items-center gap-1.5"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitCommit className="h-3.5 w-3.5" />} Apply to branch
          </button>
        )}
      </div>
    </div>
  );
};
