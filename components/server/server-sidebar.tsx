import { ChannelType, MemberRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { Hash, Lock, Mic, ShieldAlert, ShieldCheck, Users, Video } from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { channelUnreads, directUnreads } from "@/lib/unread";

import { ServerHeader } from "./server-header";
import { ServerSearch } from "./server-search";
import { ServerLive } from "./server-live";
import { ChannelTree, type ChannelGroup } from "./channel-tree";
import { GroupDmSection } from "./group-dm-section";
import { MemberList } from "./member-list";

interface ServerSidebarProps {
  serverId: string;
}

const iconMap = {
  [ChannelType.TEXT]: <Hash className="mr-2 h-4 w-4" />,
  [ChannelType.AUDIO]: <Mic className="mr-2 h-4 w-4" />,
  [ChannelType.VIDEO]: <Video className="mr-2 h-4 w-4" />
};

const roleIconMap = {
  [MemberRole.GUEST]: null,
  [MemberRole.MODERATOR]: <ShieldCheck className="h-4 w-4 mr-2 text-sky-500" />,
  [MemberRole.ADMIN]: <ShieldAlert className="h-4 w-4 mr-2 text-rose-500" />
}

export const ServerSidebar = async ({
  serverId
}: ServerSidebarProps) => {
  const profile = await currentProfile();

  if (!profile) {
    return redirect("/");
  }

  const server = await db.server.findUnique({
    where: {
      id: serverId,
    },
    include: {
      channels: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        include: { channelMembers: { select: { memberId: true } } },
      },
      categories: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
      members: {
        include: {
          profile: true,
          customRoles: { include: { role: true } },
        },
        orderBy: {
          role: "asc",
        }
      }
    }
  });

  if (!server) {
    return redirect("/");
  }

  const me = server.members.find((member) => member.profileId === profile.id);
  if (!me) return redirect("/");
  const role = me.role;
  const canManage = can(me, "MANAGE_CHANNELS");

  // Private channels and group DMs only for the people in them.
  const visible = server.channels.filter((c) => !(c.isPrivate || c.isGroupDm) || c.channelMembers.some((m) => m.memberId === me.id));
  const channels = visible.filter((c) => !c.isGroupDm).map(({ channelMembers, ...c }) => c);
  const groupDms = visible.filter((c) => c.isGroupDm);
  const members = server.members.filter((member) => member.profileId !== profile.id);

  const textIds = visible.filter((c) => c.type === ChannelType.TEXT).map((c) => c.id);
  const [unreads, dmUnreads, prefs] = await Promise.all([
    channelUnreads(profile.id, me.id, textIds),
    directUnreads(profile.id, me.id),
    db.chatPreference.findMany({ where: { profileId: profile.id, muted: true }, select: { chatId: true } }),
  ]);
  const muted = prefs.map((p) => p.chatId);

  const groups: ChannelGroup[] = [
    { id: null, name: "", channels: channels.filter((c) => !c.categoryId || !server.categories.some((k) => k.id === c.categoryId)) },
    ...server.categories.map((k) => ({ id: k.id, name: k.name, channels: channels.filter((c) => c.categoryId === k.id) })),
  ];
  // A brand-new server has no categories yet: show the familiar three groups as headings-in-spirit.
  if (!server.categories.length) {
    groups.splice(0, 1, { id: null, name: "", channels: channels });
  }

  const memberById = new Map(server.members.map((m) => [m.id, m]));
  const roleColors = Object.fromEntries(
    server.members
      .map((m) => [m.id, m.customRoles.map((r) => r.role).sort((a, b) => b.position - a.position)[0]?.color] as const)
      .filter(([, c]) => !!c)
  ) as Record<string, string>;

  return (
    <div className="flex flex-col h-full text-primary w-full bg-sidebar border-r border-border">
      <ServerLive serverId={server.id} />
      <ServerHeader
        server={{ ...server, members: server.members.map(({ customRoles, ...m }) => m) } as any}
        role={role}
        canManageServer={role === MemberRole.ADMIN || can(me, "MANAGE_ROLES")}
      />
      <ScrollArea className="flex-1 px-2">
        <div className="mt-3 mb-3">
          <ServerSearch
            data={[
              {
                label: "Channels",
                type: "channel",
                data: channels.map((channel) => ({
                  id: channel.id,
                  name: channel.name,
                  icon: channel.isPrivate ? <Lock className="mr-2 h-4 w-4" /> : iconMap[channel.type],
                }))
              },
              {
                label: "Groups",
                type: "channel",
                data: groupDms.map((c) => ({ id: c.id, name: c.name, icon: <Users className="mr-2 h-4 w-4" /> })),
              },
              {
                label: "Members",
                type: "member",
                data: members.map((member) => ({
                  id: member.id,
                  name: member.profile.name,
                  icon: roleIconMap[member.role],
                }))
              },
            ]}
          />
        </div>
        <ChannelTree
          groups={groups}
          server={server}
          canManage={canManage}
          memberId={me.id}
          unreads={unreads}
          muted={muted}
        />
        <GroupDmSection
          server={server}
          memberId={me.id}
          unreads={unreads}
          muted={muted}
          groups={groupDms.map(({ channelMembers, ...c }) => ({
            channel: c,
            faces: channelMembers.filter((m) => m.memberId !== me.id).map((m) => memberById.get(m.memberId)?.profile.imageUrl).filter(Boolean) as string[],
          }))}
        />
        <div className="mb-3">
          <MemberList
            members={members.map(({ customRoles, ...m }) => m)}
            server={server}
            myMemberId={me.id}
            dmUnreads={dmUnreads}
            roleColors={roleColors}
          />
        </div>
      </ScrollArea>
    </div>
  )
}
