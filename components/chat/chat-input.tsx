"use client";

import axios from "axios";
import qs from "query-string";
import { format } from "date-fns";
import {
  BarChart3, CalendarClock, ChevronDown, Clock, Code2, FileText, Film, Loader2, Lock, Music, Paperclip, SendHorizontal, Timer, Trash2, Upload, X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useComposerStore } from "@/hooks/use-composer-store";
import { useSocket } from "@/components/providers/socket-provider";
import { EmojiPicker } from "@/components/emoji-picker";
import { UserAvatar } from "@/components/user-avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { mentionText } from "@/lib/mention";
import { plainText } from "@/lib/format";
import { quickTimes, toLocalInput } from "@/lib/when";
import { useUploadThing } from "@/lib/uploadthing";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

import { kindOf, fileSize } from "./message-attachments";
import { PollComposer, type NewPoll } from "./poll-composer";
import { useProjectView } from "@/components/project/project-views";
import { CodeEditor, type CodeEditorHandle } from "./code-editor";
import { highlight, normalizeLang } from "@/lib/highlight";

export type MentionCandidate = { id: string; name: string; imageUrl: string };

interface ChatInputProps {
  apiUrl: string;
  query: Record<string, any>;
  name: string;
  type: "conversation" | "channel";
  chatId: string;
  me: { id: string; name: string };
  /** people you can @mention here */
  members?: MentionCandidate[];
  /** reply inside this thread (channel messages only) */
  threadId?: string;
  /** why you can't post here (read-only channel, timed out), if you can't */
  blockedReason?: string | null;
  slowModeSeconds?: number;
  /** the main composer of a page also accepts files dropped anywhere on the page */
  pageDrop?: boolean;
}

type Pending = { key: string; file: File; preview: string | null; status: "uploading" | "done" | "error"; url?: string };

const MAX_HEIGHT = 240;
const MAX_FILES = 10;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const draftKey = (chatId: string, threadId?: string) => `draft:${threadId ? `thread:${threadId}` : chatId}`;

