"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { format, isToday, isYesterday, isSameDay } from "date-fns";
import { Member } from "@prisma/client";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, Loader2, ServerCrash, Sparkles, X } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { useSearchParams } from "next/navigation";

import { useChatQuery } from "@/hooks/use-chat-query";
import { useChatSocket } from "@/hooks/use-chat-socket";
import { useSocket } from "@/components/providers/socket-provider";
import { addKey as addEvent, aiDeltaKey, typingKey, type Typing } from "@/lib/socket-keys";
import { useAiStream } from "@/hooks/use-ai-stream";
import type { MessagePayload } from "@/lib/message-include";
import { JUMP_EVENT, flashMessage } from "@/lib/jump";
import { usePanel } from "@/hooks/use-panel-store";

import { ChatWelcome } from "./chat-welcome";
import { ChatItem } from "./chat-item";

/** Messages from the same person within this window share one header. */
const GROUP_WINDOW_MS = 7 * 60 * 1000;

interface ChatMessagesProps {
  name: string;
  member: Member;
  chatId: string;
  apiUrl: string;
  socketUrl: string;
  socketQuery: Record<string, string>;
  paramKey: "channelId" | "conversationId";
  paramValue: string;
  type: "channel" | "conversation";
  /** when you last read this chat, for the "New messages" line (ISO string, null = never) */
  lastReadAt?: string | null;
  topic?: string | null;
  isGroupDm?: boolean;
}

const dayLabel = (d: Date) => (isToday(d) ? "Today" : isYesterday(d) ? "Yesterday" : format(d, "EEEE, d MMMM yyyy"));

const Divider = ({ label, tone = "muted" }: { label: string; tone?: "muted" | "new" }) => (
  <div className={tone === "new" ? "relative flex items-center my-2 px-4" : "relative flex items-center my-3 px-4"} role="separator" aria-label={label}>
    <div className={tone === "new" ? "flex-1 h-px bg-destructive/70" : "flex-1 h-px bg-border"} />
    <span
      className={
        tone === "new"
          ? "ml-2 text-[11px] font-bold uppercase tracking-wide text-destructive"
          : "mx-3 text-xs font-medium text-muted-foreground"
      }
    >
      {label}
    </span>
    {tone === "muted" && <div className="flex-1 h-px bg-border" />}
  </div>
);

