"use client";

import { Member, MemberRole, Profile, Server } from "@prisma/client";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/user-avatar";
import { useSocket } from "@/components/providers/socket-provider";
import { usePresence } from "@/hooks/use-presence";
import { directKey } from "@/lib/socket-keys";

interface ServerMemberProps {
  member: Member & { profile: Profile };
  server: Server;
  myMemberId?: string;
  initialUnread?: number;
  roleColor?: string | null;
}

const roleIconMap = {
  [MemberRole.GUEST]: null,
  [MemberRole.MODERATOR]: <ShieldCheck className="h-3.5 w-3.5 text-sky-500 flex-shrink-0" aria-label="Moderator" />,
  [MemberRole.ADMIN]: <ShieldAlert className="h-3.5 w-3.5 text-rose-500 flex-shrink-0" aria-label="Admin" />
}

/** A green dot on someone's avatar while they're online. */
export const PresenceDot = ({ online, className }: { online?: boolean; className?: string }) => (
  <span
    className={cn(
      "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-sidebar",
      online ? "bg-emerald-500" : "bg-muted-foreground/40",
      className
    )}
    aria-label={online ? "Online" : "Offline"}
  />
);

export const ServerMember = ({
  member,
  server,
  myMemberId,
  initialUnread = 0,
  roleColor,
}: ServerMemberProps) => {
  const params = useParams();
  const router = useRouter();
  const { socket } = useSocket();
  const presence = usePresence(member.profileId);

  const isActive = params?.memberId === member.id;
  const [unread, setUnread] = useState(initialUnread);
  useEffect(() => setUnread(initialUnread), [initialUnread]);
  useEffect(() => { if (isActive) setUnread(0); }, [isActive]);

  // Live: they sent you a direct message while you were elsewhere.
  useEffect(() => {
    if (!socket || !myMemberId) return;
    const key = directKey(myMemberId);
    const onDirect = (d: { fromMemberId: string }) => {
      if (d.fromMemberId === member.id && !isActive) setUnread((n) => Math.min(n + 1, 99));
    };
    socket.on(key, onDirect);
    return () => { socket.off(key, onDirect); };
  }, [socket, myMemberId, member.id, isActive]);

  const icon = roleIconMap[member.role];
  const status = presence ? { emoji: presence.statusEmoji, text: presence.statusText } : null;

  return (
    <button
      onClick={() => router.push(`/servers/${server.id}/conversations/${member.id}`)}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group px-2 h-10 rounded-md flex items-center gap-x-2.5 w-full text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground transition",
        isActive && "bg-foreground/[0.09] text-foreground",
        unread > 0 && "text-foreground",
        !presence?.online && !isActive && !unread && "opacity-60 hover:opacity-100"
      )}
    >
      <span className="relative flex-shrink-0">
        <UserAvatar src={member.profile.imageUrl} className="h-7 w-7 md:h-7 md:w-7" />
        <PresenceDot online={presence?.online} />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="flex items-center gap-1.5">
          <span className={cn("text-sm truncate", unread > 0 && "font-semibold")} style={roleColor ? { color: roleColor } : undefined}>
            {member.profile.name}
          </span>
          {icon}
        </span>
        {status && (status.emoji || status.text) && (
          <span className="block text-[11px] text-muted-foreground truncate leading-tight">{status.emoji} {status.text}</span>
        )}
      </span>
      {unread > 0 && (
        <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-brand text-[11px] font-bold leading-[18px] text-brand-foreground text-center" aria-label={`${unread} unread messages`}>
          {unread}
        </span>
      )}
    </button>
  )
}
