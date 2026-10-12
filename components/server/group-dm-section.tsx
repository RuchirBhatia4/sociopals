"use client";

import { Channel, Server } from "@prisma/client";
import { Plus } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ActionTooltip } from "@/components/action-tooltip";
import { UserAvatar } from "@/components/user-avatar";
import { useModal } from "@/hooks/use-modal-store";
import { useSocket } from "@/components/providers/socket-provider";
import { activityKey, type Activity } from "@/lib/socket-keys";
import { cn } from "@/lib/utils";

type Group = { channel: Channel; faces: string[] };

/** Group conversations (3 to 10 people) in this server. */
export const GroupDmSection = ({
  groups, server, memberId, unreads, muted,
}: { groups: Group[]; server: Server; memberId: string; unreads: Record<string, { unread: number; mentions: number }>; muted: string[] }) => {
  const { onOpen } = useModal();
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between px-2 pb-1">
        <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Group messages</p>
        <ActionTooltip label="New group message">
          <button type="button" aria-label="New group message" onClick={() => onOpen("createGroupDm", { server, serverId: server.id })} className="text-muted-foreground hover:text-foreground">
            <Plus className="h-4 w-4" />
          </button>
        </ActionTooltip>
      </div>
      {groups.length === 0 ? (
        <button
          type="button"
          onClick={() => onOpen("createGroupDm", { server, serverId: server.id })}
          className="w-full text-left px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          Start a private chat with 2 to 9 others
        </button>
      ) : (
        <div className="space-y-px">
          {groups.map((g) => (
            <GroupRow key={g.channel.id} group={g} serverId={server.id} memberId={memberId} initialUnread={unreads[g.channel.id]?.unread ?? 0} muted={muted.includes(g.channel.id)} />
          ))}
        </div>
      )}
    </div>
  );
};

const GroupRow = ({ group, serverId, memberId, initialUnread, muted }: { group: Group; serverId: string; memberId: string; initialUnread: number; muted: boolean }) => {
  const params = useParams();
  const router = useRouter();
  const { socket } = useSocket();
  const isActive = params?.channelId === group.channel.id;
  const [unread, setUnread] = useState(initialUnread);
  useEffect(() => setUnread(initialUnread), [initialUnread]);
  useEffect(() => { if (isActive) setUnread(0); }, [isActive]);
  useEffect(() => {
    if (!socket) return;
    const key = activityKey(serverId);
    const on = (a: Activity) => { if (a.chatId === group.channel.id && a.memberId !== memberId && !isActive) setUnread((n) => Math.min(n + 1, 99)); };
    socket.on(key, on);
    return () => { socket.off(key, on); };
  }, [socket, serverId, group.channel.id, memberId, isActive]);
  const hasUnread = unread > 0 && !isActive && !muted;

  return (
    <button
      type="button"
      onClick={() => router.push(`/servers/${serverId}/channels/${group.channel.id}`)}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "w-full h-10 px-2 rounded-md flex items-center gap-2.5 text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground transition",
        isActive && "bg-foreground/[0.09] text-foreground",
        hasUnread && "text-foreground",
        muted && !isActive && "opacity-50"
      )}
    >
      <span className="relative h-7 w-7 flex-shrink-0">
        {group.faces.slice(0, 2).map((f, i) => (
          <span key={i} className={cn("absolute ring-2 ring-sidebar rounded-full", i === 0 ? "top-0 left-0" : "bottom-0 right-0")}>
            <UserAvatar src={f} className="h-[18px] w-[18px] md:h-[18px] md:w-[18px]" />
          </span>
        ))}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className={cn("block text-sm truncate", hasUnread && "font-semibold")}>{group.channel.name}</span>
        <span className="block text-[11px] text-muted-foreground leading-tight">{group.faces.length + 1} members</span>
      </span>
      {hasUnread && (
        <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-brand text-[11px] font-bold leading-[18px] text-brand-foreground text-center">{unread}</span>
      )}
    </button>
  );
};
