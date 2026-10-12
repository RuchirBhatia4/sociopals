"use client";

import axios from "axios";
import qs from "query-string";
import { format, formatDistanceToNowStrict } from "date-fns";
import { Member, MemberRole } from "@prisma/client";
import {
  Bell, Bookmark, Bot, Copy, CornerUpLeft, Edit, FileText, Gavel, Link2, MessagesSquare, MoreHorizontal,
  PhoneOff, Pin, PinOff, Reply, ShieldAlert, ShieldCheck, Sparkles, Trash,
} from "lucide-react";
import Image from "next/image";
import { memo, useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";

import { UserAvatar } from "@/components/user-avatar";
import { ActionTooltip } from "@/components/action-tooltip";
import { EmojiPicker } from "@/components/emoji-picker";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { isEmojiOnly, plainText, renderMessage } from "@/lib/format";
import { mentionToken } from "@/lib/mention";
import { quickTimes } from "@/lib/when";
import type { MessagePayload } from "@/lib/message-include";
import { useModal } from "@/hooks/use-modal-store";
import { useComposerStore } from "@/hooks/use-composer-store";
import { usePanel } from "@/hooks/use-panel-store";
import { toast } from "@/hooks/use-toast";

import { MessageAttachments } from "./message-attachments";
import { LinkPreview } from "./link-preview";
import { PollCard } from "./poll-card";

interface ChatItemProps {
  message: MessagePayload;
  currentMember: Member;
  chatId: string;
  type: "channel" | "conversation";
  /** continues the previous message from the same person: no avatar or name */
  grouped: boolean;
  socketUrl: string;
  socketQuery: Record<string, string>;
  /** shown inside the thread panel: no thread button or summary */
  inThread?: boolean;
};

const roleIconMap = {
  "GUEST": null,
  "MODERATOR": <ShieldCheck className="h-3.5 w-3.5 text-sky-500" />,
  "ADMIN": <ShieldAlert className="h-3.5 w-3.5 text-rose-500" />,
}

const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉"];

const ToolButton = ({ label, onClick, children, danger, active }: { label: string; onClick?: () => void; children: React.ReactNode; danger?: boolean; active?: boolean }) => (
  <ActionTooltip label={label}>
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground transition",
        danger && "hover:text-destructive",
        active && "text-brand"
      )}
    >
      {children}
    </button>
  </ActionTooltip>
);