export const ChatMessages = ({
  name,
  member,
  chatId,
  apiUrl,
  socketUrl,
  socketQuery,
  paramKey,
  paramValue,
  type,
  lastReadAt = null,
  topic = null,
  isGroupDm = false,
}: ChatMessagesProps) => {
  const queryKey = `chat:${chatId}`;
  const scrollRef = useRef<HTMLDivElement>(null);
  const newLineRef = useRef<HTMLDivElement>(null);
  const { socket } = useSocket();
  const qc = useQueryClient();

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, status } = useChatQuery({
    queryKey,
    apiUrl,
    paramKey,
    paramValue,
  });
  useChatSocket({ chatId, queryKey, addKey: addEvent(chatId), updateKey: `${addEvent(chatId)}:update` });

  // Oldest first, as you read them.
  const messages: MessagePayload[] = useMemo(
    () => (data?.pages ?? []).flatMap((p: any) => p?.items ?? []).slice().reverse(),
    [data]
  );

  // Where the "New messages" line goes: the first message from someone else after you last read.
  // Frozen when the chat opens, so it does not jump as you read.
  const [readMark] = useState(() => (lastReadAt ? new Date(lastReadAt).getTime() : null));
  const firstNewId = useMemo(() => {
    if (readMark === null) return null;
    return messages.find((m) => new Date(m.createdAt).getTime() > readMark && m.memberId !== member.id)?.id ?? null;
  }, [messages, readMark, member.id]);

  /* ---------- catch-up banner ---------- */
  const openPanel = usePanel((s) => s.open);
  // Catch-up (from the header too) starts from where you were before this visit.
  useEffect(() => {
    if (type === "channel") usePanel.setState({ since: readMark ? new Date(readMark).toISOString() : null });
  }, [readMark, type, chatId]);
  const [bannerHidden, setBannerHidden] = useState(false);
  const newCount = useMemo(() => {
    if (readMark === null) return 0;
    return messages.filter((m) => new Date(m.createdAt).getTime() > readMark && m.memberId !== member.id && !m.system).length;
  }, [messages, readMark, member.id]);
  const showBanner = type === "channel" && !bannerHidden && newCount >= 5 && readMark !== null;

  /* ---------- jump to a message (links, search, pins) ---------- */
  const searchParams = useSearchParams();
  const [jumpTarget, setJumpTarget] = useState<string | null>(() => searchParams?.get("m") ?? null);
  const jumpTries = useRef(0);
  useEffect(() => {
    const onJump = (e: Event) => { jumpTries.current = 0; setJumpTarget((e as CustomEvent<string>).detail); };
    window.addEventListener(JUMP_EVENT, onJump);
    return () => window.removeEventListener(JUMP_EVENT, onJump);
  }, []);
  useEffect(() => {
    const m = searchParams?.get("m");
    if (m) { jumpTries.current = 0; setJumpTarget(m); }
  }, [searchParams]);
  useEffect(() => {
    if (!jumpTarget || status !== "success") return;
    if (messages.some((m) => m.id === jumpTarget)) {
      requestAnimationFrame(() => flashMessage(jumpTarget));
      setJumpTarget(null);
    } else if (hasNextPage && !isFetchingNextPage && jumpTries.current < 20) {
      jumpTries.current++;
      fetchNextPage();
    } else if (!hasNextPage || jumpTries.current >= 20) {
      setJumpTarget(null);
    }
  }, [jumpTarget, messages, hasNextPage, isFetchingNextPage, fetchNextPage, status]);

  /* ---------- read state ---------- */
  const markRead = useCallback(() => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    fetch("/api/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId }) })
      .then((r) => r.json())
      .then((d) => { if (d?.cleared) qc.invalidateQueries(["inbox-count"]); })
      .catch(() => {});
  }, [chatId, qc]);
  useEffect(() => { markRead(); }, [markRead]);
  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && markRead();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [markRead]);

  /* ---------- scrolling ---------- */
  const [atBottom, setAtBottom] = useState(true);
  const [unseen, setUnseen] = useState(0);
  const initialised = useRef(false);
  const prevHeight = useRef(0);
  const prevFirstId = useRef<string | null>(null);
  const prevLastId = useRef<string | null>(null);

  const scrollToBottom = (smooth = true) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  };

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !messages.length) return;
    const first = messages[0]?.id ?? null;
    const last = messages[messages.length - 1]?.id ?? null;

    if (!initialised.current) {
      // First paint: open at the "New messages" line, else at the bottom.
      initialised.current = true;
      if (jumpTarget) { /* the jump effect scrolls */ }
      else if (newLineRef.current) newLineRef.current.scrollIntoView({ block: "center" });
      else el.scrollTop = el.scrollHeight;
    } else if (first !== prevFirstId.current && last === prevLastId.current) {
      // Older history was added above: keep what you were reading in place.
      el.scrollTop += el.scrollHeight - prevHeight.current;
    } else if (last !== prevLastId.current) {
      const mine = messages[messages.length - 1]?.memberId === member.id;
      if (atBottom || mine) {
        requestAnimationFrame(() => scrollToBottom(true));
        markRead();
      } else {
        setUnseen((n) => n + 1);
      }
    }
    prevHeight.current = el.scrollHeight;
    prevFirstId.current = first;
    prevLastId.current = last;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  // Link previews, images and embeds load after a message arrives; stay pinned to the bottom.
  const contentRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  atBottomRef.current = atBottom;
  useEffect(() => {
    const el = scrollRef.current;
    const inner = contentRef.current;
    if (!el || !inner || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { if (atBottomRef.current) el.scrollTop = el.scrollHeight; });
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (bottom !== atBottom) setAtBottom(bottom);
    if (bottom && unseen) { setUnseen(0); markRead(); }
    if (el.scrollTop < 200 && hasNextPage && !isFetchingNextPage) fetchNextPage();
  };

  /* ---------- AI answers streaming in (project channels) ---------- */
  useEffect(() => {
    if (!socket || type !== "channel") return;
    const k = aiDeltaKey(chatId);
    const on = (d: { messageId: string; text: string }) => useAiStream.getState().set(d.messageId, d.text);
    socket.on(k, on);
    return () => { socket.off(k, on); };
  }, [socket, chatId, type]);

  /* ---------- typing ---------- */
  const [typing, setTyping] = useState<Record<string, { name: string; at: number }>>({});
  useEffect(() => {
    if (!socket) return;
    const key = typingKey(chatId);
    const onTyping = (t: Typing) => {
      if (t.memberId === member.id) return;
      setTyping((prev) => {
        const next = { ...prev };
        if (t.typing) next[t.memberId] = { name: t.name, at: Date.now() };
        else delete next[t.memberId];
        return next;
      });
    };
    socket.on(key, onTyping);
    const sweep = setInterval(() => {
      setTyping((prev) => {
        const now = Date.now();
        const live = Object.entries(prev).filter(([, v]) => now - v.at < 6000);
        return live.length === Object.keys(prev).length ? prev : Object.fromEntries(live);
      });
    }, 2000);
    return () => { socket.off(key, onTyping); clearInterval(sweep); };
  }, [socket, chatId, member.id]);
  // someone who just posted is no longer typing
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last && typing[last.memberId]) setTyping(({ [last.memberId]: _, ...rest }) => rest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);
  const typers = Object.values(typing).map((t) => t.name);
  const who = (n: string) => <span className="font-semibold text-foreground/80">{n}</span>;
  const typingNode =
    typers.length === 0 ? null :
    typers.length === 1 ? <>{who(typers[0])} is typing…</> :
    typers.length === 2 ? <>{who(typers[0])} and {who(typers[1])} are typing…</> :
    <>Several people are typing…</>;

  if (status === "error") {
    return (
      <div className="flex flex-col flex-1 justify-center items-center">
        <ServerCrash className="h-7 w-7 text-muted-foreground my-4" />
        <p className="text-sm text-muted-foreground">Couldn&apos;t load messages. Check your connection and try again.</p>
      </div>
    )
  }

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      {showBanner && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-1 rounded-full border border-border bg-elevated/95 backdrop-blur shadow-xl pl-1 pr-1 h-9">
            <button
              type="button"
              onClick={() => openPanel("catchup", { since: new Date(readMark!).toISOString() })}
              className="flex items-center gap-2 h-7 pl-2 pr-3 rounded-full hover:bg-foreground/[0.06] text-sm"
            >
              <span className="h-5 w-5 rounded-full bg-brand/20 text-brand flex items-center justify-center"><Sparkles className="h-3 w-3" /></span>
              <span><span className="font-semibold tabular-nums">{newCount}</span> new since {formatDistanceToNowStrict(new Date(readMark!), { addSuffix: true })}</span>
              <span className="text-brand font-medium">Catch me up</span>
            </button>
            <button type="button" aria-label="Dismiss" onClick={() => setBannerHidden(true)} className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06]">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto scrollbar-thin pb-2"
        role="log"
        aria-live="polite"
        aria-label={`Messages in ${type === "channel" ? "#" : ""}${name}`}
      >
        <div ref={contentRef} className="min-h-full flex flex-col justify-end">
          {status === "loading" && (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 text-muted-foreground animate-spin" /></div>
          )}
          {status !== "loading" && !hasNextPage && <ChatWelcome type={type} name={name} topic={topic} isGroupDm={isGroupDm} />}
          {isFetchingNextPage && (
            <div className="flex justify-center py-3"><Loader2 className="h-5 w-5 text-muted-foreground animate-spin" /></div>
          )}

          {messages.map((message, i) => {
            const prev = messages[i - 1];
            const at = new Date(message.createdAt);
            const newDay = !prev || !isSameDay(new Date(prev.createdAt), at);
            const isFirstNew = message.id === firstNewId;
            const grouped =
              !!prev && !newDay && !isFirstNew && !message.replyTo &&
              prev.memberId === message.memberId && !prev.deleted && !prev.system && !message.system &&
              (prev.webhookName ?? null) === (message.webhookName ?? null) &&
              at.getTime() - new Date(prev.createdAt).getTime() < GROUP_WINDOW_MS;
            return (
              <Fragment key={message.id}>
                {newDay && <Divider label={dayLabel(at)} />}
                {isFirstNew && <div ref={newLineRef}><Divider label="New messages" tone="new" /></div>}
                <ChatItem
                  message={message}
                  currentMember={member}
                  chatId={chatId}
                  type={type}
                  grouped={grouped}
                  socketUrl={socketUrl}
                  socketQuery={socketQuery}
                />
              </Fragment>
            );
          })}
        </div>
      </div>

      <div className="h-5 px-4 text-xs text-muted-foreground flex items-center gap-1.5" aria-live="polite">
        {typingNode && (
          <>
            <span className="flex gap-0.5" aria-hidden>
              <span className="h-1 w-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.3s]" />
              <span className="h-1 w-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.15s]" />
              <span className="h-1 w-1 rounded-full bg-muted-foreground animate-bounce" />
            </span>
            <span>{typingNode}</span>
          </>
        )}
      </div>

      {!atBottom && (
        <button
          type="button"
          onClick={() => { scrollToBottom(true); setUnseen(0); markRead(); }}
          className="absolute right-6 bottom-8 flex items-center gap-1.5 h-8 px-3 rounded-full bg-elevated border border-border shadow-lg text-sm hover:border-brand transition"
        >
          <ArrowDown className="h-4 w-4" />
          {unseen > 0 ? `${unseen} new message${unseen > 1 ? "s" : ""}` : "Jump to latest"}
        </button>
      )}
    </div>
  )
}
