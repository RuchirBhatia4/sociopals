"use client";

import { FileText, Loader2, Paperclip, Plus, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fileKind, fmtSize, workspaceAction, type WsDocSummary, type WsListing } from "@/hooks/use-workspace";
import { toast } from "@/hooks/use-toast";
import { uploadMany } from "@/lib/upload-many";

type Att = { id: string; file: { id: string; name: string; url: string; type: string; size: number } | null; doc: { id: string; title: string; isOverview: boolean } | null };

/** Files and docs attached to a task. The task's AI reads them (and sees attached images). */
export const TaskAttachments = ({ channelId, taskId }: { channelId: string; taskId: string }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const { data: items = [] } = useQuery<Att[]>({
    queryKey: ["task-attachments", taskId],
    queryFn: () => fetch(`/api/tasks/${taskId}/attachments`).then((r) => (r.ok ? r.json() : [])),
  });
  const { data: files } = useQuery<WsListing>({
    queryKey: ["ws-files", channelId, "all"],
    queryFn: () => fetch(`/api/projects/${channelId}/files?all=1`).then((r) => r.json()),
    enabled: open,
  });
  const { data: docs = [] } = useQuery<WsDocSummary[]>({
    queryKey: ["ws-docs", channelId, ""],
    queryFn: () => fetch(`/api/projects/${channelId}/docs`).then((r) => r.json()),
    enabled: open,
  });

  const attach = (body: object) => workspaceAction(channelId, { type: "task:attach", taskId, ...body }).catch((e) => toast({ title: e.message, tone: "error" }));
  const detach = (id: string) => workspaceAction(channelId, { type: "task:detach", attachmentId: id }).catch((e) => toast({ title: e.message, tone: "error" }));

  const uploadAndAttach = async (list: FileList | null) => {
    const picked = Array.from(list ?? []).slice(0, 10).map((file) => ({ file, path: file.name }));
    if (!picked.length) return;
    setBusy(true);
    const { ok } = await uploadMany(picked);
    if (ok.length) {
      await workspaceAction(channelId, { type: "files:add", folderId: null, items: ok });
      // find the new files by name and attach them
      const all: WsListing = await fetch(`/api/projects/${channelId}/files?all=1`).then((r) => r.json());
      for (const u of ok) {
        const f = all.files.find((x) => x.name === u.name && x.url === u.url);
        if (f) await attach({ fileId: f.id });
      }
      toast({ title: `Attached ${ok.length} ${ok.length === 1 ? "file" : "files"}`, body: "They're in the project's Files too." });
    } else toast({ title: "Upload failed", tone: "error" });
    setBusy(false);
  };

  const attachedFileIds = new Set(items.map((i) => i.file?.id).filter(Boolean));
  const attachedDocIds = new Set(items.map((i) => i.doc?.id).filter(Boolean));

  return (
    <div className="p-4 space-y-2.5 border-b border-border">
      <div className="flex items-center gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 flex-1"><Paperclip className="h-3.5 w-3.5" /> Files & docs</p>
        <input ref={input} type="file" multiple hidden onChange={(e) => { uploadAndAttach(e.target.files); e.target.value = ""; }} />
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <button type="button" disabled={busy} className="h-7 px-2 rounded-md text-xs border border-border hover:bg-foreground/[0.06] flex items-center gap-1 disabled:opacity-50">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Attach
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72 max-h-80 overflow-y-auto">
            <DropdownMenuItem onClick={() => input.current?.click()}><Upload className="h-4 w-4 mr-2" /> Upload from your computer…</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Docs</DropdownMenuLabel>
            {docs.filter((d) => !attachedDocIds.has(d.id)).map((d) => (
              <DropdownMenuItem key={d.id} onClick={() => attach({ docId: d.id })}><FileText className="h-4 w-4 mr-2 text-sky-300" /> <span className="truncate">{d.title}</span></DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Files</DropdownMenuLabel>
            {!files && <Loader2 className="h-4 w-4 animate-spin m-2 text-muted-foreground" />}
            {files?.files.filter((f) => !attachedFileIds.has(f.id)).slice(0, 60).map((f) => (
              <DropdownMenuItem key={f.id} onClick={() => attach({ fileId: f.id })}>
                <Paperclip className="h-4 w-4 mr-2 text-muted-foreground" /> <span className="truncate flex-1">{f.name}</span>
                <span className="text-[10px] text-muted-foreground ml-2">{fmtSize(f.size)}</span>
              </DropdownMenuItem>
            ))}
            {files && files.files.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">No files in this project yet.</p>}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Attach designs, specs or data. The AI reads docs and text files and looks at images.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((a) => (
            <span key={a.id} className="group h-8 pl-1 pr-1 rounded-lg border border-border bg-background/60 text-xs flex items-center gap-1.5 max-w-full">
              {a.file && fileKind(a.file.name, a.file.type) === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.file.url} alt="" className="h-6 w-6 rounded object-cover" />
              ) : (
                <span className="h-6 w-6 rounded bg-foreground/[0.06] flex items-center justify-center">{a.doc ? <FileText className="h-3.5 w-3.5 text-sky-300" /> : <Paperclip className="h-3.5 w-3.5" />}</span>
              )}
              {a.file ? (
                <a href={a.file.url} target="_blank" rel="noopener noreferrer" className="truncate max-w-[160px] hover:underline">{a.file.name}</a>
              ) : (
                <a href={`?view=docs&doc=${a.doc!.id}`} className="truncate max-w-[160px] hover:underline">{a.doc!.title}</a>
              )}
              <button type="button" aria-label="Remove" onClick={() => detach(a.id)} className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/10">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
