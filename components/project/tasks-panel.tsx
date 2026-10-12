"use client";

import { ClipboardList, GitBranch, GitPullRequest, Plus } from "lucide-react";
import { useState } from "react";

import { PanelShell } from "@/components/chat/panel-shell";
import { UserAvatar } from "@/components/user-avatar";
import { STATUS, useProject, useTasks, type Task, type TaskStatus } from "@/hooks/use-project";
import { usePanel } from "@/hooks/use-panel-store";
import { cn } from "@/lib/utils";

import { BranchDialog, NewTaskDialog } from "./task-dialogs";

const ORDER: TaskStatus[] = ["IN_PROGRESS", "TODO", "IN_REVIEW", "DONE"];

/** Every task in the project, grouped by status. */
export const TasksPanel = ({ channelId }: { channelId: string }) => {
  const { data: project } = useProject(channelId);
  const { data: tasks = [] } = useTasks(channelId);
  const open = usePanel((s) => s.open);
  const [filter, setFilter] = useState<"all" | "mine">("all");
  const [creating, setCreating] = useState(false);
  const [askBranch, setAskBranch] = useState<Task | null>(null);
  const list = filter === "mine" ? tasks.filter((t) => t.assigneeId === project?.me.memberId) : tasks;

  const pick = (t: Task) => (!t.branch && t.assigneeId === project?.me.memberId && t.status !== "DONE" ? setAskBranch(t) : open("task", { taskId: t.id }));

  return (
    <PanelShell
      title="Tasks"
      subtitle={project?.channel.repo ? `${project.channel.repo.owner}/${project.channel.repo.name}` : "No repo linked yet"}
      icon={<ClipboardList className="h-4 w-4 text-amber-300" />}
      actions={
        <button type="button" onClick={() => setCreating(true)} className="h-8 px-2.5 rounded-md text-xs font-medium bg-brand text-brand-foreground flex items-center gap-1">
          <Plus className="h-3.5 w-3.5" /> New
        </button>
      }
    >
      <div className="flex gap-1 p-2 border-b border-border">
        {(["all", "mine"] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} className={cn("flex-1 h-8 rounded-lg text-sm", filter === f ? "bg-foreground/[0.09] text-foreground font-medium" : "text-muted-foreground hover:text-foreground")}>
            {f === "all" ? `Everyone · ${tasks.length}` : `Mine · ${tasks.filter((t) => t.assigneeId === project?.me.memberId).length}`}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-3 space-y-5">
        {list.length === 0 && (
          <div className="text-center py-12 px-6">
            <ClipboardList className="h-8 w-8 text-amber-300 mx-auto mb-3" />
            <p className="font-medium text-sm">No tasks yet</p>
            <p className="text-xs text-muted-foreground mt-1">Break the project into tasks and assign them. Each one gets its own branch when someone starts it.</p>
          </div>
        )}
        {ORDER.map((s) => {
          const group = list.filter((t) => t.status === s);
          if (!group.length) return null;
          return (
            <section key={s}>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2 px-1">
                <span className={cn("h-2 w-2 rounded-full", STATUS[s].dot)} /> {STATUS[s].label} · {group.length}
              </h3>
              <div className="space-y-1.5">
                {group.map((t) => (
                  <button key={t.id} type="button" onClick={() => pick(t)} className="w-full text-left rounded-xl border border-border bg-background/60 hover:bg-background hover:border-foreground/20 p-3 transition">
                    <p className={cn("text-sm", t.status === "DONE" && "line-through text-muted-foreground")}><span className="text-muted-foreground">#{t.number}</span> {t.title}</p>
                    <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
                      {t.assignee ? (
                        <span className="flex items-center gap-1"><UserAvatar src={t.assignee.imageUrl} className="h-4 w-4 md:h-4 md:w-4" /> {t.assignee.id === project?.me.memberId ? "You" : t.assignee.name.split(" ")[0]}</span>
                      ) : <span>Unassigned</span>}
                      {t.branch && <span className="flex items-center gap-0.5 truncate"><GitBranch className="h-3 w-3" /> {t.branch}</span>}
                      {t.prNumber && <span className="flex items-center gap-0.5 text-violet-300"><GitPullRequest className="h-3 w-3" /> #{t.prNumber}</span>}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      {project && <NewTaskDialog open={creating} onClose={() => setCreating(false)} project={project} />}
      {project && (
        <BranchDialog
          task={askBranch}
          project={project}
          onClose={() => { const t = askBranch; setAskBranch(null); if (t) open("task", { taskId: t.id }); }}
          onDone={() => { const t = askBranch; setAskBranch(null); if (t) open("task", { taskId: t.id }); }}
        />
      )}
    </PanelShell>
  );
};
