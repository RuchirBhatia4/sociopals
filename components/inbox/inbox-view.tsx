"use client";

import axios from "axios";
import { format, isToday, isYesterday } from "date-fns";
import {
  AtSign, BarChart3, Bell, Check, CheckCheck, ClipboardList, CornerDownRight, Hash, Inbox, Loader2, Mail, MailOpen, MessageCircle, MessagesSquare, RotateCcw, Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { UserAvatar } from "@/components/user-avatar";
import { renderMessage } from "@/lib/format";
import { useMe } from "@/hooks/use-me";
import { cn } from "@/lib/utils";

type Item = {
  id: string; type: string; serverId: string | null; chatId: string; chatName: string | null; messageId: string | null; directMessageId: string | null;
  actorName: string | null; actorImage: string | null; preview: string; createdAt: string; readAt: string | null; doneAt: string | null;
};
type Data = { items: Item[]; servers: { id: string; name: string; imageUrl: string }[] };

const TYPES: { id: string | null; label: string; icon: React.ElementType; color: string; verb: string }[] = [
  { id: null, label: "All", icon: Inbox, color: "", verb: "" },
  { id: "MENTION", label: "Mentions", icon: AtSign, color: "text-mention", verb: "mentioned you" },
  { id: "REPLY", label: "Replies", icon: CornerDownRight, color: "text-sky-400", verb: "replied to you" },
  { id: "THREAD", label: "Threads", icon: MessagesSquare, color: "text-brand", verb: "replied in a thread" },
  { id: "DIRECT", label: "DMs", icon: MessageCircle, color: "text-violet-400", verb: "sent you a message" },
  { id: "KEYWORD", label: "Keywords", icon: Hash, color: "text-amber-400", verb: "used a keyword" },
  { id: "TASK", label: "Tasks", icon: ClipboardList, color: "text-amber-300", verb: "assigned you a task" },
  { id: "REMINDER", label: "Reminders", icon: Bell, color: "text-rose-400", verb: "Reminder" },
  { id: "POLL", label: "Polls", icon: BarChart3, color: "text-teal-300", verb: "poll results" },
];
const meta = (t: string) => TYPES.find((x) => x.id === t) ?? TYPES[0];
const dayLabel = (d: Date) => (isToday(d) ? "Today" : isYesterday(d) ? "Yesterday" : format(d, "EEEE, d MMMM"));

/** Every mention, reply, DM, keyword hit and reminder from every server, in one list to work through. */
export const InboxView = ({ mobileNav }: { mobileNav?: React.ReactNode }) => {
  const router = useRouter();
  const qc = useQueryClient();
  const { focusOn } = useMe();
  const [type, setType] = useState<string | null>(null);
  const [view, setView] = useState<"open" | "done">("open");
  const [cursor, setCursor] = useState(0);

  const key = ["inbox", view, type];
  const { data, status } = useQuery<Data>({
    queryKey: key,
    queryFn: () => fetch(`/api/inbox?view=${view}${type ? `&type=${type}` : ""}`).then((r) => r.json()),
  });
  const items = useMemo(() => data?.items ?? [], [data]);
  const servers = new Map((data?.servers ?? []).map((s) => [s.id, s]));

  const act = useCallback(async (action: "read" | "unread" | "done" | "undone", ids?: string[], all?: boolean) => {
    // optimistic: done items leave the open list right away
    qc.setQueryData<Data>(key, (old) => {
      if (!old) return old;
      const hit = (i: Item) => all || ids?.includes(i.id);
      const now = new Date().toISOString();
      if (action === "done" || action === "undone") return { ...old, items: old.items.filter((i) => !hit(i)) };
      return { ...old, items: old.items.map((i) => (hit(i) ? { ...i, readAt: action === "read" ? now : null } : i)) };
    });
    await axios.post("/api/inbox", { action, ids, all }).catch(() => {});
    qc.invalidateQueries(["inbox-count"]);
    qc.invalidateQueries(["inbox"]);
  }, [qc, key]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (i: Item) => {
    if (!i.readAt) act("read", [i.id]);
    router.push(`/go?chat=${i.chatId}${i.messageId || i.directMessageId ? `&m=${i.messageId ?? i.directMessageId}` : ""}`);
  };

  // j / k to move, enter to open, e to mark done, u to toggle unread
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, [contenteditable]") || e.metaKey || e.ctrlKey) return;
      const cur = items[cursor];
      if (e.key === "j" || e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(items.length - 1, c + 1)); }
      if (e.key === "k" || e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
      if (e.key === "Enter" && cur) open(cur);
      if (e.key === "e" && cur) act(view === "open" ? "done" : "undone", [cur.id]);
      if (e.key === "u" && cur) act(cur.readAt ? "unread" : "read", [cur.id]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setCursor(0); }, [type, view]);
  useEffect(() => { document.getElementById(`inbox-${items[cursor]?.id}`)?.scrollIntoView({ block: "nearest" }); }, [cursor, items]);

  const unread = items.filter((i) => !i.readAt).length;
  let lastDay = "";

  return (
    <div className="h-full flex flex-col bg-background">
      <header className="h-12 flex-shrink-0 border-b border-border flex items-center gap-3 px-2 md:px-6">
        {mobileNav}
        <Inbox className="h-5 w-5 text-brand" />
        <h1 className="font-semibold text-[15px]">Inbox</h1>
        {view === "open" && unread > 0 && <span className="text-xs text-muted-foreground">{unread} unread</span>}
        <div className="ml-auto flex items-center gap-1 rounded-lg bg-foreground/[0.05] p-0.5">
          {(["open", "done"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} className={cn("h-7 px-3 rounded-md text-xs", view === v ? "bg-elevated shadow text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {v === "open" ? "To do" : "Done"}
            </button>
          ))}
        </div>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-5">
          {focusOn && (
            <div className="mb-4 rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-2.5 text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-300" /> Focus mode is on: no pop-ups, but everything still collects here.
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5 mb-5">
            {TYPES.map((t) => (
              <button
                key={t.label}
                type="button"
                onClick={() => setType(t.id)}
                className={cn("h-8 px-3 rounded-full text-sm border flex items-center gap-1.5 transition", type === t.id ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30")}
              >
                <t.icon className={cn("h-3.5 w-3.5", type !== t.id && t.color)} /> {t.label}
              </button>
            ))}
            {view === "open" && items.length > 0 && (
              <div className="ml-auto flex gap-1">
                {unread > 0 && (
                  <button type="button" onClick={() => act("read", undefined, true)} className="h-8 px-3 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05] flex items-center gap-1.5">
                    <MailOpen className="h-3.5 w-3.5" /> Mark all read
                  </button>
                )}
                <button type="button" onClick={() => act("done", items.map((i) => i.id))} className="h-8 px-3 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05] flex items-center gap-1.5">
                  <CheckCheck className="h-3.5 w-3.5" /> Clear all
                </button>
              </div>
            )}
          </div>

          {status === "loading" && <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
          {status === "success" && items.length === 0 && (
            <div className="text-center py-20">
              <div className="h-16 w-16 rounded-3xl glow-brand border border-border flex items-center justify-center mx-auto mb-4">
                <CheckCheck className="h-7 w-7 text-brand" />
              </div>
              <p className="text-lg font-semibold">{view === "open" ? "You're all caught up" : "Nothing done yet"}</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                {view === "open"
                  ? "Mentions, replies, DMs, keyword alerts and reminders from every server land here. Press e to clear one."
                  : "Things you mark done move here, in case you need them again."}
              </p>
            </div>
          )}

          <div className="space-y-1">
            {items.map((i, idx) => {
              const d = new Date(i.createdAt);
              const label = dayLabel(d);
              const header = label !== lastDay ? (lastDay = label) : null;
              const m = meta(i.type);
              const server = i.serverId ? servers.get(i.serverId) : null;
              return (
                <div key={i.id}>
                  {header && <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pt-4 pb-2 px-1">{header}</p>}
                  <div
                    id={`inbox-${i.id}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => open(i)}
                    onMouseEnter={() => setCursor(idx)}
                    className={cn(
                      "group relative flex gap-3 rounded-xl border px-3.5 py-3 cursor-pointer transition",
                      cursor === idx ? "border-foreground/20 bg-elevated" : "border-transparent hover:bg-elevated/60",
                      !i.readAt && view === "open" && "bg-elevated/70"
                    )}
                  >
                    {!i.readAt && view === "open" && <span className="absolute left-1 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-brand" aria-label="Unread" />}
                    <div className="relative flex-shrink-0 ml-1.5">
                      {i.actorImage ? (
                        <UserAvatar src={i.actorImage} className="h-9 w-9 md:h-9 md:w-9" />
                      ) : (
                        <span className={cn("h-9 w-9 rounded-full bg-foreground/[0.06] flex items-center justify-center", m.color)}><m.icon className="h-4 w-4" /></span>
                      )}
                      <span className={cn("absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-background ring-2 ring-background flex items-center justify-center", m.color)}>
                        <m.icon className="h-3 w-3" />
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        {i.type === "REMINDER" ? (
                          <span className="font-semibold">Reminder</span>
                        ) : (
                          <><span className="font-semibold">{i.actorName ?? "Someone"}</span> <span className="text-muted-foreground">{m.verb}</span></>
                        )}
                        {i.chatName && <span className="text-muted-foreground"> in <span className="text-foreground/80">{i.type === "DIRECT" ? "your DMs" : `#${i.chatName.replace(/^#/, "")}`}</span></span>}
                        {server && <span className="text-muted-foreground"> · {server.name}</span>}
                      </p>
                      <div className={cn("text-sm mt-0.5 line-clamp-2 break-words", i.readAt ? "text-muted-foreground" : "text-foreground/90")}>
                        {renderMessage(i.preview, {})}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className="text-xs text-muted-foreground tabular-nums">{format(d, "HH:mm")}</span>
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
                        {view === "open" ? (
                          <>
                            <IconBtn label={i.readAt ? "Mark unread (u)" : "Mark read (u)"} onClick={() => act(i.readAt ? "unread" : "read", [i.id])}>
                              {i.readAt ? <Mail className="h-3.5 w-3.5" /> : <MailOpen className="h-3.5 w-3.5" />}
                            </IconBtn>
                            <IconBtn label="Done (e)" onClick={() => act("done", [i.id])}><Check className="h-3.5 w-3.5" /></IconBtn>
                          </>
                        ) : (
                          <IconBtn label="Move back to To do" onClick={() => act("undone", [i.id])}><RotateCcw className="h-3.5 w-3.5" /></IconBtn>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {items.length > 0 && (
            <p className="text-xs text-muted-foreground text-center mt-8">
              <kbd className="px-1.5 py-0.5 rounded border border-border">j</kbd> <kbd className="px-1.5 py-0.5 rounded border border-border">k</kbd> to move ·
              {" "}<kbd className="px-1.5 py-0.5 rounded border border-border">enter</kbd> to open · <kbd className="px-1.5 py-0.5 rounded border border-border">e</kbd> done ·
              {" "}<kbd className="px-1.5 py-0.5 rounded border border-border">u</kbd> unread
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

const IconBtn = ({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={(e) => { e.stopPropagation(); onClick(); }}
    className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/[0.08]"
  >
    {children}
  </button>
);
