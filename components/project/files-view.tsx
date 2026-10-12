"use client";

import { formatDistanceToNowStrict } from "date-fns";
import {
  ChevronRight, ClipboardList, Download, Eye, File as FileIcon, FileCode2, FileText, Film, Folder, FolderInput, FolderPlus, FolderUp,
  HardDrive, Image as ImageIcon, LayoutGrid, List, Loader2, Share2, Music, MoreHorizontal, Pencil, Search, Trash2, Upload, X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub,
  DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/user-avatar";
import { useTasks } from "@/hooks/use-project";
import { fileKind, fmtSize, workspaceAction, type WsFile, type WsFolder, type WsListing } from "@/hooks/use-workspace";
import { toast } from "@/hooks/use-toast";
import { filesFromDrop, filesFromInput, uploadMany, type Picked } from "@/lib/upload-many";
import { cn } from "@/lib/utils";

import { FilePreview } from "./file-preview";
import { PromptDialog } from "./prompt-dialog";

const KIND_ICON = { image: ImageIcon, video: Film, audio: Music, pdf: FileText, text: FileCode2, other: FileIcon } as const;
const KIND_COLOR = { image: "text-pink-300", video: "text-violet-300", audio: "text-amber-300", pdf: "text-rose-300", text: "text-sky-300", other: "text-muted-foreground" } as const;

/** The project's shared files: folders, drag-and-drop uploads, previews and versions. */
export const FilesView = ({ channelId }: { channelId: string }) => {
  const { data: tasks = [] } = useTasks(channelId);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [preview, setPreview] = useState<WsFile | null>(null);
  const [prompt, setPrompt] = useState<null | { title: string; initial?: string; action: string; run: (v: string) => Promise<void> }>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  useEffect(() => { try { const l = localStorage.getItem("files-layout"); if (l === "list" || l === "grid") setLayout(l); } catch {} }, []);
  useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 250); return () => clearTimeout(t); }, [q]);

  const { data, isLoading } = useQuery<WsListing>({
    queryKey: ["ws-files", channelId, query ? `q:${query}` : folderId ?? "root"],
    queryFn: () => fetch(`/api/projects/${channelId}/files?${query ? `q=${encodeURIComponent(query)}` : folderId ? `folderId=${folderId}` : ""}`).then((r) => r.json()),
    keepPreviousData: true,
  });
  // keep the open preview in step with new versions
  useEffect(() => { if (preview) { const f = data?.files.find((x) => x.id === preview.id); if (f && f.versions !== preview.versions) setPreview(f); } }, [data, preview]);

  const folderPath = useMemo(() => {
    const all = data?.allFolders ?? [];
    const label = (id: string): string => {
      const f = all.find((x) => x.id === id);
      return f ? (f.parentId ? `${label(f.parentId)} / ${f.name}` : f.name) : "";
    };
    return all.map((f) => ({ id: f.id, label: label(f.id) })).sort((a, b) => a.label.localeCompare(b.label));
  }, [data?.allFolders]);

  const act = async (body: Record<string, unknown>, ok?: string) => {
    try { await workspaceAction(channelId, body); if (ok) toast({ title: ok }); }
    catch (e: any) { toast({ title: e.message, tone: "error" }); }
  };

  const upload = async (items: Picked[]) => {
    if (!items.length) return;
    setProgress({ done: 0, total: items.length });
    const { ok, failed } = await uploadMany(items, (done, total) => setProgress({ done, total }));
    if (ok.length) await act({ type: "files:add", folderId: query ? null : folderId, items: ok });
    setProgress(null);
    toast({
      title: `Uploaded ${ok.length} ${ok.length === 1 ? "file" : "files"}`,
      body: failed.length ? `${failed.length} failed: ${failed.slice(0, 3).join(", ")}${failed.length > 3 ? "…" : ""}` : "Uploading a file with the same name adds a new version.",
      tone: failed.length && !ok.length ? "error" : "default",
    });
  };

  // Drop files or whole folders anywhere on this view.
  const depth = useRef(0);
  const dropProps = {
    onDragEnter: (e: React.DragEvent) => { if (Array.from(e.dataTransfer.types).includes("Files")) { e.preventDefault(); depth.current++; setDragging(true); } },
    onDragLeave: () => { depth.current = Math.max(0, depth.current - 1); if (!depth.current) setDragging(false); },
    onDragOver: (e: React.DragEvent) => { if (Array.from(e.dataTransfer.types).includes("Files")) e.preventDefault(); },
    onDrop: async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      depth.current = 0;
      setDragging(false);
      upload(await filesFromDrop(e.dataTransfer));
    },
  };

  const openTasks = tasks.filter((t) => t.status !== "DONE");
  const searching = !!query;
  const empty = !isLoading && data && !data.folders.length && !data.files.length;

  const FileMenu = ({ f }: { f: WsFile }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`Options for ${f.name}`} onClick={(e) => e.stopPropagation()} className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/[0.08]">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={() => setPreview(f)}><Eye className="h-4 w-4 mr-2" /> Preview</DropdownMenuItem>
        <DropdownMenuItem asChild><a href={f.url} download={f.name}><Download className="h-4 w-4 mr-2" /> Download</a></DropdownMenuItem>
        <DropdownMenuItem onClick={() => act({ type: "file:share", fileId: f.id }, "Shared in the chat")}><Share2 className="h-4 w-4 mr-2" /> Share in chat</DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger><ClipboardList className="h-4 w-4 mr-2" /> Attach to task</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-64 max-h-72 overflow-y-auto">
            {openTasks.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">No open tasks.</p>}
            {openTasks.map((t) => (
              <DropdownMenuItem key={t.id} onClick={() => act({ type: "task:attach", taskId: t.id, fileId: f.id }, `Attached to #${t.number}`)}>
                <span className="text-muted-foreground mr-1.5">#{t.number}</span> <span className="truncate">{t.title}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setPrompt({ title: "Rename file", initial: f.name, action: "Rename", run: (v) => act({ type: "file:rename", fileId: f.id, name: v }) })}><Pencil className="h-4 w-4 mr-2" /> Rename</DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger><FolderInput className="h-4 w-4 mr-2" /> Move to</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-60 max-h-72 overflow-y-auto">
            <DropdownMenuItem disabled={!f.folderId} onClick={() => act({ type: "file:move", fileId: f.id, folderId: null })}>Files (top level)</DropdownMenuItem>
            {folderPath.map((p) => (
              <DropdownMenuItem key={p.id} disabled={p.id === f.folderId} onClick={() => act({ type: "file:move", fileId: f.id, folderId: p.id })}>
                <Folder className="h-3.5 w-3.5 mr-2 text-amber-300" /> <span className="truncate">{p.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={() => window.confirm(`Delete ${f.name} and all its versions?`) && act({ type: "file:delete", fileId: f.id }, "File deleted")}
        >
          <Trash2 className="h-4 w-4 mr-2" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const FolderMenu = ({ f }: { f: WsFolder }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`Options for ${f.name}`} onClick={(e) => e.stopPropagation()} className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/[0.08]">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={() => setPrompt({ title: "Rename folder", initial: f.name, action: "Rename", run: (v) => act({ type: "folder:rename", folderId: f.id, name: v }) })}><Pencil className="h-4 w-4 mr-2" /> Rename</DropdownMenuItem>
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={() => window.confirm(`Delete the folder "${f.name}"? Its files move up one level; nothing is deleted.`) && act({ type: "folder:delete", folderId: f.id }, "Folder removed")}
        >
          <Trash2 className="h-4 w-4 mr-2" /> Delete folder
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const Thumb = ({ f, big }: { f: WsFile; big?: boolean }) => {
    const kind = fileKind(f.name, f.type);
    const Icon = KIND_ICON[kind];
    if (kind === "image" && f.url) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={f.url} alt="" loading="lazy" className={cn("object-cover", big ? "h-full w-full" : "h-9 w-9 rounded-md")} />;
    }
    return <span className={cn("flex items-center justify-center", big ? "h-full w-full" : "h-9 w-9 rounded-md bg-foreground/[0.05]")}><Icon className={cn(big ? "h-9 w-9" : "h-4 w-4", KIND_COLOR[kind])} /></span>;
  };

  return (
    <div className="relative flex-1 min-h-0 flex flex-col" {...dropProps}>
      {/* toolbar */}
      <div className="px-4 py-3 border-b border-border flex flex-wrap items-center gap-2">
        <nav className="flex items-center gap-1 text-sm min-w-0 flex-1" aria-label="Folder path">
          <button type="button" onClick={() => { setFolderId(null); setQ(""); }} className={cn("px-1.5 h-7 rounded-md hover:bg-foreground/[0.06] font-semibold", !folderId && !searching && "text-foreground")}>Files</button>
          {!searching && data?.trail.map((t) => (
            <span key={t.id} className="flex items-center gap-1 min-w-0">
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <button type="button" onClick={() => setFolderId(t.id)} className="px-1.5 h-7 rounded-md hover:bg-foreground/[0.06] truncate">{t.name}</button>
            </span>
          ))}
          {searching && <span className="text-muted-foreground flex items-center gap-1"><ChevronRight className="h-3.5 w-3.5" /> Search results</span>}
        </nav>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search files" className="h-8 w-40 sm:w-52 rounded-lg bg-background border border-border pl-8 pr-7 text-sm outline-none focus:border-brand" aria-label="Search files" />
          {q && <button type="button" aria-label="Clear" onClick={() => setQ("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>}
        </div>
        <div className="flex rounded-lg border border-border p-0.5">
          {(["grid", "list"] as const).map((l) => (
            <button key={l} type="button" aria-label={l === "grid" ? "Grid view" : "List view"} aria-pressed={layout === l} onClick={() => { setLayout(l); try { localStorage.setItem("files-layout", l); } catch {} }} className={cn("h-7 w-7 rounded-md flex items-center justify-center", layout === l ? "bg-foreground/[0.09] text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {l === "grid" ? <LayoutGrid className="h-3.5 w-3.5" /> : <List className="h-3.5 w-3.5" />}
            </button>
          ))}
        </div>
        {!searching && (
          <button type="button" onClick={() => setPrompt({ title: "New folder", action: "Create", run: (v) => act({ type: "folder:create", name: v, parentId: folderId }) })} className="h-8 px-2.5 rounded-lg text-xs border border-border hover:bg-foreground/[0.06] flex items-center gap-1.5">
            <FolderPlus className="h-3.5 w-3.5" /> New folder
          </button>
        )}
        <input ref={fileInput} type="file" multiple hidden onChange={(e) => { upload(filesFromInput(e.target.files)); e.target.value = ""; }} />
        <input ref={folderInput} type="file" multiple hidden {...({ webkitdirectory: "", directory: "" } as any)} onChange={(e) => { upload(filesFromInput(e.target.files)); e.target.value = ""; }} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" disabled={!!progress} className="h-8 px-3 rounded-lg text-xs font-semibold bg-brand text-brand-foreground flex items-center gap-1.5 disabled:opacity-60">
              <Upload className="h-3.5 w-3.5" /> Upload
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Or drop them anywhere here</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => fileInput.current?.click()}><Upload className="h-4 w-4 mr-2" /> Files</DropdownMenuItem>
            <DropdownMenuItem onClick={() => folderInput.current?.click()}><FolderUp className="h-4 w-4 mr-2" /> A whole folder</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {progress && (
        <div className="px-4 py-2 border-b border-border flex items-center gap-3 text-xs">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />
          <span>Uploading {progress.done} of {progress.total}…</span>
          <div className="flex-1 h-1.5 rounded-full bg-foreground/10 overflow-hidden">
            <div className="h-full bg-brand transition-[width]" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
        </div>
      )}

      {/* contents */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-4">
        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
        {empty && (
          <button type="button" onClick={() => fileInput.current?.click()} className="w-full rounded-2xl border-2 border-dashed border-border hover:border-brand/60 hover:bg-brand/[0.04] py-16 text-center transition">
            <Upload className="h-8 w-8 text-brand mx-auto mb-3" />
            <p className="font-semibold">{searching ? "No files match that" : "Drop files or folders here"}</p>
            {!searching && <p className="text-sm text-muted-foreground mt-1">Designs, docs, datasets, anything the team needs. Files shared in the chat show up here too.</p>}
          </button>
        )}

        {!!data?.folders.length && (
          <div className={cn("mb-5", layout === "grid" ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2" : "space-y-1")}>
            {data.folders.map((f) => (
              <div
                key={f.id}
                role="button"
                tabIndex={0}
                onClick={() => setFolderId(f.id)}
                onKeyDown={(e) => e.key === "Enter" && setFolderId(f.id)}
                className="group flex items-center gap-2.5 h-12 px-3 rounded-xl border border-border bg-elevated/50 hover:bg-elevated hover:border-foreground/20 cursor-pointer transition"
              >
                <Folder className="h-5 w-5 text-amber-300 flex-shrink-0 fill-amber-300/20" />
                <span className="text-sm font-medium truncate flex-1">{f.name}</span>
                <span className="text-[11px] text-muted-foreground">{f.files}</span>
                <span className="opacity-0 group-hover:opacity-100 focus-within:opacity-100"><FolderMenu f={f} /></span>
              </div>
            ))}
          </div>
        )}

        {!!data?.files.length && layout === "grid" && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {data.files.map((f) => (
              <div key={f.id} role="button" tabIndex={0} onClick={() => setPreview(f)} onKeyDown={(e) => e.key === "Enter" && setPreview(f)} className="group rounded-xl border border-border bg-elevated/50 hover:border-foreground/20 overflow-hidden cursor-pointer transition">
                <div className="aspect-[4/3] bg-background/60 overflow-hidden"><Thumb f={f} big /></div>
                <div className="p-2.5 flex items-start gap-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate" title={f.name}>{f.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {fmtSize(f.size)}{f.versions > 1 ? ` · v${f.versions}` : ""} · {formatDistanceToNowStrict(new Date(f.updatedAt), { addSuffix: true })}
                    </p>
                  </div>
                  <FileMenu f={f} />
                </div>
              </div>
            ))}
          </div>
        )}

        {!!data?.files.length && layout === "list" && (
          <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
            {data.files.map((f) => (
              <div key={f.id} role="button" tabIndex={0} onClick={() => setPreview(f)} onKeyDown={(e) => e.key === "Enter" && setPreview(f)} className="flex items-center gap-3 px-3 h-14 hover:bg-foreground/[0.03] cursor-pointer">
                <Thumb f={f} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">{f.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {fmtSize(f.size)}{f.versions > 1 ? ` · ${f.versions} versions` : ""}{f.source === "chat" ? " · shared in chat" : ""}
                  </p>
                </div>
                {f.uploadedBy && (
                  <span className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground w-32 truncate"><UserAvatar src={f.uploadedBy.imageUrl} className="h-5 w-5 md:h-5 md:w-5" /> {f.uploadedBy.name.split(" ")[0]}</span>
                )}
                <span className="hidden md:block text-xs text-muted-foreground w-24 text-right">{formatDistanceToNowStrict(new Date(f.updatedAt), { addSuffix: true })}</span>
                <FileMenu f={f} />
              </div>
            ))}
          </div>
        )}

        {data && (
          <p className="mt-6 text-[11px] text-muted-foreground flex items-center gap-1.5">
            <HardDrive className="h-3.5 w-3.5" /> This project uses {fmtSize(data.usage.bytes)} across {data.usage.versions} {data.usage.versions === 1 ? "upload" : "uploads"}.
          </p>
        )}
      </div>

      {dragging && (
        <div className="absolute inset-2 z-20 pointer-events-none rounded-2xl border-2 border-dashed border-brand bg-background/80 backdrop-blur-sm flex items-center justify-center">
          <div className="text-center">
            <Upload className="h-8 w-8 text-brand mx-auto mb-2" />
            <p className="font-semibold">Drop to upload</p>
            <p className="text-sm text-muted-foreground">to {data?.trail.length ? data.trail[data.trail.length - 1].name : "Files"} · folders keep their structure</p>
          </div>
        </div>
      )}

      <FilePreview channelId={channelId} file={preview} onClose={() => setPreview(null)} />
      <PromptDialog open={!!prompt} title={prompt?.title ?? ""} initial={prompt?.initial} action={prompt?.action} onClose={() => setPrompt(null)} onSubmit={(v) => prompt!.run(v)} />
    </div>
  );
};
