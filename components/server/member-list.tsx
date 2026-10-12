"use client";

import { Member, Profile, Server } from "@prisma/client";

import { usePresenceStore } from "@/hooks/use-presence";

import { ServerMember } from "./server-member";

/** Members split into online and offline, live. */
export const MemberList = ({
  members, server, myMemberId, dmUnreads, roleColors,
}: {
  members: (Member & { profile: Profile })[];
  server: Server;
  myMemberId?: string;
  dmUnreads: Record<string, number>;
  roleColors: Record<string, string>;
}) => {
  const byProfile = usePresenceStore((s) => s.byProfile);
  const online = members.filter((m) => byProfile[m.profileId]?.online);
  const offline = members.filter((m) => !byProfile[m.profileId]?.online);
  const section = (label: string, list: typeof members) =>
    list.length > 0 && (
      <div className="mt-3">
        <p className="px-2 pb-1 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">{label} · {list.length}</p>
        <div className="space-y-px">
          {list.map((m) => (
            <ServerMember key={m.id} member={m} server={server} myMemberId={myMemberId} initialUnread={dmUnreads[m.id] ?? 0} roleColor={roleColors[m.id]} />
          ))}
        </div>
      </div>
    );
  return (
    <>
      {section("Online", online)}
      {section("Offline", offline)}
    </>
  );
};
