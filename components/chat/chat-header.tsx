import { FolderGit2, Hash, Lock, Megaphone, Timer, Users } from "lucide-react";

import { MobileToggle } from "@/components/mobile-toggle";
import { UserAvatar } from "@/components/user-avatar";
import { SocketIndicator } from "@/components/socket-indicator";

import { ChatVideoButton } from "./chat-video-button";
import { ChatHeaderActions } from "./chat-header-actions";

interface ChatHeaderProps {
  serverId: string;
  name: string;
  type: "channel" | "conversation";
  imageUrl?: string;
  chatId?: string;
  topic?: string | null;
  isPrivate?: boolean;
  isGroupDm?: boolean;
  readOnly?: boolean;
  slowModeSeconds?: number;
  /** text chats get pins, search, catch-up and notification settings */
  isText?: boolean;
  canManage?: boolean;
  /** for group DMs: who's in it */
  people?: { name: string; imageUrl: string }[];
  status?: { emoji: string | null; text: string | null } | null;
  /** project channels: the linked repo (null = project without a repo yet) */
  repoUrl?: string | null;
}

export const ChatHeader = ({
  serverId, name, type, imageUrl, chatId, topic, isPrivate, isGroupDm, readOnly, slowModeSeconds = 0, isText = true, canManage, people, status, repoUrl,
}: ChatHeaderProps) => {
  const Icon = repoUrl !== undefined ? FolderGit2 : isGroupDm ? Users : readOnly ? Megaphone : isPrivate ? Lock : Hash;
  return (
    <header className="px-3 md:px-4 flex items-center gap-2 h-12 flex-shrink-0 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <MobileToggle serverId={serverId} />
      {type === "channel" && (isGroupDm && people?.length ? (
        <div className="flex -space-x-2 mr-0.5">
          {people.slice(0, 3).map((p) => (
            <span key={p.name} className="ring-2 ring-background rounded-full"><UserAvatar src={p.imageUrl} className="h-6 w-6 md:h-6 md:w-6" /></span>
          ))}
        </div>
      ) : (
        <Icon className="w-5 h-5 text-muted-foreground flex-shrink-0" aria-hidden />
      ))}
      {type === "conversation" && (
        <UserAvatar
          src={imageUrl}
          className="h-7 w-7 md:h-7 md:w-7"
        />
      )}
      <div className="min-w-0 flex-1 overflow-hidden flex items-center gap-2">
        <h1 className="font-semibold text-[15px] truncate flex-shrink-0 max-w-[40vw]">
          {name}
        </h1>
        {status && (status.emoji || status.text) && (
          <span className="text-xs text-muted-foreground truncate hidden sm:inline">{status.emoji} {status.text}</span>
        )}
        {readOnly && <span className="hidden sm:inline text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/[0.15] text-amber-300">Announcements</span>}
        {slowModeSeconds > 0 && (
          <span className="hidden sm:flex items-center gap-1 text-[11px] text-muted-foreground" title="Slow mode">
            <Timer className="h-3 w-3" /> {slowModeSeconds >= 60 ? `${Math.round(slowModeSeconds / 60)}m` : `${slowModeSeconds}s`}
          </span>
        )}
        {topic && (
          <>
            <span className="hidden md:block h-4 w-px bg-border flex-shrink-0" />
            <p className="hidden md:block text-sm text-muted-foreground truncate" title={topic}>{topic}</p>
          </>
        )}
      </div>
      <div className="flex items-center gap-0.5 flex-shrink-0">
        {type === "conversation" && (
          <ChatVideoButton />
        )}
        {isText && chatId && (
          <ChatHeaderActions chatId={chatId} serverId={serverId} isChannel={type === "channel"} isGroupDm={!!isGroupDm} canManage={!!canManage} channelName={name} repoUrl={repoUrl} />
        )}
        <span className="ml-1"><SocketIndicator /></span>
      </div>
    </header>
  )
}
