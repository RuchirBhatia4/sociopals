"use client";

import { Channel, ChannelType, Server } from "@prisma/client";
import { FolderGit2, Hash, Lock, Megaphone, Mic, Settings, Users, Video } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { ActionTooltip } from "@/components/action-tooltip";
import { useModal } from "@/hooks/use-modal-store";
import { useSocket } from "@/components/providers/socket-provider";
import { activityKey, type Activity } from "@/lib/socket-keys";

interface ServerChannelProps {
  channel: Channel;
  server: Server;
  canManage?: boolean;
  memberId?: string;
  initialUnread?: number;
  initialMentions?: number;
  muted?: boolean;
  /** group DMs show stacked faces instead of an icon */
  faces?: string[];
  dragProps?: React.HTMLAttributes<HTMLElement> & { draggable?: boolean };
}

const iconFor = (c: Channel) =>
  c.isGroupDm ? Users : c.isProject ? FolderGit2 : c.type === ChannelType.AUDIO ? Mic : c.type === ChannelType.VIDEO ? Video : c.readOnly ? Megaphone : c.isPrivate ? Lock : Hash;

export const ServerChannel = ({
  channel,
  server,
  canManage,
  memberId,
  initialUnread = 0,
  initialMentions = 0,
  muted = false,
  dragProps,
}: ServerChannelProps) => {
  const { onOpen } = useModal();
  const { socket } = useSocket();
  const params = useParams();
  const router = useRouter();

  const isActive = params?.channelId === channel.id;
  const [unread, setUnread] = useState(initialUnread);
  const [mentions, setMentions] = useState(initialMentions);

  useEffect(() => { setUnread(initialUnread); setMentions(initialMentions); }, [initialUnread, initialMentions]);
  useEffect(() => { if (isActive) { setUnread(0); setMentions(0); } }, [isActive]);

  // Live: someone else posted here while you are elsewhere.
  useEffect(() => {
    if (!socket || channel.type !== ChannelType.TEXT) return;
    const key = activityKey(server.id);
    const onActivity = (a: Activity) => {
      if (a.chatId !== channel.id || a.memberId === memberId || isActive) return;
      setUnread((n) => Math.min(n + 1, 99));
      if (memberId && a.mentions?.includes(memberId)) setMentions((n) => Math.min(n + 1, 99));
    };
    socket.on(key, onActivity);
    return () => { socket.off(key, onActivity); };
  }, [socket, server.id, channel.id, channel.type, memberId, isActive]);

  const Icon = iconFor(channel);
  const hasUnread = unread > 0 && !isActive && !muted;

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => router.push(`/servers/${server.id}/channels/${channel.id}`)}
      onKeyDown={(e) => e.key === "Enter" && router.push(`/servers/${server.id}/channels/${channel.id}`)}
      aria-current={isActive ? "page" : undefined}
      {...dragProps}
      className={cn(
        "group relative px-2 h-8 rounded-md flex items-center gap-x-2 w-full text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground transition cursor-pointer select-none",
        isActive && "bg-foreground/[0.09] text-foreground",
        hasUnread && "text-foreground",
        muted && !isActive && "opacity-50",
        dragProps?.className
      )}
    >
      {hasUnread && <span className="absolute -left-2 h-2 w-1 rounded-r-full bg-foreground" aria-hidden />}
      <Icon className="flex-shrink-0 w-4 h-4 opacity-70" />
      <p className={cn("truncate text-sm text-left flex-1", (hasUnread || isActive) && "font-semibold")}>
        {channel.name}
        {hasUnread && <span className="sr-only"> ({unread} unread)</span>}
      </p>
      {mentions > 0 && !isActive && (
        <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-mention text-[11px] font-bold leading-[18px] text-black text-center" aria-label={`${mentions} mentions`}>
          {mentions}
        </span>
      )}
      {canManage && !channel.isGroupDm && (
        <ActionTooltip label="Channel settings">
          <button
            type="button"
            aria-label={`Settings for ${channel.name}`}
            onClick={(e) => { e.stopPropagation(); onOpen("channelSettings", { channelId: channel.id, serverId: server.id, channelName: channel.name }); }}
            className="hidden group-hover:flex group-focus-within:flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </ActionTooltip>
      )}
    </div>
  )
}