const ChatItemInner = ({
  message,
  currentMember,
  chatId,
  type,
  grouped,
  socketUrl,
  socketQuery,
  inThread = false,
}: ChatItemProps) => {
  const { id, content, member, fileUrl, deleted } = message;
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const [saving, setSaving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const { onOpen } = useModal();
  const setReplyTo = useComposerStore((s) => s.setReplyTo);
  const openPanel = usePanel((s) => s.open);
  const params = useParams();
  const router = useRouter();

  const createdAt = new Date(message.createdAt);
  const isUpdated = !deleted && !!message.editedAt;

  const isAdmin = currentMember.role === MemberRole.ADMIN;
  const isModerator = currentMember.role === MemberRole.MODERATOR;
  const isBot = !!message.webhookName;
  const isOwner = currentMember.id === member.id && !isBot;
  const canDeleteMessage = !deleted && (isAdmin || isModerator || isOwner);
  const canEditMessage = !deleted && isOwner && !fileUrl && !message.poll && !message.system;
  const fileType = fileUrl?.split(".").pop()?.toLowerCase();
  const isPDF = !!fileUrl && fileType === "pdf";
  const isImage = !!fileUrl && !isPDF;
  const mentionsMe = !deleted && content.includes(mentionToken(currentMember.id));
  const pinned = !!message.pinnedAt;
  const isChannel = type === "channel";

  useEffect(() => { if (!isEditing) setDraft(content); }, [content, isEditing]);
  useEffect(() => {
    if (!isEditing) return;
    const el = editRef.current;
    if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  }, [isEditing]);

  const openProfile = (memberId: string) => {
    if (memberId === currentMember.id || isBot) return;
    router.push(`/servers/${params?.serverId}/conversations/${memberId}`);
  };

  const patch = async (body: object) => {
    try {
      await axios.patch(qs.stringifyUrl({ url: `${socketUrl}/${id}`, query: socketQuery }), body);
      return true;
    } catch (e: any) {
      toast({ title: e?.response?.data?.error ?? "That didn't work. Try again.", tone: "error" });
      return false;
    }
  };

  const saveEdit = async () => {
    const value = draft.trim();
    if (!value || value === content) { setIsEditing(false); return; }
    setSaving(true);
    if (await patch({ content: value })) setIsEditing(false);
    setSaving(false);
  };

  const react = async (emoji: string) => {
    try {
      const idKey = isChannel ? "messageId" : "directMessageId";
      await axios.post(qs.stringifyUrl({ url: "/api/socket/reactions", query: { ...socketQuery, [idKey]: id } }), { emoji });
    } catch (error) {
      console.log(error);
    }
  };

  const save = async (remindAt?: Date) => {
    try {
      await axios.post("/api/saved", { chatId, [isChannel ? "messageId" : "directMessageId"]: id, remindAt: remindAt?.toISOString() ?? null });
      toast({
        title: remindAt ? `Reminder set for ${format(remindAt, "EEE d MMM, HH:mm")}` : "Saved for later",
        action: { label: "View saved", onClick: () => router.push("/saved") },
      });
    } catch {
      toast({ title: "Couldn't save that message", tone: "error" });
    }
  };

  const copyLink = () => {
    const base = isChannel
      ? `/servers/${params?.serverId}/channels/${chatId}`
      : `/servers/${params?.serverId}/conversations/${params?.memberId}`;
    const thread = message.threadId ? `&thread=${message.threadId}` : "";
    navigator.clipboard?.writeText(`${window.location.origin}${base}?m=${id}${thread}`);
    toast({ title: "Link copied" });
  };

  const jumpTo = (messageId: string) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("flash-highlight");
    setTimeout(() => el.classList.remove("flash-highlight"), 1600);
  };

  // reactions grouped by emoji, in the order they were first used
  const reactionGroups: { emoji: string; count: number; mine: boolean }[] = [];
  for (const r of message.reactions ?? []) {
    let g = reactionGroups.find((x) => x.emoji === r.emoji);
    if (!g) reactionGroups.push((g = { emoji: r.emoji, count: 0, mine: false }));
    g.count++;
    if (r.profileId === currentMember.profileId) g.mine = true;
  }

  const time = format(createdAt, "h:mm a");
  const fullTime = format(createdAt, "EEEE, d MMMM yyyy 'at' h:mm a");

  /* ---------- system messages (call recaps, poll results) ---------- */
  if (message.system) {
    return (
      <div id={`msg-${id}`} className="group px-4 py-1.5 flex gap-3 items-start">
        <div className="w-10 flex justify-center flex-shrink-0 pt-0.5">
          <span className="h-7 w-7 rounded-full bg-brand/[0.15] text-brand flex items-center justify-center">
            {content.startsWith("**Call recap**") ? <PhoneOff className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
          </span>
        </div>
        <div className="flex-1 min-w-0 rounded-xl border border-border bg-elevated/60 px-3.5 py-2.5 max-w-xl">
          <div className="text-sm text-foreground/90 whitespace-pre-wrap break-words">{renderMessage(content, { meId: currentMember.id })}</div>
          <time className="text-[11px] text-muted-foreground" title={fullTime}>{time}</time>
        </div>
      </div>
    );
  }

  const name = isBot ? message.webhookName! : member.profile.name;
  const avatar = isBot ? message.webhookAvatar : member.profile.imageUrl;
  const hasText = !fileUrl && !isEditing && (!!content.trim() || deleted) && !(message.poll && content === message.poll.question);

  return (
    <div
      id={`msg-${id}`}
      className={cn(
        "relative group flex w-full px-4 transition-[background-color,box-shadow] hover:bg-foreground/[0.055] focus-within:bg-foreground/[0.055] hover:shadow-[inset_2px_0_0_hsl(var(--brand)/0.7)]",
        grouped ? "py-[calc(var(--msg-pad)*0.5)]" : "pt-[calc(var(--msg-pad)+0.375rem)] pb-[calc(var(--msg-pad)*0.5)]",
        mentionsMe && "bg-mention-soft/60 hover:bg-mention-soft/80 border-l-2 border-mention",
        message.isDecision && !deleted && "bg-brand/[0.06] hover:bg-brand/[0.09] border-l-2 border-brand",
        menuOpen && "bg-foreground/[0.055] shadow-[inset_2px_0_0_hsl(var(--brand)/0.7)]"
      )}
    >
      <div className="flex gap-x-3 items-start w-full min-w-0">
        <div className="w-10 flex-shrink-0 flex justify-center">
          {grouped ? (
            <time
              dateTime={createdAt.toISOString()}
              title={fullTime}
              className="invisible group-hover:visible text-[10px] leading-6 text-muted-foreground tabular-nums"
            >
              {format(createdAt, "h:mm")}
            </time>
          ) : isBot && !avatar ? (
            <span className="mt-0.5 h-10 w-10 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center"><Bot className="h-5 w-5" /></span>
          ) : (
            <button type="button" onClick={() => openProfile(member.id)} className="mt-0.5 hover:opacity-90 transition" aria-label={`Message ${name}`}>
              <UserAvatar src={avatar ?? undefined} className="h-10 w-10 md:h-10 md:w-10" />
            </button>
          )}
        </div>
        <div className="flex flex-col w-full min-w-0">
          {(pinned || (message.isDecision && !deleted)) && (
            <div className="flex items-center gap-2 text-[11px] font-medium mb-0.5">
              {message.isDecision && !deleted && (
                <span className="inline-flex items-center gap-1 text-brand"><Gavel className="h-3 w-3" /> Decision</span>
              )}
              {pinned && <span className="inline-flex items-center gap-1 text-amber-400"><Pin className="h-3 w-3" /> Pinned</span>}
            </div>
          )}
          {message.replyTo && (
            <button
              type="button"
              onClick={() => jumpTo(message.replyTo!.id)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-0.5 max-w-full text-left"
            >
              <CornerUpLeft className="h-3 w-3 flex-shrink-0 -scale-x-100" />
              <UserAvatar src={message.replyTo.member.profile.imageUrl} className="h-4 w-4 md:h-4 md:w-4 flex-shrink-0" />
              <span className="font-medium text-foreground/80 whitespace-nowrap flex-shrink-0">{message.replyTo.member.profile.name}</span>
              <span className="truncate">
                {message.replyTo.deleted ? "Original message was deleted" : message.replyTo.fileUrl ? "Attachment" : plainText(message.replyTo.content)}
              </span>
            </button>
          )}
          {!grouped && (
            <div className="flex items-baseline gap-x-2">
              <button type="button" onClick={() => openProfile(member.id)} className={cn("font-semibold text-[15px]", !isBot && "hover:underline")}>
                {name}
              </button>
              {isBot && <span className="self-center text-[10px] font-bold px-1.5 py-px rounded bg-indigo-500 text-white tracking-wide">BOT</span>}
              {!isBot && roleIconMap[member.role] && (
                <ActionTooltip label={member.role === "ADMIN" ? "Admin" : "Moderator"}>
                  <span className="self-center">{roleIconMap[member.role]}</span>
                </ActionTooltip>
              )}
              <time dateTime={createdAt.toISOString()} title={fullTime} className="text-xs text-muted-foreground tabular-nums">
                {time}
              </time>
            </div>
          )}

          {isImage && (
            <a
              href={fileUrl!}
              target="_blank"
              rel="noopener noreferrer"
              className="relative mt-1.5 overflow-hidden rounded-lg border border-border bg-secondary h-60 w-60 max-w-full"
            >
              <Image src={fileUrl!} alt={content || "Image"} fill className="object-cover" sizes="240px" />
            </a>
          )}
          {isPDF && (
            <a
              href={fileUrl!}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 flex items-center gap-3 p-3 rounded-lg border border-border bg-elevated max-w-sm hover:border-brand/60 transition"
            >
              <span className="h-10 w-10 rounded-md bg-rose-500/[0.15] text-rose-500 flex items-center justify-center flex-shrink-0">
                <FileText className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium truncate">{decodeURIComponent(fileUrl!.split("/").pop() || "Document.pdf")}</span>
                <span className="block text-xs text-muted-foreground">PDF · open in new tab</span>
              </span>
            </a>
          )}

          {hasText && (
            <div className={cn(
              "text-[15px] leading-relaxed text-foreground/90 break-words",
              deleted && "italic text-muted-foreground text-sm",
              !deleted && isEmojiOnly(content) && "text-4xl leading-tight"
            )}>
              {deleted ? content : renderMessage(content, { meId: currentMember.id, onMention: openProfile })}
              {isUpdated && (
                <span className="text-[11px] ml-1.5 text-muted-foreground" title={message.editedAt ? format(new Date(message.editedAt), "d MMM yyyy, h:mm a") : undefined}>
                  (edited)
                </span>
              )}
            </div>
          )}

          {!fileUrl && isEditing && (
            <div className="pt-1">
              <textarea
                ref={editRef}
                value={draft}
                disabled={saving}
                rows={Math.min(8, draft.split("\n").length)}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") { e.preventDefault(); setIsEditing(false); }
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(); }
                }}
                className="w-full resize-none rounded-lg bg-elevated border border-border px-3 py-2 text-[15px] focus:border-brand outline-none"
                aria-label="Edit message"
              />
              <p className="text-[11px] mt-1 text-muted-foreground">
                escape to <button type="button" className="text-brand hover:underline" onClick={() => setIsEditing(false)}>cancel</button> · enter to <button type="button" className="text-brand hover:underline" onClick={saveEdit}>save</button>
              </p>
            </div>
          )}

          {!deleted && message.poll && (
            <PollCard poll={message.poll} profileId={currentMember.profileId} canManage={isOwner || isAdmin || isModerator} />
          )}
          {!deleted && !!message.attachments?.length && <MessageAttachments items={message.attachments} />}
          {!deleted && message.linkPreview && <LinkPreview preview={message.linkPreview} />}

          {reactionGroups.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {reactionGroups.map((g) => (
                <button
                  key={g.emoji}
                  type="button"
                  onClick={() => react(g.emoji)}
                  aria-pressed={g.mine}
                  aria-label={`${g.emoji} ${g.count}, ${g.mine ? "remove your reaction" : "react"}`}
                  className={cn(
                    "h-7 px-2 rounded-full border text-sm flex items-center gap-1 transition",
                    g.mine
                      ? "bg-brand/[0.15] border-brand/50 text-foreground"
                      : "bg-foreground/[0.04] border-border hover:border-foreground/30"
                  )}
                >
                  <span>{g.emoji}</span>
                  <span className="text-xs font-medium tabular-nums">{g.count}</span>
                </button>
              ))}
            </div>
          )}

          {!inThread && isChannel && (message.threadCount ?? 0) > 0 && (
            <button
              type="button"
              onClick={() => openPanel("thread", { threadId: id })}
              className="mt-1.5 -ml-1 flex items-center gap-2 h-8 px-1.5 pr-3 rounded-lg hover:bg-foreground/[0.05] border border-transparent hover:border-border w-fit group/thread transition"
            >
              <MessagesSquare className="h-4 w-4 text-brand" />
              <span className="text-sm font-semibold text-brand">{message.threadCount} {message.threadCount === 1 ? "reply" : "replies"}</span>
              {message.threadLastAt && (
                <span className="text-xs text-muted-foreground group-hover/thread:hidden">
                  Last reply {formatDistanceToNowStrict(new Date(message.threadLastAt), { addSuffix: true })}
                </span>
              )}
              <span className="text-xs text-muted-foreground hidden group-hover/thread:inline">View thread</span>
            </button>
          )}
        </div>
      </div>

      {!deleted && !isEditing && (
        <div
          className={cn(
            "items-center absolute top-1 right-3 p-0.5 rounded-lg border border-border bg-elevated shadow-lg z-10",
            menuOpen ? "flex" : "hidden group-hover:flex group-focus-within:flex"
          )}
          role="toolbar"
          aria-label="Message actions"
        >
          {QUICK_REACTIONS.map((e) => (
            <button
              key={e}
              type="button"
              aria-label={`React ${e}`}
              onClick={() => react(e)}
              className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-foreground/[0.08] text-[15px] transition hover:scale-110"
            >
              {e}
            </button>
          ))}
          <div className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-foreground/[0.08]">
            <EmojiPicker onChange={react} label="Add reaction" side="left" iconClassName="h-4 w-4" />
          </div>
          <div className="w-px h-5 bg-border mx-0.5" />
          {isChannel && !inThread ? (
            <ToolButton label="Reply in thread" onClick={() => openPanel("thread", { threadId: id })}><MessagesSquare className="h-4 w-4" /></ToolButton>
          ) : (
            <ToolButton label="Reply" onClick={() => setReplyTo(inThread ? `thread:${message.threadId}` : chatId, message)}><Reply className="h-4 w-4" /></ToolButton>
          )}
          <DropdownMenu onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="Save for later" className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground">
                <Bookmark className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => save()}><Bookmark className="h-4 w-4 mr-2" /> Save for later</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">Remind me</DropdownMenuLabel>
              {quickTimes().map((t) => (
                <DropdownMenuItem key={t.label} onClick={() => save(t.date)}><Bell className="h-4 w-4 mr-2 opacity-60" /> {t.label}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="More actions" className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {isChannel && !inThread && (
                <DropdownMenuItem onClick={() => setReplyTo(chatId, message)}><Reply className="h-4 w-4 mr-2" /> Quote reply</DropdownMenuItem>
              )}
              {canEditMessage && (
                <DropdownMenuItem onClick={() => setIsEditing(true)}><Edit className="h-4 w-4 mr-2" /> Edit message</DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => patch({ pinned: !pinned })}>
                {pinned ? <><PinOff className="h-4 w-4 mr-2" /> Unpin</> : <><Pin className="h-4 w-4 mr-2" /> Pin to channel</>}
              </DropdownMenuItem>
              {isChannel && (
                <DropdownMenuItem onClick={() => patch({ decision: !message.isDecision })}>
                  <Gavel className="h-4 w-4 mr-2" /> {message.isDecision ? "Unmark decision" : "Mark as decision"}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {!fileUrl && (
                <DropdownMenuItem onClick={() => { navigator.clipboard?.writeText(plainText(content)); toast({ title: "Text copied" }); }}>
                  <Copy className="h-4 w-4 mr-2" /> Copy text
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={copyLink}><Link2 className="h-4 w-4 mr-2" /> Copy link</DropdownMenuItem>
              {canDeleteMessage && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => onOpen("deleteMessage", { apiUrl: `${socketUrl}/${id}`, query: socketQuery })}
                  >
                    <Trash className="h-4 w-4 mr-2" /> Delete message
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  )
}

export const ChatItem = memo(ChatItemInner);
