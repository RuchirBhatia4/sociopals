"use client";

import { GitBranch, ListPlus, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UserAvatar } from "@/components/user-avatar";
import { taskAction, type ProjectInfo, type Task } from "@/hooks/use-project";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const field = "w-full rounded-lg bg-background border border-border px-3 text-sm outline-none focus:border-brand";

/** Create a task and (optionally) give it to someone. */
export const NewTaskDialog = ({ open, onClose, project, onCreated }: { open: boolean; onClose: () => void; project: ProjectInfo; onCreated?: (t: Task) => void }) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setTitle(""); setDescription(""); setAssigneeId(""); } }, [open]);

  const create = async () => {
    try {
      setBusy(true);
      const t = await taskAction(project.channel.id, { type: "create", title, description, assigneeId: assigneeId || null });
      onCreated?.(t);
      onClose();
    } catch (e: any) {
      toast({ title: e.message, tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-elevated border-border max-w-lg">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><ListPlus className="h-5 w-5 text-brand" /> New task</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <input autoFocus value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing? e.g. Add dark mode to settings" className={cn(field, "h-10")} />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Details, acceptance criteria, links (optional). The AI reads this too." className={cn(field, "h-28 py-2 resize-none")} />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Assign to</p>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setAssigneeId("")} className={cn("h-8 px-3 rounded-full text-sm border", !assigneeId ? "border-brand bg-brand/[0.12]" : "border-border hover:border-foreground/30")}>Nobody yet</button>
              {project.members.map((m) => (
                <button key={m.id} type="button" onClick={() => setAssigneeId(m.id)} className={cn("h-8 pl-1 pr-3 rounded-full text-sm border flex items-center gap-1.5", assigneeId === m.id ? "border-brand bg-brand/[0.12]" : "border-border hover:border-foreground/30")}>
                  <UserAvatar src={m.imageUrl} className="h-6 w-6 md:h-6 md:w-6" />
                  {m.id === project.me.memberId ? "Me" : m.name.split(" ")[0]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg text-sm hover:bg-foreground/[0.06]">Cancel</button>
            <button type="button" onClick={create} disabled={!title.trim() || busy} className="h-9 px-4 rounded-lg text-sm font-medium bg-brand text-brand-foreground disabled:opacity-40">{busy ? "Creating…" : "Create task"}</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const slug = (n: number, title: string) =>
  `task/${n}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "work"}`;

/** Asked when you open a task that has no branch yet. */
export const BranchDialog = ({ task, project, onClose, onDone }: { task: Task | null; project: ProjectInfo; onClose: () => void; onDone: () => void }) => {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (task) setName(slug(task.number, task.title)); }, [task]);
  const repo = project.channel.repo;
  const blocked = !repo ? "Link a GitHub repo to this project first." : !project.github.connected ? "Connect your GitHub first (Settings → GitHub)." : null;

  const open = async () => {
    try {
      setBusy(true);
      await taskAction(project.channel.id, { type: "branch", taskId: task!.id, name });
      toast({ title: `Branch ${name} is ready`, body: `Locally: git fetch && git switch ${name}` });
      onDone();
    } catch (e: any) {
      toast({ title: e.message, tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!task} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-elevated border-border max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><GitBranch className="h-5 w-5 text-brand" /> Open a branch for this task?</DialogTitle></DialogHeader>
        {task && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              <span className="text-foreground font-medium">#{task.number} {task.title}</span>
              {repo && <> will get its own branch off <code className="text-xs">{repo.defaultBranch}</code> in {repo.owner}/{repo.name}, so your work (and the AI&apos;s) stays separate until it&apos;s ready.</>}
            </p>
            <input value={name} onChange={(e) => setName(e.target.value)} className={cn(field, "h-10 font-mono text-[13px]")} aria-label="Branch name" />
            {blocked && <p className="text-sm text-amber-300">{blocked}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg text-sm hover:bg-foreground/[0.06]">Just view the task</button>
              <button type="button" onClick={open} disabled={busy || !!blocked || !/^[\w./-]+$/.test(name)} className="h-9 px-4 rounded-lg text-sm font-medium bg-brand text-brand-foreground disabled:opacity-40 flex items-center gap-1.5">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Open branch
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
