"use client";

import { format, isToday } from "date-fns";
import { Bot, Gavel, Hash, Paperclip, Pin } from "lucide-react";

import { UserAvatar } from "@/components/user-avatar";
import { renderMessage } from "@/lib/format";
import { cn } from "@/lib/utils";

/** A compact, clickable message for lists: pins, search, saved, inbox. */
export const MessageSnippet = ({
  name, imageUrl, content, createdAt, chatName, onClick, pinned, decision, files, bot, highlight, meId, children, className,
}: {
  name: string;
  imageUrl?: string | null;
  content: string;
  createdAt: string | Date;
  chatName?: string;
  onClick?: () => void;
  pinned?: boolean;
  decision?: boolean;
  files?: number;
  bot?: boolean;
  highlight?: string[];
  meId?: string;
  children?: React.ReactNode;
  className?: string;
}) => {
  const at = new Date(createdAt);
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => onClick && (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onClick())}
      className={cn(
        "group/snip w-full text-left rounded-xl border border-border bg-background/60 p-3 hover:border-foreground/20 hover:bg-background transition",
        onClick && "cursor-pointer",
        className
      )}
    >
      <div className="flex items-center gap-2 mb-1.5 text-xs text-muted-foreground">
        {bot && !imageUrl ? (
          <span className="h-5 w-5 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center"><Bot className="h-3 w-3" /></span>
        ) : (
          <UserAvatar src={imageUrl ?? undefined} className="h-5 w-5 md:h-5 md:w-5" />
        )}
        <span className="font-semibold text-foreground text-[13px]">{name}</span>
        {chatName && <span className="flex items-center gap-0.5"><Hash className="h-3 w-3" />{chatName}</span>}
        <span className="ml-auto tabular-nums whitespace-nowrap">{isToday(at) ? format(at, "HH:mm") : format(at, "d MMM, HH:mm")}</span>
      </div>
      <div className="text-sm text-foreground/90 break-words line-clamp-4">
        {highlight?.length ? <Highlighted text={content} terms={highlight} /> : renderMessage(content, { meId })}
      </div>
      {(pinned || decision || !!files) && (
        <div className="flex gap-3 mt-1.5 text-[11px] text-muted-foreground">
          {decision && <span className="flex items-center gap-1 text-brand"><Gavel className="h-3 w-3" /> Decision</span>}
          {pinned && <span className="flex items-center gap-1 text-amber-400"><Pin className="h-3 w-3" /> Pinned</span>}
          {!!files && <span className="flex items-center gap-1"><Paperclip className="h-3 w-3" /> {files} {files === 1 ? "file" : "files"}</span>}
        </div>
      )}
      {children}
    </div>
  );
};

const Highlighted = ({ text, terms }: { text: string; terms: string[] }) => {
  const plain = text.replace(/@\[([^\]]+)\]\([0-9a-f-]{36}\)/g, "@$1");
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return (
    <>
      {plain.split(re).map((part, i) =>
        i % 2 ? <mark key={i} className="bg-mention/30 text-foreground rounded-sm px-0.5">{part}</mark> : <span key={i}>{part}</span>
      )}
    </>
  );
};
