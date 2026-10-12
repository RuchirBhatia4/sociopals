"use client";

import { format, formatDistanceToNowStrict } from "date-fns";
import {
  Bold, CheckSquare, ClipboardList, Code2, Columns, Eye, FilePlus2, FileText, Heading2, History, Italic, Link2, List,
  Loader2, MoreHorizontal, Pencil, Pin, Search, Share2, Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub,
  DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSocket } from "@/components/providers/socket-provider";
import { useProject, useTasks } from "@/hooks/use-project";
import { workspaceAction, type WsDocSummary } from "@/hooks/use-workspace";
import { toast } from "@/hooks/use-toast";
import { docEditingKey, workspaceKey } from "@/lib/socket-keys";
import { renderDoc, toggleChecklist } from "@/lib/doc-markdown";
import { cn } from "@/lib/utils";

type Doc = {
  id: string; title: string; content: string; isOverview: boolean; version: number; updatedAt: string; updatedBy: string;
  revisions: { id: string; createdAt: string; editedBy: string; title: string }[];
};
type Mode = "edit" | "split" | "preview";

/** Shared notes for the project: the Overview, specs, meeting notes… */
export const DocsView = ({ channelId, initialDocId }: { channelId: string; initialDocId?: string | null }) => {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  const { data: docs = [], isLoading } = useQuery<WsDocSummary[]>({
    queryKey: ["ws-docs", channelId, query],
    queryFn: () => fetch(`/api/projects/${channelId}/docs${query ? `?q=${encodeURIComponent(query)}` : ""}`).then((r) => r.json()),
    keepPreviousData: true,
  });
  const [docId, setDocId] = useState<string | null>(initialDocId ?? null);
  useEffect(() => { if (initialDocId) setDocId(initialDocId); }, [initialDocId]);
  useEffect(() => { if (!docId && docs[0] && !query) setDocId(docs[0].id); }, [docs, docId, query]);

  const create = async () => {
    try {
      const d = await workspaceAction(channelId, { type: "doc:create", title: "Untitled" });
      await qc.invalidateQueries(["ws-docs", channelId]);
      setDocId(d.id);
    } catch (e: any) { toast({ title: e.message, tone: "error" }); }
  };

  return (
    <div className="flex-1 min-h-0 flex">
      <aside className={cn("w-full md:w-64 flex-shrink-0 border-r border-border flex flex-col min-h-0", docId && "hidden md:flex")}>
        <div className="p-3 space-y-2 border-b border-border">
          <button type="button" onClick={create} className="w-full h-9 rounded-lg text-sm font-medium bg-brand text-brand-foreground flex items-center justify-center gap-1.5">
            <FilePlus2 className="h-4 w-4" /> New doc
          </button>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search docs" className="w-full h-8 rounded-lg bg-background border border-border pl-8 pr-2 text-sm outline-none focus:border-brand" />
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-2 space-y-0.5">
          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground m-3" />}
          {docs.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setDocId(d.id)}
              className={cn("w-full text-left rounded-lg px-2.5 py-2 hover:bg-foreground/[0.05] transition", docId === d.id && "bg-foreground/[0.09]")}
            >
              <span className="flex items-center gap-1.5 text-sm font-medium truncate">
                {d.isOverview ? <Pin className="h-3.5 w-3.5 text-brand flex-shrink-0" /> : <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
                <span className="truncate">{d.title}</span>
              </span>
              <span className="block text-[11px] text-muted-foreground truncate mt-0.5">{d.preview || "Empty"}</span>
              <span className="block text-[10px] text-muted-foreground/70 mt-0.5">{d.updatedBy.split(" ")[0]} · {formatDistanceToNowStrict(new Date(d.updatedAt), { addSuffix: true })}</span>
            </button>
          ))}
          {!isLoading && docs.length === 0 && <p className="text-sm text-muted-foreground p-3">No docs match.</p>}
        </div>
      </aside>
      <div className={cn("flex-1 min-w-0 min-h-0 flex flex-col", !docId && "hidden md:flex")}>
        {docId ? <DocEditor key={docId} channelId={channelId} docId={docId} onBack={() => setDocId(null)} onDeleted={() => setDocId(null)} /> : (
          <div className="m-auto text-sm text-muted-foreground">Pick a doc or make a new one.</div>
        )}
      </div>
    </div>
  );
};

