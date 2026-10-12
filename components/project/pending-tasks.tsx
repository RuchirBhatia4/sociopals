"use client";

import { ChevronUp, ClipboardList, GitBranch, LayoutList, Plus } from "lucide-react";
import { useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { STATUS, useProject, useTasks, type Task } from "@/hooks/use-project";
import { usePanel } from "@/hooks/use-panel-store";
import { cn } from "@/lib/utils";

import { BranchDialog, NewTaskDialog } from "./task-dialogs";

/** Above the message box in a project: your pending tasks, a count, and quick actions. */
export const PendingTasks = ({ channelId }: { channelId: string }) => {
  const { data: project } = useProject(channelId);
  const { data: tasks = [] } = useTasks(channelId);
  const open = usePanel((s) => s.open);
  const [menu, setMenu] = useState(false);
  const [creating, setCreating] = useState(false);
  const [askBranch, setAskBranch] = useState<Task | null>(null);

  if (!project?.setupDone) return null;
  const mine = tasks.filter((t) => t.assigneeId === project.me.memberId && t.status !== "DONE");

  const pick = (t: Task) => {
    setMenu(false);
    if (!t.branch) setAskBranch(t);
    else open("task", { taskId: t.id });
  };

  return (
    <div className="px-4 pt-1 flex items-center gap-1.5">
      <Popover open={menu} onOpenChange={setMenu}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "h-7 pl-2 pr-2.5 rounded-full text-xs flex items-center gap-1.5 border transition",
              mine.length ? "bg-amber-500/10 border-amber-500/40 text-amber-200 hover:bg-amber-500/20" : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            <ClipboardList className="h-3.5 w-3.5" />
            {mine.length ? <>Pending tasks <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-amber-400 text-black text-[11px] font-bold leading-[18px] text-center">{mine.length}</span></> : "No pending tasks"}
            <ChevronUp className="h-3 w-3 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" align="start" className="w-80 p-1 bg-elevated border-border">
          <p className="px-2 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Assigned to you</p>
          {mine.length === 0 && <p className="px-2 pb-2 text-sm text-muted-foreground">Nothing on your plate.</p>}
          {mine.map((t) => (
            <button key={t.id} type="button" onClick={() => pick(t)} className="w-full text-left rounded-lg px-2 py-2 hover:bg-foreground/[0.05] flex items-start gap-2">
              <span className={cn("h-2 w-2 rounded-full mt-1.5 flex-shrink-0", STATUS[t.status].dot)} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm truncate"><span className="text-muted-foreground">#{t.number}</span> {t.title}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {STATUS[t.status].label}{t.branch ? <> · <GitBranch className="inline h-3 w-3" /> {t.branch}</> : " · no branch yet"}
                </span>
              </span>
            </button>
          ))}
          <div className="border-t border-border mt-1 pt-1 flex">
            <button type="button" onClick={() => { setMenu(false); open("tasks"); }} className="flex-1 h-8 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05] flex items-center justify-center gap-1.5">
              <LayoutList className="h-3.5 w-3.5" /> All tasks
            </button>
            <button type="button" onClick={() => { setMenu(false); setCreating(true); }} className="flex-1 h-8 rounded-md text-xs text-brand hover:bg-brand/10 flex items-center justify-center gap-1.5">
              <Plus className="h-3.5 w-3.5" /> New task
            </button>
          </div>
        </PopoverContent>
      </Popover>
      <button type="button" onClick={() => setCreating(true)} className="h-7 px-2.5 rounded-full text-xs border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 flex items-center gap-1">
        <Plus className="h-3.5 w-3.5" /> Task
      </button>
      {project && <NewTaskDialog open={creating} onClose={() => setCreating(false)} project={project} />}
      {project && <BranchDialog task={askBranch} project={project} onClose={() => { const t = askBranch; setAskBranch(null); if (t) open("task", { taskId: t.id }); }} onDone={() => { const t = askBranch; setAskBranch(null); if (t) open("task", { taskId: t.id }); }} />}
    </div>
  );
};
