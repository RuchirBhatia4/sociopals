"use client";

import { formatDistanceToNowStrict } from "date-fns";
import {
  Bot, Check, ChevronDown, ClipboardList, Copy, ExternalLink, GitBranch, GitMerge, GitPullRequest, KeyRound, Loader2, Lock, SendHorizontal, Sparkles, Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { PanelShell } from "@/components/chat/panel-shell";
import { UserAvatar } from "@/components/user-avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STATUS, taskAction, useProject, useTasks, type ProjectAi, type TaskStatus } from "@/hooks/use-project";
import { useModal } from "@/hooks/use-modal-store";
import { usePanel } from "@/hooks/use-panel-store";
import { toast } from "@/hooks/use-toast";
import { renderMessage } from "@/lib/format";
import { cn } from "@/lib/utils";

import { BranchDialog } from "./task-dialogs";
import { TaskAttachments } from "./task-attachments";
import { ProposalView, type ProposalData } from "./proposal-view";

type AiMsg = { id: string; role: "user" | "assistant"; content: string; aiLabel: string | null; proposal: ProposalData | null; appliedAt: string | null; commitSha: string | null; createdAt: string };

const AiBadge = ({ ai }: { ai: ProjectAi }) => (
  <span className={cn("h-5 w-5 rounded-md flex items-center justify-center text-[10px] font-bold flex-shrink-0", ai.provider === "ANTHROPIC" ? "bg-orange-500/20 text-orange-300" : "bg-emerald-500/20 text-emerald-300")}>
    {ai.provider === "ANTHROPIC" ? "C" : "G"}
  </span>
);

/** One task: details, its branch on GitHub, and an AI to help do it. */
export const TaskPanel = ({ channelId, taskId }: { channelId: string; taskId: string }) => {
  const qc = useQueryClient();
  const { onOpen } = useModal();
  const openPanel = usePanel((s) => s.open);
  const { data: project } = useProject(channelId);
  const { data: tasks = [] } = useTasks(channelId);
  const task = tasks.find((t) => t.id === taskId);
  const [busy, setBusy] = useState<string | null>(null);
  const [askBranch, setAskBranch] = useState(false);
  const [editing, setEditing] = useState(false);
  const [desc, setDesc] = useState("");

  /* ---------- AI chat ---------- */
  const mineAis = (project?.ais ?? []).filter((a) => a.mine);
  const [aiId, setAiId] = useState<string | null>(null);
  useEffect(() => { if (!aiId && mineAis[0]) setAiId(mineAis[0].id); }, [mineAis, aiId]);
  const ai = project?.ais.find((a) => a.id === aiId) ?? null;
  const { data: chat = [] } = useQuery<AiMsg[]>({
    queryKey: ["task-ai", taskId],
    queryFn: () => fetch(`/api/tasks/${taskId}/ai`).then((r) => (r.ok ? r.json() : [])),
  });
  const [prompt, setPrompt] = useState("");
  const [thinking, setThinking] = useState(false);
  // the answer as it streams in, and what the AI is doing between bits of answer
  const [live, setLive] = useState<{ text: string; status: string | null } | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [chat.length, thinking, live?.text.length, live?.status]);

  if (!project) return <PanelShell title="Task"><div className="p-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div></PanelShell>;
  if (!task) return <PanelShell title="Task"><p className="p-6 text-sm text-muted-foreground">This task no longer exists.</p></PanelShell>;

  const me = project.me.memberId;
  const mayEdit = project.me.canManage || task.createdById === me || task.assigneeId === me;
  const repo = project.channel.repo;
  const ghBlocked = !repo ? "Link a GitHub repo to this project first." : !project.github.connected ? "Connect your GitHub to use branches." : null;

  const act = async (key: string, body: Record<string, unknown>, ok?: (d: any) => string | void) => {
    try {
      setBusy(key);
      const d = await taskAction(channelId, { taskId, ...body });
      const msg = ok?.(d);
      if (msg) toast({ title: msg });
      return d;
    } catch (e: any) {
      toast({ title: e.message, tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  const ask = async (text = prompt) => {
    if (!text.trim() || !ai?.mine) return;
    setPrompt("");
    setThinking(true);
    const optimistic: AiMsg = { id: `tmp-${Date.now()}`, role: "user", content: text, aiLabel: null, proposal: null, appliedAt: null, commitSha: null, createdAt: new Date().toISOString() };
    qc.setQueryData<AiMsg[]>(["task-ai", taskId], (old = []) => [...old, optimistic]);
    setLive({ text: "", status: null });
    try {
      const res = await fetch(`/api/tasks/${taskId}/ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, aiKeyId: ai.id }),
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.error ?? "The AI request failed");
      // One JSON event per line: user, delta, status, ping, then done or error.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let finished = false;
      while (!finished) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.type === "delta") setLive((l) => ({ text: (l?.text ?? "") + ev.text, status: null }));
          else if (ev.type === "status") setLive((l) => ({ text: l?.text ?? "", status: ev.label }));
          else if (ev.type === "error") throw new Error(ev.error);
          else if (ev.type === "done") {
            qc.setQueryData<AiMsg[]>(["task-ai", taskId], (old = []) => [...old.filter((m) => m.id !== optimistic.id), ev.user, ev.reply]);
            finished = true;
          }
        }
      }
      if (!finished) throw new Error("The connection dropped before the answer finished. Try again.");
    } catch (e: any) {
      qc.setQueryData<AiMsg[]>(["task-ai", taskId], (old = []) => old.filter((m) => m.id !== optimistic.id));
      setPrompt(text);
      toast({ title: e?.message ?? "The AI request failed", tone: "error" });
    } finally {
      setThinking(false);
      setLive(null);
    }
  };

  const apply = async (m: AiMsg) => {
    const d = await act("apply", { type: "apply", messageId: m.id }, () => "Committed to your branch");
    if (d) qc.invalidateQueries(["task-ai", taskId]);
  };

  const copy = (t: string) => { navigator.clipboard?.writeText(t); toast({ title: "Copied" }); };
  const starters = [
    "Explain how I should approach this task in this codebase.",
    "Find the files I'll need to change.",
    "Write the code for this task.",
  ];

  return (
    <PanelShell
      title={`#${task.number} ${task.title}`}
      subtitle={<>{STATUS[task.status].label}{task.createdBy ? ` · created by ${task.createdBy.name.split(" ")[0]}` : ""} · {formatDistanceToNowStrict(new Date(task.createdAt), { addSuffix: true })}</>}
      icon={<ClipboardList className="h-4 w-4 text-amber-300" />}
      actions={
        <button type="button" onClick={() => openPanel("tasks")} className="h-8 px-2 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06]">All tasks</button>
      }
    >
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        {/* details */}
        <div className="p-4 space-y-3 border-b border-border">
          <div className="flex flex-wrap gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild disabled={!mayEdit}>
                <button type="button" className="h-8 px-2.5 rounded-lg border border-border text-xs flex items-center gap-1.5 hover:border-foreground/30 disabled:opacity-70">
                  <span className={cn("h-2 w-2 rounded-full", STATUS[task.status].dot)} /> {STATUS[task.status].label} {mayEdit && <ChevronDown className="h-3 w-3" />}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {(Object.keys(STATUS) as TaskStatus[]).map((s) => (
                  <DropdownMenuItem key={s} onClick={() => act("status", { type: "update", status: s })}>
                    <span className={cn("h-2 w-2 rounded-full mr-2", STATUS[s].dot)} /> {STATUS[s].label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild disabled={!mayEdit}>
                <button type="button" className="h-8 pl-1 pr-2.5 rounded-lg border border-border text-xs flex items-center gap-1.5 hover:border-foreground/30 disabled:opacity-70">
                  {task.assignee ? <UserAvatar src={task.assignee.imageUrl} className="h-6 w-6 md:h-6 md:w-6" /> : <span className="h-6 w-6 rounded-full border border-dashed border-muted-foreground/50" />}
                  {task.assignee ? (task.assignee.id === me ? "You" : task.assignee.name) : "Unassigned"} {mayEdit && <ChevronDown className="h-3 w-3" />}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
                <DropdownMenuLabel className="text-xs text-muted-foreground">Assign to</DropdownMenuLabel>
                {project.members.map((m) => (
                  <DropdownMenuItem key={m.id} onClick={() => act("assign", { type: "update", assigneeId: m.id })}>
                    <UserAvatar src={m.imageUrl} className="h-5 w-5 md:h-5 md:w-5 mr-2" /> {m.id === me ? "Me" : m.name}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => act("assign", { type: "update", assigneeId: null })}>Unassign</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {(project.me.canManage || task.createdById === me) && (
              <button
                type="button"
                aria-label="Delete task"
                onClick={async () => { if (window.confirm(`Delete task #${task.number}? Its branch on GitHub is kept.`)) { await act("delete", { type: "delete" }); openPanel("tasks"); } }}
                className="ml-auto h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
          {editing ? (
            <div>
              <textarea autoFocus value={desc} onChange={(e) => setDesc(e.target.value)} className="w-full h-28 rounded-lg bg-background border border-border px-3 py-2 text-sm outline-none focus:border-brand resize-none" />
              <div className="flex justify-end gap-2 mt-1.5">
                <button type="button" onClick={() => setEditing(false)} className="h-7 px-3 rounded-md text-xs hover:bg-foreground/[0.06]">Cancel</button>
                <button type="button" onClick={async () => { await act("desc", { type: "update", description: desc }); setEditing(false); }} className="h-7 px-3 rounded-md text-xs bg-brand text-brand-foreground">Save</button>
              </div>
            </div>
          ) : (
            <button type="button" disabled={!mayEdit} onClick={() => { setDesc(task.description ?? ""); setEditing(true); }} className="block w-full text-left text-sm text-foreground/85 whitespace-pre-wrap rounded-lg -mx-1 px-1 py-0.5 hover:bg-foreground/[0.03] disabled:hover:bg-transparent">
              {task.description || <span className="text-muted-foreground italic">{mayEdit ? "Add details…" : "No details."}</span>}
            </button>
          )}
        </div>

        {/* branch */}
        <div className="p-4 space-y-2.5 border-b border-border">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><GitBranch className="h-3.5 w-3.5" /> Branch</p>
          {task.branch ? (
            <>
              <div className="flex items-center gap-2 rounded-lg border border-border bg-background/60 px-3 h-9">
                <span className="font-mono text-[12px] truncate flex-1">{task.branch}</span>
                {task.branchUrl && <a href={task.branchUrl} target="_blank" rel="noopener noreferrer" aria-label="Open branch on GitHub" className="text-muted-foreground hover:text-foreground"><ExternalLink className="h-3.5 w-3.5" /></a>}
                <button type="button" aria-label="Copy git command" title="Copy: git fetch && git switch …" onClick={() => copy(`git fetch && git switch ${task.branch}`)} className="text-muted-foreground hover:text-foreground"><Copy className="h-3.5 w-3.5" /></button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!!busy || !!ghBlocked}
                  onClick={() => act("catchup", { type: "catchup" }, (d) => (d.result === "merged" ? `Caught up: merged the latest ${repo?.defaultBranch} into ${task.branch}` : `Already up to date with ${repo?.defaultBranch}`))}
                  className="h-8 px-3 rounded-lg text-xs font-medium border border-border hover:border-sky-400/60 hover:bg-sky-500/10 flex items-center gap-1.5 disabled:opacity-50"
                >
                  {busy === "catchup" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitMerge className="h-3.5 w-3.5 text-sky-400" />} Catch up to {repo?.defaultBranch ?? "main"}
                </button>
                {task.prUrl ? (
                  <a href={task.prUrl} target="_blank" rel="noopener noreferrer" className="h-8 px-3 rounded-lg text-xs font-medium border border-violet-400/40 bg-violet-500/10 text-violet-200 flex items-center gap-1.5">
                    <GitPullRequest className="h-3.5 w-3.5" /> Pull request #{task.prNumber} <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled={!!busy || !!ghBlocked}
                    onClick={() => act("pr", { type: "pr" }, () => "Pull request opened")}
                    className="h-8 px-3 rounded-lg text-xs font-medium border border-border hover:border-violet-400/60 hover:bg-violet-500/10 flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {busy === "pr" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitPullRequest className="h-3.5 w-3.5 text-violet-300" />} Open pull request
                  </button>
                )}
              </div>
            </>
          ) : (
            <button type="button" onClick={() => setAskBranch(true)} className="w-full h-9 rounded-lg border border-dashed border-border hover:border-brand/60 hover:bg-brand/[0.06] text-sm flex items-center justify-center gap-2">
              <GitBranch className="h-4 w-4 text-brand" /> Open a branch for this task
            </button>
          )}
          {ghBlocked && <p className="text-xs text-amber-300">{ghBlocked}</p>}
        </div>

        <TaskAttachments channelId={channelId} taskId={taskId} />

        {/* AI */}
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 flex-1"><Sparkles className="h-3.5 w-3.5 text-violet-300" /> AI help</p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="h-8 pl-1.5 pr-2 rounded-lg border border-border text-xs flex items-center gap-1.5 hover:border-foreground/30 max-w-[230px]">
                  {ai ? <AiBadge ai={ai} /> : <Bot className="h-4 w-4 text-muted-foreground" />}
                  <span className="truncate">{ai ? (ai.mine ? `${ai.label}` : ai.label) : "Choose an AI"}</span>
                  <ChevronDown className="h-3 w-3 flex-shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel className="text-xs text-muted-foreground">AI connected in this project</DropdownMenuLabel>
                {project.ais.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">Nobody has connected an AI yet.</p>}
                {project.ais.map((a) => (
                  <DropdownMenuItem key={a.id} disabled={!a.mine} onClick={() => a.mine && setAiId(a.id)} className="items-start py-2">
                    <AiBadge ai={a} />
                    <span className="ml-2 min-w-0 flex-1">
                      <span className="block text-sm">{a.label}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {a.mine ? <>{a.model} · ••••{a.last4}</> : <span className="flex items-center gap-1"><Lock className="h-3 w-3" /> Only {a.ownerName.split(" ")[0]} can use this</span>}
                      </span>
                    </span>
                    {a.id === aiId && <Check className="h-4 w-4 text-brand" />}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onOpen("settings", { tab: "ai" })}><KeyRound className="h-4 w-4 mr-2" /> {mineAis.length ? "Manage your AI keys" : "Add your AI key"}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {!mineAis.length && (
            <div className="rounded-xl border border-dashed border-border p-4 text-center">
              <Bot className="h-6 w-6 text-violet-300 mx-auto mb-2" />
              <p className="text-sm font-medium">Bring your own AI</p>
              <p className="text-xs text-muted-foreground mt-1 mb-3">Add your Claude or ChatGPT key to get help with this task. It reads the repo, explains, and can write the code onto your branch after you review it.</p>
              <button type="button" onClick={() => onOpen("settings", { tab: "ai" })} className="h-8 px-3 rounded-lg text-xs font-medium bg-violet-500/20 text-violet-200 hover:bg-violet-500/30">Add your AI key</button>
            </div>
          )}

          <div className="space-y-3">
            {chat.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="ml-8 rounded-2xl rounded-br-md bg-brand/[0.12] border border-brand/20 px-3 py-2 text-sm whitespace-pre-wrap break-words">{m.content}</div>
              ) : (
                <div key={m.id} className="mr-2">
                  <p className="text-[11px] text-muted-foreground mb-1 flex items-center gap-1"><Sparkles className="h-3 w-3 text-violet-300" /> {m.aiLabel}</p>
                  <div className="text-sm text-foreground/90 break-words leading-relaxed">{renderMessage(m.content, {})}</div>
                  {m.proposal && (
                    <ProposalView
                      proposal={m.proposal}
                      appliedSha={m.commitSha}
                      commitBase={repo?.url ?? null}
                      canApply={!!task.branch}
                      blocked={ghBlocked ?? (!task.branch ? "Open a branch for this task to apply these changes." : null)}
                      onApply={() => apply(m)}
                    />
                  )}
                </div>
              )
            )}
            {thinking && live?.text && (
              <div className="mr-2">
                <p className="text-[11px] text-muted-foreground mb-1 flex items-center gap-1"><Sparkles className="h-3 w-3 text-violet-300" /> {ai?.label ?? "AI"}</p>
                <div className="text-sm text-foreground/90 break-words leading-relaxed">{renderMessage(live.text, {})}</div>
              </div>
            )}
            {thinking && (live?.status || !live?.text) && (
              <p className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {live?.status ? `${live.status}…` : `${ai?.label ?? "AI"} is reading the code…`}</p>
            )}
            <div ref={bottom} />
          </div>

          {mineAis.length > 0 && chat.length === 0 && !thinking && (
            <div className="flex flex-col gap-1.5 mt-1">
              {starters.map((s) => (
                <button key={s} type="button" onClick={() => ask(s)} className="text-left text-xs rounded-lg border border-border px-3 py-2 text-muted-foreground hover:text-foreground hover:border-violet-400/50">{s}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {mineAis.length > 0 && (
        <div className="p-3 border-t border-border">
          <div className="flex items-end gap-1 rounded-xl border border-border bg-elevated focus-within:border-violet-400/60 p-1.5">
            <textarea
              value={prompt}
              rows={1}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); ask(); } }}
              placeholder={`Ask ${ai?.label ?? "your AI"} about this task…`}
              className="flex-1 resize-none bg-transparent outline-none focus-visible:ring-0 px-1.5 py-1.5 text-sm max-h-40 scrollbar-thin"
            />
            <button type="button" aria-label="Ask" disabled={!prompt.trim() || thinking} onClick={() => ask()} className="h-8 w-8 rounded-lg bg-violet-500 text-white disabled:bg-transparent disabled:text-muted-foreground/50 flex items-center justify-center">
              <SendHorizontal className="h-4 w-4" />
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1 px-1">Uses your own key · it only commits when you press Apply</p>
        </div>
      )}

      <BranchDialog task={askBranch ? task : null} project={project} onClose={() => setAskBranch(false)} onDone={() => setAskBranch(false)} />
    </PanelShell>
  );
};
