"use client";

import axios from "axios";
import { format, isPast } from "date-fns";
import { AlertTriangle, Bell, BellOff, Bookmark, CalendarClock, Check, Clock, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MessageSnippet } from "@/components/chat/message-snippet";
import { quickTimes } from "@/lib/when";
import { plainText } from "@/lib/format";
import { cn } from "@/lib/utils";

type Tab = "open" | "done" | "scheduled";

/** Saved for later, reminders, and messages scheduled to send. */
export const SavedView = ({ mobileNav }: { mobileNav?: React.ReactNode }) => {
  const [tab, setTab] = useState<Tab>("open");
  const router = useRouter();
  const qc = useQueryClient();

  const saved = useQuery<any[]>({
    queryKey: ["saved", tab],
    queryFn: () => fetch(`/api/saved?status=${tab}`).then((r) => r.json()),
    enabled: tab !== "scheduled",
  });
  const scheduled = useQuery<any[]>({
    queryKey: ["scheduled", "all"],
    queryFn: () => fetch(`/api/scheduled`).then((r) => r.json()),
    enabled: tab === "scheduled",
  });

  const refresh = () => { qc.invalidateQueries(["saved"]); qc.invalidateQueries(["scheduled"]); };
  const patch = async (id: string, body: object) => { await axios.patch("/api/saved", { id, ...body }).catch(() => {}); refresh(); };
  const unsave = async (id: string) => { await axios.delete(`/api/saved?id=${id}`).catch(() => {}); refresh(); };
  const cancel = async (id: string) => { await axios.delete(`/api/scheduled?id=${id}`).catch(() => {}); refresh(); };
  const reschedule = async (id: string, d: Date) => { await axios.patch("/api/scheduled", { id, sendAt: d.toISOString() }).catch(() => {}); refresh(); };

  const list = tab === "scheduled" ? scheduled : saved;

  return (
    <div className="h-full flex flex-col bg-background">
      <header className="h-12 flex-shrink-0 border-b border-border flex items-center gap-3 px-2 md:px-6">
        {mobileNav}
        <Bookmark className="h-5 w-5 text-brand" />
        <h1 className="font-semibold text-[15px]">Saved & later</h1>
        <div className="ml-auto flex items-center gap-1 rounded-lg bg-foreground/[0.05] p-0.5">
          {([["open", "Saved"], ["scheduled", "Scheduled"], ["done", "Done"]] as const).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setTab(v)} className={cn("h-7 px-3 rounded-md text-xs", tab === v ? "bg-elevated shadow text-foreground" : "text-muted-foreground hover:text-foreground")}>{l}</button>
          ))}
        </div>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-5 space-y-2.5">
          {list.status === "loading" && <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
          {list.status === "success" && (list.data?.length ?? 0) === 0 && (
            <div className="text-center py-20">
              <div className="h-16 w-16 rounded-3xl glow-brand border border-border flex items-center justify-center mx-auto mb-4">
                {tab === "scheduled" ? <CalendarClock className="h-7 w-7 text-sky-400" /> : <Bookmark className="h-7 w-7 text-brand" />}
              </div>
              <p className="text-lg font-semibold">{tab === "open" ? "Nothing saved" : tab === "done" ? "Nothing finished yet" : "Nothing scheduled"}</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                {tab === "open" && "Hover any message and press the bookmark to save it, or set a reminder to get pinged about it later."}
                {tab === "done" && "Saved items you complete move here."}
                {tab === "scheduled" && "Write a message, then use the arrow next to Send to send it later, like tomorrow morning."}
              </p>
            </div>
          )}

          {tab !== "scheduled" && saved.data?.map((s) => {
            const msg = s.message ?? s.directMessage;
            if (!msg) return null;
            const isDm = !!s.directMessage;
            const other = isDm ? s.directMessage.conversation : null;
            const where = isDm
              ? `DM · ${[other?.memberOne.profile.name, other?.memberTwo.profile.name].filter(Boolean).join(" & ")}`
              : `${s.message.channel.server.name}`;
            const due = s.remindAt && !s.remindedAt;
            const overdue = s.remindAt && isPast(new Date(s.remindAt));
            return (
              <MessageSnippet
                key={s.id}
                name={msg.webhookName ?? msg.member.profile.name}
                imageUrl={msg.member.profile.imageUrl}
                content={msg.deleted ? "This message was deleted." : msg.content}
                createdAt={msg.createdAt}
                chatName={isDm ? undefined : s.message.channel.name}
                files={msg.attachments?.length}
                onClick={() => router.push(`/go?chat=${s.chatId}&m=${msg.id}`)}
              >
                <div className="flex items-center gap-2 mt-2.5 flex-wrap" onClick={(e) => e.stopPropagation()}>
                  <span className="text-[11px] text-muted-foreground">{where}</span>
                  {s.remindAt && (
                    <span className={cn("h-6 px-2 rounded-full text-[11px] flex items-center gap-1", overdue && tab === "open" ? "bg-rose-500/15 text-rose-300" : "bg-sky-500/10 text-sky-300")}>
                      <Bell className="h-3 w-3" /> {due ? "Remind" : "Reminded"} {format(new Date(s.remindAt), "EEE d MMM, HH:mm")}
                    </span>
                  )}
                  <div className="ml-auto flex gap-1">
                    {tab === "open" ? (
                      <>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button type="button" className="h-7 px-2 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Remind</button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {quickTimes().map((t) => <DropdownMenuItem key={t.label} onClick={() => patch(s.id, { remindAt: t.date.toISOString() })}>{t.label}</DropdownMenuItem>)}
                            {s.remindAt && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => patch(s.id, { remindAt: null })}><BellOff className="h-4 w-4 mr-2" /> Remove reminder</DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <button type="button" onClick={() => patch(s.id, { done: true })} className="h-7 px-2 rounded-md text-xs text-muted-foreground hover:text-brand hover:bg-brand/10 flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Done</button>
                      </>
                    ) : (
                      <button type="button" onClick={() => patch(s.id, { done: false })} className="h-7 px-2 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] flex items-center gap-1"><RotateCcw className="h-3.5 w-3.5" /> Back to saved</button>
                    )}
                    <button type="button" aria-label="Remove from saved" onClick={() => unsave(s.id)} className="h-7 w-7 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              </MessageSnippet>
            );
          })}

          {tab === "scheduled" && scheduled.data?.map((s) => (
            <div key={s.id} className="rounded-xl border border-border bg-background/60 p-3.5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
                <CalendarClock className="h-3.5 w-3.5 text-sky-400" />
                <span className="text-foreground font-medium">{format(new Date(s.sendAt), "EEEE d MMMM 'at' HH:mm")}</span>
                <span>· {s.channel ? (s.channel.isGroupDm ? s.channel.name : `#${s.channel.name}`) : "Direct message"}</span>
              </div>
              <p className="text-sm whitespace-pre-wrap break-words">{plainText(s.content)}</p>
              {s.error && <p className="text-xs text-destructive mt-2 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Couldn&apos;t send: {s.error}</p>}
              <div className="flex gap-1 mt-2.5 justify-end">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className="h-7 px-2 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Reschedule</button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {quickTimes().map((t) => <DropdownMenuItem key={t.label} onClick={() => reschedule(s.id, t.date)}>{t.label}</DropdownMenuItem>)}
                  </DropdownMenuContent>
                </DropdownMenu>
                <button type="button" onClick={() => router.push(`/go?chat=${s.channelId ?? s.conversationId}`)} className="h-7 px-2 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06]">Open chat</button>
                <button type="button" onClick={() => cancel(s.id)} className="h-7 px-2 rounded-md text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center gap-1"><Trash2 className="h-3.5 w-3.5" /> Cancel</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
