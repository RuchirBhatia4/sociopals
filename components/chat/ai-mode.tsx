"use client";

import { Check, ChevronDown, Code2, KeyRound, Lock, MessageSquare, SlidersHorizontal, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useModal } from "@/hooks/use-modal-store";
import { useProject, type ProjectAi } from "@/hooks/use-project";
import { cn } from "@/lib/utils";

export type ComposerMode = "chat" | "code" | "ai";
export type AiContext = { size: 25 | 50 | 100 | 200; overview: boolean; tasks: boolean; repo: boolean };
const DEFAULT_CTX: AiContext = { size: 50, overview: true, tasks: true, repo: true };

/** Your AI choice and how much of the project it reads, remembered per browser. */
export function useAiComposer(channelId: string | undefined) {
  const { data: project } = useProject(channelId ?? "");
  const mine = (project?.ais ?? []).filter((a) => a.mine);
  const [aiId, setAiId] = useState<string | null>(null);
  const [ctx, setCtxState] = useState<AiContext>(DEFAULT_CTX);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("ai-composer") || "{}");
      if (saved.ctx) setCtxState({ ...DEFAULT_CTX, ...saved.ctx });
      if (saved.aiId) setAiId(saved.aiId);
    } catch {}
  }, []);
  useEffect(() => { if (mine.length && !mine.some((a) => a.id === aiId)) setAiId(mine[0].id); }, [mine, aiId]);
  const save = (next: { aiId?: string | null; ctx?: AiContext }) => {
    try { localStorage.setItem("ai-composer", JSON.stringify({ aiId: next.aiId ?? aiId, ctx: next.ctx ?? ctx })); } catch {}
  };
  return {
    project,
    all: project?.ais ?? [],
    mine,
    ai: mine.find((a) => a.id === aiId) ?? null,
    pick: (id: string) => { setAiId(id); save({ aiId: id }); },
    ctx,
    setCtx: (c: AiContext) => { setCtxState(c); save({ ctx: c }); },
    hasRepo: !!project?.channel.repo,
    githubConnected: !!project?.github.connected,
  };
}

const AiBadge = ({ ai }: { ai: ProjectAi }) => (
  <span className={cn("h-5 w-5 rounded-md flex items-center justify-center text-[10px] flex-shrink-0 text-white bg-gradient-to-br", ai.provider === "OPENAI" ? "from-emerald-400 to-teal-600" : "from-orange-300 to-rose-500")}>
    <Sparkles className="h-3 w-3" />
  </span>
);

/** Chat · Code · AI tabs at the top of a project's message box, plus the AI picker and context. */
export const ComposerModeBar = ({
  mode, onMode, composer,
}: { mode: ComposerMode; onMode: (m: ComposerMode) => void; composer: ReturnType<typeof useAiComposer> }) => {
  const { onOpen } = useModal();
  const { all, mine, ai, pick, ctx, setCtx, hasRepo, githubConnected } = composer;
  const tabs: { id: ComposerMode; label: string; icon: React.ElementType; hint: string }[] = [
    { id: "chat", label: "Chat", icon: MessageSquare, hint: "A normal message" },
    { id: "code", label: "Code", icon: Code2, hint: "Write code with highlighting (or type ```)" },
    { id: "ai", label: "AI", icon: Sparkles, hint: "Ask your own AI; it reads the conversation (or type /ai)" },
  ];

  return (
    <div className="flex items-center gap-1 px-1.5 pt-1.5 flex-wrap">
      <div className="flex rounded-lg bg-foreground/[0.05] p-0.5" role="tablist" aria-label="Message type">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={mode === t.id}
            title={t.hint}
            onClick={() => onMode(t.id)}
            className={cn(
              "h-7 px-2.5 rounded-md text-xs flex items-center gap-1.5 transition",
              mode === t.id ? (t.id === "ai" ? "bg-violet-500/25 text-violet-100" : "bg-elevated text-foreground shadow-sm") : "text-muted-foreground hover:text-foreground"
            )}
          >
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {mode === "ai" && (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="h-7 pl-1 pr-2 rounded-md text-xs border border-border hover:border-foreground/30 flex items-center gap-1.5 max-w-[200px]">
                {ai ? <AiBadge ai={ai} /> : <KeyRound className="h-3.5 w-3.5 text-muted-foreground ml-1" />}
                <span className="truncate">{ai ? `${ai.label} · ${ai.model}` : "Add your AI"}</span>
                <ChevronDown className="h-3 w-3 flex-shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-72">
              <DropdownMenuLabel className="text-xs text-muted-foreground">Answers always use your own key</DropdownMenuLabel>
              {all.map((a) => (
                <DropdownMenuItem key={a.id} disabled={!a.mine} onClick={() => a.mine && pick(a.id)} className="items-start py-2">
                  <AiBadge ai={a} />
                  <span className="ml-2 min-w-0 flex-1">
                    <span className="block text-sm">{a.label}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {a.mine ? <>{a.model} · ••••{a.last4}</> : <span className="flex items-center gap-1"><Lock className="h-3 w-3" /> Only {a.ownerName.split(" ")[0]} can use this</span>}
                    </span>
                  </span>
                  {ai?.id === a.id && <Check className="h-4 w-4 text-brand" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onOpen("settings", { tab: "ai" })}><KeyRound className="h-4 w-4 mr-2" /> {mine.length ? "Manage your AI keys" : "Add your Claude or ChatGPT key"}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="h-7 px-2 rounded-md text-xs border border-border hover:border-foreground/30 flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                <SlidersHorizontal className="h-3.5 w-3.5" /> Reads last {ctx.size} msgs{ctx.overview || ctx.tasks || (ctx.repo && hasRepo) ? " +" : ""}
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="w-72 bg-elevated border-border p-3 space-y-3">
              <div>
                <p className="text-xs font-medium mb-1.5">How much of the chat the AI reads</p>
                <div className="grid grid-cols-4 gap-1">
                  {([25, 50, 100, 200] as const).map((n) => (
                    <button key={n} type="button" onClick={() => setCtx({ ...ctx, size: n })} className={cn("h-8 rounded-md text-xs border", ctx.size === n ? "border-violet-400 bg-violet-500/15" : "border-border hover:border-foreground/30")}>{n}</button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">More context gives better answers but uses more of your AI credit.</p>
              </div>
              {[
                { k: "overview" as const, label: "Project overview doc" },
                { k: "tasks" as const, label: "Open tasks" },
                ...(hasRepo ? [{ k: "repo" as const, label: githubConnected ? "Look at the GitHub repo" : "GitHub repo (connect GitHub first)" }] : []),
              ].map((o) => (
                <label key={o.k} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={ctx[o.k]} disabled={o.k === "repo" && !githubConnected} onChange={(e) => setCtx({ ...ctx, [o.k]: e.target.checked })} className="h-4 w-4 accent-violet-500" />
                  {o.label}
                </label>
              ))}
              <p className="text-[11px] text-muted-foreground border-t border-border pt-2">The conversation is sent to your AI provider with your key. Everyone here sees the question and the answer.</p>
            </PopoverContent>
          </Popover>
        </>
      )}
    </div>
  );
};