export const ChatInput = ({
  apiUrl, query, name, type, chatId, me, members = [], threadId, blockedReason = null, slowModeSeconds = 0, pageDrop = false,
}: ChatInputProps) => {
  const { socket } = useSocket();
  const qc = useQueryClient();
  // In a project's Files/Docs tab, dropped files belong to those tabs, not the message box.
  const view = useProjectView();
  pageDrop = pageDrop && view === "chat";
  const replyKey = threadId ? `thread:${threadId}` : chatId;
  const replyTo = useComposerStore((s) => s.replyTo[replyKey] ?? null);
  const setReplyTo = useComposerStore((s) => s.setReplyTo);

  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<Pending[]>([]);
  const [dragging, setDragging] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState(() => toLocalInput(new Date(Date.now() + 3_600_000)));
  const ref = useRef<HTMLTextAreaElement>(null);
  // Typing ``` opens a code editor under the message box.
  const [code, setCode] = useState<string | null>(null);
  const [codeLang, setCodeLang] = useState("auto");
  const editor = useRef<CodeEditorHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // "@Name" shown in the box -> member id, turned into tokens on send
  const picked = useRef(new Map<string, string>());

  /* ---------- drafts survive switching chats ---------- */
  useEffect(() => {
    try { setValue(localStorage.getItem(draftKey(chatId, threadId)) ?? ""); } catch {}
  }, [chatId, threadId]);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (value) localStorage.setItem(draftKey(chatId, threadId), value);
        else localStorage.removeItem(draftKey(chatId, threadId));
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, [value, chatId, threadId]);

  /* ---------- autosize ---------- */
  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, MAX_HEIGHT) + "px";
  }, []);
  useEffect(resize, [value, resize]);

  useEffect(() => { if (replyTo) ref.current?.focus(); }, [replyTo]);

  /* ---------- slow mode countdown ---------- */
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  /* ---------- typing signal (throttled) ---------- */
  const lastTypingSent = useRef(0);
  const stopTimer = useRef<ReturnType<typeof setTimeout>>();
  const sendTyping = useCallback((typing: boolean) => {
    if (threadId) return;
    socket?.emit("typing", { chatId, memberId: me.id, name: me.name, typing });
  }, [socket, chatId, me.id, me.name, threadId]);
  const onTyped = () => {
    const now = Date.now();
    if (now - lastTypingSent.current > 3000) { sendTyping(true); lastTypingSent.current = now; }
    clearTimeout(stopTimer.current);
    stopTimer.current = setTimeout(() => { sendTyping(false); lastTypingSent.current = 0; }, 4000);
  };
  useEffect(() => () => { clearTimeout(stopTimer.current); }, []);

  /* ---------- attachments ---------- */
  const { startUpload } = useUploadThing("chatAttachment");
  const addFiles = useCallback(async (list: File[]) => {
    if (!list.length) return;
    const room = MAX_FILES - files.length;
    if (room <= 0) { toast({ title: `Up to ${MAX_FILES} files per message`, tone: "error" }); return; }
    const batch: Pending[] = list.slice(0, room).map((file) => ({
      key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      preview: file.type.startsWith("image/") || file.type.startsWith("video/") ? URL.createObjectURL(file) : null,
      status: "uploading",
    }));
    setFiles((f) => [...f, ...batch]);
    await Promise.all(
      batch.map(async (p) => {
        try {
          const res = await startUpload([p.file]);
          const url = res?.[0]?.url;
          setFiles((f) => f.map((x) => (x.key === p.key ? { ...x, status: url ? "done" : "error", url } : x)));
        } catch {
          setFiles((f) => f.map((x) => (x.key === p.key ? { ...x, status: "error" } : x)));
        }
      })
    );
  }, [files.length, startUpload]);

  const removeFile = (key: string) =>
    setFiles((f) => {
      const gone = f.find((x) => x.key === key);
      if (gone?.preview) URL.revokeObjectURL(gone.preview);
      return f.filter((x) => x.key !== key);
    });

  // Drop files anywhere on the page (main composer only).
  useEffect(() => {
    if (!pageDrop || blockedReason) return;
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const enter = (e: DragEvent) => { if (!hasFiles(e)) return; depth++; setDragging(true); };
    const leave = (e: DragEvent) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) setDragging(false); };
    const over = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      addFiles(Array.from(e.dataTransfer?.files ?? []));
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [pageDrop, addFiles, blockedReason]);

  /* ---------- scheduled messages here ---------- */
  const scheduledQ = useQuery<{ id: string; content: string; sendAt: string }[]>({
    queryKey: ["scheduled", chatId],
    queryFn: () => fetch(`/api/scheduled?chatId=${chatId}`).then((r) => (r.ok ? r.json() : [])),
    enabled: !threadId,
    staleTime: 30_000,
  });
  const scheduled = (scheduledQ.data ?? []).filter((s: any) => !s.sentAt);
  useEffect(() => {
    if (!socket) return;
    const refresh = () => qc.invalidateQueries(["scheduled"]);
    socket.on("scheduled:changed", refresh);
    return () => { socket.off("scheduled:changed", refresh); };
  }, [socket, qc]);

  /* ---------- @mention autocomplete ---------- */
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [active, setActive] = useState(0);
  const matches = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    const people = members.filter((m) => m.id !== me.id && m.name.toLowerCase().includes(q)).slice(0, 6);
    const everyone = type === "channel" && "everyone".startsWith(q) ? [{ id: "@everyone", name: "everyone", imageUrl: "" }] : [];
    return [...people, ...everyone];
  }, [mention, members, me.id, type]);

  const detectMention = (text: string, caret: number) => {
    const before = text.slice(0, caret);
    const m = /(^|\s)@([^\s@]{0,32})$/.exec(before);
    if (m && members.length) {
      setMention({ start: caret - m[2].length - 1, query: m[2] });
      setActive(0);
    } else {
      setMention(null);
    }
  };

  const pickMention = (c: MentionCandidate) => {
    if (!mention) return;
    const label = `@${c.name}`;
    const next = value.slice(0, mention.start) + label + " " + value.slice(mention.start + 1 + mention.query.length);
    if (c.id !== "@everyone") picked.current.set(label, c.id);
    setValue(next);
    setMention(null);
    requestAnimationFrame(() => {
      const pos = mention.start + label.length + 1;
      ref.current?.focus();
      ref.current?.setSelectionRange(pos, pos);
    });
  };

  /* ---------- code editor ---------- */
  const openCode = (initial = "", lang = "auto") => {
    setCode(initial);
    setCodeLang(lang);
    requestAnimationFrame(() => editor.current?.focus());
  };
  const closeCode = () => {
    // Nothing written: just go back. Otherwise keep the code as a fenced block in the text.
    if (code && code.trim()) setValue((v) => `${v}${v && !v.endsWith("\n") ? "\n" : ""}\`\`\`${codeLang !== "auto" ? codeLang : ""}\n${code}\n\`\`\``);
    setCode(null);
    requestAnimationFrame(() => ref.current?.focus());
  };
  /** An unclosed ``` in the box moves everything after it into the editor. */
  const maybeOpenCode = (text: string) => {
    const fences = text.split("```").length - 1;
    if (code !== null || fences % 2 === 0) return false;
    const at = text.lastIndexOf("```");
    const rest = text.slice(at + 3);
    const m = /^([a-zA-Z0-9+#-]+)\n/.exec(rest);
    const lang = m ? normalizeLang(m[1]) || "auto" : "auto";
    setValue(text.slice(0, at).replace(/\n$/, ""));
    openCode(m ? rest.slice(m[0].length) : rest.replace(/^\n/, ""), lang);
    return true;
  };
  /** The message as it will be sent: text, then the code as a fenced block. */
  const composed = () => {
    const text = toTokens(value.trim());
    if (code === null || !code.trim()) return text;
    const lang = codeLang !== "auto" ? codeLang : highlight(code).lang;
    return `${text}${text ? "\n" : ""}\`\`\`${lang ?? ""}\n${code.replace(/\s+$/, "")}\n\`\`\``;
  };

  /* ---------- send ---------- */
  const toTokens = (text: string) => {
    let out = text;
    const labels = Array.from(picked.current.keys()).sort((a, b) => b.length - a.length);
    for (const label of labels) {
      const id = picked.current.get(label)!;
      out = out.replace(new RegExp(`${escapeRe(label)}(?![\\w])`, "g"), mentionText(label.slice(1), id));
    }
    return out;
  };

  const uploading = files.some((f) => f.status === "uploading");
  const ready = files.filter((f) => f.status === "done");
  const canSend = (!!value.trim() || !!code?.trim() || ready.length > 0) && !uploading && !sending && cooldown <= 0;

  const reset = () => {
    setValue("");
    setCode(null);
    setCodeLang("auto");
    picked.current.clear();
    files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
    setFiles([]);
    setReplyTo(replyKey, null);
    clearTimeout(stopTimer.current);
    sendTyping(false);
    lastTypingSent.current = 0;
  };

  const fail = (e: any) => {
    const msg: string = e?.response?.data?.error ?? "Couldn't send. Your message is still here; try again.";
    const wait = /(\d+)s/.exec(msg);
    if (e?.response?.status === 429 && wait) setCooldown(Number(wait[1]));
    setError(msg);
  };

  const send = async () => {
    if (!canSend) return;
    const content = composed();
    try {
      setSending(true);
      setError(null);
      await axios.post(qs.stringifyUrl({ url: apiUrl, query }), {
        content,
        replyToId: replyTo?.id,
        threadId,
        attachments: ready.map((f) => ({ url: f.url, name: f.file.name, type: f.file.type || "application/octet-stream", size: f.file.size })),
      });
      reset();
      if (slowModeSeconds > 0) setCooldown(slowModeSeconds);
    } catch (e) {
      fail(e);
    } finally {
      setSending(false);
      requestAnimationFrame(() => ref.current?.focus());
    }
  };

  const schedule = async (when: Date) => {
    const content = composed();
    if (!content.trim()) { toast({ title: "Write something to schedule first" }); return; }
    if (files.length) { toast({ title: "Scheduled messages can't carry files yet", tone: "error" }); return; }
    if (when.getTime() < Date.now() + 30_000) { toast({ title: "Pick a time in the future", tone: "error" }); return; }
    try {
      await axios.post("/api/scheduled", { chatId, content, sendAt: when.toISOString(), replyToId: replyTo?.id });
      reset();
      qc.invalidateQueries(["scheduled", chatId]);
      toast({ title: `Scheduled for ${format(when, "EEE d MMM 'at' HH:mm")}` });
    } catch (e: any) {
      toast({ title: typeof e?.response?.data === "string" ? e.response.data : "Couldn't schedule that", tone: "error" });
    }
  };

  const cancelScheduled = async (id: string) => {
    await axios.delete(`/api/scheduled?id=${id}`).catch(() => {});
    qc.invalidateQueries(["scheduled", chatId]);
  };

  const sendPoll = async (poll: NewPoll) => {
    try {
      await axios.post(qs.stringifyUrl({ url: apiUrl, query }), { content: poll.question, poll });
      return true;
    } catch (e: any) {
      toast({ title: e?.response?.data?.error ?? "Couldn't post the poll", tone: "error" });
      return false;
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention && matches.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % matches.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + matches.length) % matches.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pickMention(matches[active]); return; }
      if (e.key === "Escape") { e.preventDefault(); setMention(null); return; }
    }
    if (e.key === "Escape" && replyTo) { e.preventDefault(); setReplyTo(replyKey, null); return; }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const pasted = Array.from(e.clipboardData.files ?? []);
    if (pasted.length) { e.preventDefault(); addFiles(pasted); }
  };

  const insertAtCaret = (text: string) => {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + text + value.slice(end);
    setValue(next);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + text.length, start + text.length); });
  };

  const basePlaceholder = threadId ? "Reply in thread…" : `Message ${type === "conversation" ? name : "#" + name}`;
  const placeholder = code !== null ? "Add a note about the code (optional)" : basePlaceholder;

  if (blockedReason) {
    return (
      <div className={cn("px-4 pb-4 pt-1", threadId && "px-3 pb-3")}>
        <div className="rounded-xl border border-dashed border-border bg-elevated/50 h-12 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Lock className="h-4 w-4" /> {blockedReason}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("px-4 pb-4 pt-1 relative", threadId && "px-3 pb-3")}>
      {dragging && (
        <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center bg-background/70 backdrop-blur-sm animate-in fade-in">
          <div className="rounded-2xl border-2 border-dashed border-brand bg-elevated px-10 py-8 text-center shadow-2xl glow-brand">
            <Upload className="h-8 w-8 text-brand mx-auto mb-2" />
            <p className="font-semibold">Drop to attach</p>
            <p className="text-sm text-muted-foreground">to {type === "channel" ? "#" : ""}{name} · up to {MAX_FILES} files</p>
          </div>
        </div>
      )}

      {mention && matches.length > 0 && (
        <div className="absolute bottom-full left-4 right-4 mb-1 rounded-lg border border-border bg-elevated shadow-xl p-1 z-20" role="listbox" aria-label="People to mention">
          <p className="px-2 py-1 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Members</p>
          {matches.map((m, i) => (
            <button
              key={m.id}
              type="button"
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); pickMention(m); }}
              onMouseEnter={() => setActive(i)}
              className={cn("w-full flex items-center gap-2 px-2 h-9 rounded-md text-sm text-left", i === active && "bg-foreground/[0.08]")}
            >
              {m.imageUrl ? <UserAvatar src={m.imageUrl} className="h-6 w-6 md:h-6 md:w-6" /> : <span className="h-6 w-6 rounded-full bg-mention/20 text-mention text-xs flex items-center justify-center">@</span>}
              <span className="font-medium">{m.name}</span>
              {m.id === "@everyone" && <span className="text-xs text-muted-foreground ml-auto">notify everyone here</span>}
            </button>
          ))}
        </div>
      )}

      {scheduled.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className="mb-1.5 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 transition">
              <CalendarClock className="h-3.5 w-3.5" /> {scheduled.length} scheduled {scheduled.length === 1 ? "message" : "messages"} here
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 p-1 bg-elevated border-border">
            {scheduled.map((s) => (
              <div key={s.id} className="flex items-start gap-2 p-2 rounded-md hover:bg-foreground/[0.04]">
                <Clock className="h-4 w-4 mt-0.5 text-sky-400 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">{format(new Date(s.sendAt), "EEE d MMM 'at' HH:mm")}</p>
                  <p className="text-sm line-clamp-2">{plainText(s.content)}</p>
                </div>
                <button type="button" aria-label="Cancel scheduled message" onClick={() => cancelScheduled(s.id)} className="h-7 w-7 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </PopoverContent>
        </Popover>
      )}

      <div className="rounded-xl border border-border bg-elevated focus-within:border-brand/60 transition shadow-sm">
        {replyTo && (
          <div className="flex items-center gap-2 px-3 pt-2 pb-1.5 text-xs text-muted-foreground border-b border-border">
            <span>Replying to <span className="font-semibold text-foreground">{replyTo.member.profile.name}</span></span>
            <span className="truncate flex-1 opacity-80">{replyTo.fileUrl ? "Attachment" : plainText(replyTo.content)}</span>
            <button type="button" aria-label="Cancel reply" onClick={() => setReplyTo(replyKey, null)} className="h-5 w-5 rounded-full flex items-center justify-center hover:bg-foreground/10 hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {files.length > 0 && (
          <div className="flex gap-2 p-2 pb-0 overflow-x-auto scrollbar-thin">
            {files.map((f) => {
              const kind = kindOf({ type: f.file.type, name: f.file.name, url: "" });
              return (
                <div key={f.key} className="relative flex-shrink-0 w-28 rounded-lg border border-border bg-background overflow-hidden group/file">
                  <div className="h-20 flex items-center justify-center bg-secondary/50">
                    {kind === "image" && f.preview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={f.preview} alt="" className="h-full w-full object-cover" />
                    ) : kind === "video" && f.preview ? (
                      <video src={f.preview} muted className="h-full w-full object-cover" />
                    ) : kind === "video" ? <Film className="h-6 w-6 text-muted-foreground" />
                      : kind === "audio" ? <Music className="h-6 w-6 text-violet-400" />
                      : <FileText className="h-6 w-6 text-sky-400" />}
                    {f.status === "uploading" && (
                      <span className="absolute inset-0 h-20 bg-black/50 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-white" /></span>
                    )}
                    {f.status === "error" && (
                      <span className="absolute inset-0 h-20 bg-destructive/60 flex items-center justify-center text-[11px] font-semibold text-white px-2 text-center">Upload failed</span>
                    )}
                  </div>
                  <div className="px-1.5 py-1">
                    <p className="text-[11px] truncate">{f.file.name}</p>
                    <p className="text-[10px] text-muted-foreground">{fileSize(f.file.size)}</p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${f.file.name}`}
                    onClick={() => removeFile(f.key)}
                    className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover/file:opacity-100 focus:opacity-100 transition"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-end gap-0.5 p-1.5">
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }}
          />
          <button
            type="button"
            aria-label="Attach files"
            title="Attach files (or drop / paste them)"
            onClick={() => fileInput.current?.click()}
            className="h-9 w-9 flex-shrink-0 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] transition"
          >
            <Paperclip className="h-[18px] w-[18px]" />
          </button>
          {type === "channel" && !threadId && (
            <button
              type="button"
              aria-label="Create a poll"
              title="Create a poll"
              onClick={() => setPollOpen(true)}
              className="h-9 w-9 flex-shrink-0 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] transition"
            >
              <BarChart3 className="h-[18px] w-[18px]" />
            </button>
          )}
          <button
            type="button"
            aria-label="Insert code"
            title="Code block (or type ```)"
            aria-pressed={code !== null}
            onClick={() => (code === null ? openCode() : editor.current?.focus())}
            className={cn("h-9 w-9 flex-shrink-0 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] transition", code !== null && "text-brand")}
          >
            <Code2 className="h-[18px] w-[18px]" />
          </button>
          <textarea
            ref={ref}
            rows={1}
            value={value}
            disabled={sending}
            placeholder={placeholder}
            aria-label={placeholder}
            onChange={(e) => {
              if (maybeOpenCode(e.target.value)) return;
              setValue(e.target.value);
              detectMention(e.target.value, e.target.selectionStart);
              if (e.target.value.trim()) onTyped();
            }}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onBlur={() => setTimeout(() => setMention(null), 120)}
            className="flex-1 min-w-0 resize-none bg-transparent outline-none focus-visible:ring-0 focus-visible:ring-offset-0 py-2 px-1 text-[15px] leading-6 placeholder:text-muted-foreground max-h-60 scrollbar-thin disabled:opacity-60"
          />
          <div className="h-9 w-9 flex-shrink-0 flex items-center justify-center rounded-lg hover:bg-foreground/[0.06]">
            <EmojiPicker onChange={insertAtCaret} label="Insert emoji" />
          </div>
          <div className={cn("flex flex-shrink-0 rounded-lg overflow-hidden transition", canSend ? "bg-brand text-brand-foreground" : "text-muted-foreground/50")}>
            <button
              type="button"
              aria-label="Send message"
              onClick={send}
              disabled={!canSend}
              className="h-9 w-9 flex items-center justify-center"
            >
              {sending || uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : cooldown > 0 ? <span className="text-xs font-semibold tabular-nums">{cooldown}s</span> : <SendHorizontal className="h-4 w-4" />}
            </button>
            {!threadId && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Send later"
                    disabled={!value.trim() && !code?.trim()}
                    className={cn("h-9 w-6 flex items-center justify-center border-l", canSend ? "border-black/15 hover:bg-black/10" : "border-transparent")}
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="top" className="w-60">
                  <DropdownMenuLabel className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-sky-400" /> Send later</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {quickTimes().slice(1).map((t) => (
                    <DropdownMenuItem key={t.label} onClick={() => schedule(t.date)}>
                      <span className="flex-1">{t.label}</span>
                      <span className="text-xs text-muted-foreground">{format(t.date, "EEE HH:mm")}</span>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setCustomOpen(true)}>Pick a date and time…</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
        {code !== null && (
          <div className="pb-1.5 -mt-0.5">
            <CodeEditor
              ref={editor}
              value={code}
              onChange={setCode}
              lang={codeLang}
              onLangChange={setCodeLang}
              onClose={closeCode}
              onSubmit={send}
            />
          </div>
        )}
      </div>

      {customOpen && (
        <div className="absolute bottom-full right-4 mb-2 w-72 rounded-xl border border-border bg-elevated shadow-2xl p-3 z-30">
          <p className="text-sm font-semibold mb-2 flex items-center gap-2"><CalendarClock className="h-4 w-4 text-sky-400" /> Send at</p>
          <input
            type="datetime-local"
            value={custom}
            min={toLocalInput(new Date())}
            onChange={(e) => setCustom(e.target.value)}
            className="w-full h-9 rounded-lg bg-background border border-border px-2 text-sm [color-scheme:dark]"
          />
          <div className="flex justify-end gap-2 mt-3">
            <button type="button" onClick={() => setCustomOpen(false)} className="h-8 px-3 rounded-lg text-sm hover:bg-foreground/[0.06]">Cancel</button>
            <button type="button" onClick={() => { setCustomOpen(false); schedule(new Date(custom)); }} className="h-8 px-3 rounded-lg text-sm bg-brand text-brand-foreground font-medium">Schedule</button>
          </div>
        </div>
      )}

      <div className="flex justify-between px-1 pt-1 text-[11px] text-muted-foreground min-h-[16px] gap-3">
        {error ? (
          <span className="text-destructive">{error}</span>
        ) : slowModeSeconds > 0 ? (
          <span className="flex items-center gap-1"><Timer className="h-3 w-3" /> Slow mode: one message every {slowModeSeconds >= 60 ? `${Math.round(slowModeSeconds / 60)} min` : `${slowModeSeconds}s`}</span>
        ) : (
          <span className="hidden sm:inline truncate">**bold** · *italic* · `code` · @ to mention · drop or paste files</span>
        )}
        {!threadId && <span className="hidden sm:inline whitespace-nowrap">Shift + Enter for a new line</span>}
      </div>

      <PollComposer open={pollOpen} onClose={() => setPollOpen(false)} onSubmit={sendPoll} />
    </div>
  )
}