const DocEditor = ({ channelId, docId, onBack, onDeleted }: { channelId: string; docId: string; onBack: () => void; onDeleted: () => void }) => {
  const qc = useQueryClient();
  const { socket } = useSocket();
  const { data: tasks = [] } = useTasks(channelId);
  const { data: project } = useProject(channelId);
  const meId = project?.me.profileId;
  const { data: doc, refetch } = useQuery<Doc>({
    queryKey: ["ws-doc", docId],
    queryFn: () => fetch(`/api/projects/${channelId}/docs/${docId}`).then((r) => (r.ok ? r.json() : Promise.reject(r))),
    refetchOnWindowFocus: false,
  });

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [base, setBase] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [savedBy, setSavedBy] = useState<string | null>(null);
  const [conflict, setConflict] = useState<null | { version: number; by: string }>(null);
  const [mode, setMode] = useState<Mode>("split");
  const [others, setOthers] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<{ id: string; title: string; content: string; when: string; by: string } | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const loaded = useRef(false);

  useEffect(() => { try { const m = localStorage.getItem("doc-mode") as Mode | null; if (m) setMode(m); } catch {} }, []);
  useEffect(() => {
    if (!doc) return;
    if (!loaded.current || !dirty) {
      loaded.current = true;
      setTitle(doc.title);
      setContent(doc.content);
      setBase(doc.version);
      setConflict(null);
    }
  }, [doc]); // eslint-disable-line react-hooks/exhaustive-deps

  // Someone else saved: reload if we have nothing unsaved, otherwise warn.
  const state = useRef({ base, dirty });
  state.current = { base, dirty };
  useEffect(() => {
    if (!socket) return;
    const k = workspaceKey(channelId);
    const on = async (e: { type: string; docId?: string; version?: number; by?: string }) => {
      // our own saves come back too; ignore them
      if (e.type !== "docs" || e.docId !== docId || e.by === meId || e.version === state.current.base) return;
      const d: Doc = await fetch(`/api/projects/${channelId}/docs/${docId}`).then((r) => r.json());
      if (d.version === state.current.base) return;
      if (!state.current.dirty) { qc.setQueryData(["ws-doc", docId], d); setTitle(d.title); setContent(d.content); setBase(d.version); }
      else setConflict({ version: d.version, by: d.updatedBy });
    };
    socket.on(k, on);
    return () => { socket.off(k, on); };
  }, [socket, channelId, docId, qc, meId]);

  // Who else is editing this doc.
  useEffect(() => {
    if (!socket) return;
    const k = docEditingKey(channelId);
    const on = (e: { docId: string; profileId: string; name: string; editing: boolean }) => {
      if (e.docId !== docId) return;
      setOthers((o) => { const n = { ...o }; if (e.editing) n[e.profileId] = e.name; else delete n[e.profileId]; return n; });
    };
    socket.on(k, on);
    return () => { socket.off(k, on); socket.emit("doc:editing", { channelId, docId, editing: false }); };
  }, [socket, channelId, docId]);
  const editingPing = useRef(0);
  const pingEditing = () => {
    if (Date.now() - editingPing.current < 5000) return;
    editingPing.current = Date.now();
    socket?.emit("doc:editing", { channelId, docId, editing: true });
  };

  const save = useCallback(async (opts: { force?: boolean; t?: string; c?: string } = {}) => {
    const t = opts.t ?? title;
    const c = opts.c ?? content;
    setSaving(true);
    try {
      const r = await workspaceAction(channelId, { type: "doc:save", docId, title: t, content: c, baseVersion: opts.force ? conflict?.version ?? base : base, force: !!opts.force });
      setBase(r.version);
      setSavedAt(r.updatedAt);
      setSavedBy("You");
      setDirty(false);
      setConflict(null);
      qc.invalidateQueries(["ws-docs", channelId]);
    } catch (e: any) {
      if (e.status === 409) setConflict({ version: e.data?.doc?.version, by: "someone" });
      else toast({ title: e.message, tone: "error" });
    } finally {
      setSaving(false);
    }
  }, [title, content, base, conflict, channelId, docId, qc]);

  // Autosave a moment after you stop typing.
  useEffect(() => {
    if (!dirty || conflict) return;
    const t = setTimeout(() => save(), 1200);
    return () => clearTimeout(t);
  }, [dirty, title, content, conflict, save]);
  // Don't lose work on close.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const edit = (c: string) => { setContent(c); setDirty(true); pingEditing(); };
  const wrap = (before: string, after = before, placeholder = "text") => {
    const el = ta.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const sel = content.slice(s, e) || placeholder;
    edit(content.slice(0, s) + before + sel + after + content.slice(e));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + before.length, s + before.length + sel.length); });
  };
  const linePrefix = (prefix: string) => {
    const el = ta.current;
    if (!el) return;
    const s = el.selectionStart;
    const start = content.lastIndexOf("\n", s - 1) + 1;
    edit(content.slice(0, start) + prefix + content.slice(start));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + prefix.length, s + prefix.length); });
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); save(); }
    if ((e.metaKey || e.ctrlKey) && e.key === "b") { e.preventDefault(); wrap("**"); }
    if ((e.metaKey || e.ctrlKey) && e.key === "i") { e.preventDefault(); wrap("*"); }
    // Continue lists and checklists on Enter.
    if (e.key === "Enter" && !e.shiftKey) {
      const s = e.currentTarget.selectionStart;
      const lineStart = content.lastIndexOf("\n", s - 1) + 1;
      const line = content.slice(lineStart, s);
      const m = /^(\s*)([-*]|\d+\.)\s+(\[[ xX]\]\s+)?/.exec(line);
      if (m) {
        e.preventDefault();
        if (line.trim() === m[0].trim()) { edit(content.slice(0, lineStart) + content.slice(s)); return; }
        const next = /^\d+\./.test(m[2]) ? `${parseInt(m[2]) + 1}.` : m[2];
        const insert = `\n${m[1]}${next} ${m[3] ? "[ ] " : ""}`;
        edit(content.slice(0, s) + insert + content.slice(s));
        requestAnimationFrame(() => ta.current?.setSelectionRange(s + insert.length, s + insert.length));
      }
    }
  };

  const showHistory = async (id: string) => {
    const r = await fetch(`/api/projects/${channelId}/docs/${docId}?revision=${id}`).then((x) => x.json());
    const meta = doc?.revisions.find((x) => x.id === id);
    setHistory({ id, title: r.title, content: r.content, when: meta?.createdAt ?? r.createdAt, by: meta?.editedBy ?? "" });
  };

  if (!doc) return <div className="m-auto"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  const editingNames = Object.values(others);
  const setModeSaved = (m: Mode) => { setMode(m); try { localStorage.setItem("doc-mode", m); } catch {} };
  const Tool = ({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) => (
    <button type="button" aria-label={label} title={label} onMouseDown={(e) => e.preventDefault()} onClick={onClick} className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/[0.08]">{children}</button>
  );

  return (
    <>
      <div className="px-4 pt-3 pb-2 border-b border-border space-y-2">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onBack} className="md:hidden text-xs text-muted-foreground hover:text-foreground">← Docs</button>
          {doc.isOverview ? (
            <h2 className="text-lg font-semibold flex items-center gap-2 flex-1"><Pin className="h-4 w-4 text-brand" /> {doc.title}</h2>
          ) : (
            <input value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} aria-label="Doc title" className="flex-1 min-w-0 bg-transparent text-lg font-semibold outline-none" maxLength={140} />
          )}
          <span className="text-[11px] text-muted-foreground whitespace-nowrap">
            {saving ? "Saving…" : dirty ? "Unsaved" : `Saved · ${savedBy ?? doc.updatedBy.split(" ")[0]} ${formatDistanceToNowStrict(new Date(savedAt ?? doc.updatedAt), { addSuffix: true })}`}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="Doc options" className="h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06]"><MoreHorizontal className="h-4 w-4" /></button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem onClick={() => workspaceAction(channelId, { type: "doc:share", docId }).then(() => toast({ title: "Shared in the chat" })).catch((e) => toast({ title: e.message, tone: "error" }))}>
                <Share2 className="h-4 w-4 mr-2" /> Share in chat
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger><ClipboardList className="h-4 w-4 mr-2" /> Attach to task</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-64 max-h-72 overflow-y-auto">
                  {tasks.filter((t) => t.status !== "DONE").map((t) => (
                    <DropdownMenuItem key={t.id} onClick={() => workspaceAction(channelId, { type: "task:attach", taskId: t.id, docId }).then(() => toast({ title: `Attached to #${t.number}` }))}>
                      <span className="text-muted-foreground mr-1.5">#{t.number}</span> <span className="truncate">{t.title}</span>
                    </DropdownMenuItem>
                  ))}
                  {!tasks.some((t) => t.status !== "DONE") && <p className="px-2 py-1.5 text-xs text-muted-foreground">No open tasks.</p>}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger><History className="h-4 w-4 mr-2" /> Version history</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-64 max-h-80 overflow-y-auto">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Earlier versions</DropdownMenuLabel>
                  {doc.revisions.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">None yet. Versions are kept as people edit.</p>}
                  {doc.revisions.map((r) => (
                    <DropdownMenuItem key={r.id} onClick={() => showHistory(r.id)}>
                      <span className="flex-1">{format(new Date(r.createdAt), "d MMM, HH:mm")}</span>
                      <span className="text-xs text-muted-foreground">{r.editedBy.split(" ")[0]}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              {!doc.isOverview && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={async () => {
                      if (!window.confirm(`Delete "${doc.title}"?`)) return;
                      try { await workspaceAction(channelId, { type: "doc:delete", docId }); qc.invalidateQueries(["ws-docs", channelId]); onDeleted(); }
                      catch (e: any) { toast({ title: e.message, tone: "error" }); }
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-2" /> Delete doc
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex items-center gap-0.5 flex-wrap">
          <Tool label="Heading" onClick={() => linePrefix("## ")}><Heading2 className="h-4 w-4" /></Tool>
          <Tool label="Bold (⌘B)" onClick={() => wrap("**")}><Bold className="h-4 w-4" /></Tool>
          <Tool label="Italic (⌘I)" onClick={() => wrap("*")}><Italic className="h-4 w-4" /></Tool>
          <Tool label="List" onClick={() => linePrefix("- ")}><List className="h-4 w-4" /></Tool>
          <Tool label="Checklist" onClick={() => linePrefix("- [ ] ")}><CheckSquare className="h-4 w-4" /></Tool>
          <Tool label="Code block" onClick={() => wrap("\n```\n", "\n```\n", "code")}><Code2 className="h-4 w-4" /></Tool>
          <Tool label="Link" onClick={() => wrap("", " (https://)", "link text")}><Link2 className="h-4 w-4" /></Tool>
          {editingNames.length > 0 && (
            <span className="ml-2 text-[11px] text-amber-300 flex items-center gap-1"><Pencil className="h-3 w-3" /> {editingNames.slice(0, 2).join(", ")} {editingNames.length === 1 ? "is" : "are"} editing</span>
          )}
          <div className="ml-auto flex rounded-lg border border-border p-0.5">
            {([["edit", Pencil, "Write"], ["split", Columns, "Side by side"], ["preview", Eye, "Read"]] as const).map(([m, Icon, label]) => (
              <button key={m} type="button" aria-label={label} title={label} aria-pressed={mode === m} onClick={() => setModeSaved(m)} className={cn("h-7 px-2 rounded-md text-xs flex items-center gap-1", mode === m ? "bg-foreground/[0.09] text-foreground" : "text-muted-foreground hover:text-foreground", m === "split" && "hidden lg:flex")}>
                <Icon className="h-3.5 w-3.5" /> <span className="hidden xl:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {conflict && (
        <div className="mx-4 mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm flex flex-wrap items-center gap-2">
          <span className="flex-1">Someone saved a newer version while you were editing.</span>
          <button type="button" onClick={() => { navigator.clipboard?.writeText(content); setDirty(false); refetch(); setConflict(null); toast({ title: "Loaded their version", body: "Your text is on the clipboard." }); }} className="h-7 px-2.5 rounded-md text-xs bg-foreground/10 hover:bg-foreground/15">
            Load theirs (copy mine)
          </button>
          <button type="button" onClick={() => save({ force: true })} className="h-7 px-2.5 rounded-md text-xs bg-amber-500/25 hover:bg-amber-500/35">Keep mine</button>
        </div>
      )}

      <div className={cn("flex-1 min-h-0 grid", mode === "split" ? "lg:grid-cols-2" : "grid-cols-1")}>
        {(mode === "edit" || mode === "split") && (
          <textarea
            ref={ta}
            value={content}
            onChange={(e) => edit(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={"Start writing…\n\n# Heading\n- list item\n- [ ] checklist item\n**bold**, `code`, ```code block```"}
            spellCheck
            className={cn("min-h-0 h-full resize-none bg-transparent outline-none focus-visible:ring-0 p-5 font-mono text-[13.5px] leading-relaxed scrollbar-thin", mode === "split" && "lg:border-r border-border", mode === "split" && "max-lg:block")}
            aria-label="Doc text"
          />
        )}
        {(mode === "preview" || mode === "split") && (
          <div className={cn("min-h-0 overflow-y-auto scrollbar-thin p-5 text-[15px] text-foreground/90 max-w-3xl", mode === "split" && "hidden lg:block")}>
            {content.trim() ? renderDoc(content, (line) => { const next = toggleChecklist(content, line); edit(next); }) : <p className="text-muted-foreground">Nothing here yet.</p>}
          </div>
        )}
      </div>

      <Dialog open={!!history} onOpenChange={(o) => !o && setHistory(null)}>
        <DialogContent className="bg-elevated border-border max-w-3xl w-[calc(100vw-1.5rem)] grid-cols-[minmax(0,1fr)]">
          {history && (
            <>
              <DialogTitle className="text-base">{history.title} · {format(new Date(history.when), "d MMM yyyy, HH:mm")}{history.by && ` · ${history.by}`}</DialogTitle>
              <div className="max-h-[60vh] overflow-y-auto scrollbar-thin rounded-xl border border-border p-4 text-sm">{renderDoc(history.content)}</div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setHistory(null)} className="h-9 px-4 rounded-lg text-sm hover:bg-foreground/[0.06]">Close</button>
                <button
                  type="button"
                  onClick={async () => {
                    await workspaceAction(channelId, { type: "doc:restore", docId, revisionId: history.id });
                    setDirty(false);
                    setHistory(null);
                    loaded.current = false;
                    await refetch();
                    toast({ title: "Restored that version", body: "The version it replaced is kept in history too." });
                  }}
                  className="h-9 px-4 rounded-lg text-sm font-medium bg-brand text-brand-foreground"
                >
                  Restore this version
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
