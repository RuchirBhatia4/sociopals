import { redirectToSignIn } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { ChannelType } from "@prisma/client";

import { currentProfile } from "@/lib/current-profile";
import { ChatHeader } from "@/components/chat/chat-header";
import { ChatInput } from "@/components/chat/chat-input";
import { ChatMessages } from "@/components/chat/chat-messages";
import { ChatLayout } from "@/components/chat/chat-layout";
import { MediaRoom } from "@/components/media-room";
import { ProjectGate } from "@/components/project/project-gate";
import { PendingTasks } from "@/components/project/pending-tasks";
import { ProjectViews } from "@/components/project/project-views";
import { db } from "@/lib/db";
import { chatAccess } from "@/lib/access";
import { can, postBlockReason } from "@/lib/permissions";
import { lastReadAt } from "@/lib/unread";

interface ChannelIdPageProps {
  params: {
    serverId: string;
    channelId: string;
  }
}

const ChannelIdPage = async ({
  params
}: ChannelIdPageProps) => {
  const profile = await currentProfile();

  if (!profile) {
    return redirectToSignIn();
  }

  // Private channels and group DMs are only for the people in them.
  const access = await chatAccess(profile.id, params.channelId);
  if (!access || access.kind !== "channel" || access.serverId !== params.serverId) {
    return redirect(`/servers/${params.serverId}`);
  }
  const { channel } = access;

  const member = await db.member.findUnique({
    where: { id: access.member.id },
    include: { customRoles: { include: { role: true } } },
  });
  if (!member) return redirect("/");

  const restricted = channel.isPrivate || channel.isGroupDm;
  const [lastRead, members] = await Promise.all([
    lastReadAt(profile.id, channel.id),
    db.member.findMany({
      where: restricted
        ? { serverId: params.serverId, channelMemberships: { some: { channelId: channel.id } } }
        : { serverId: params.serverId },
      include: { profile: { select: { name: true, imageUrl: true } } },
    }),
  ]);
  const mentionable = members.map((m) => ({ id: m.id, name: m.profile.name, imageUrl: m.profile.imageUrl }));
  const blockedReason = postBlockReason(member, channel);
  const { customRoles, ...plainMember } = member;
  const socketQuery = { channelId: channel.id, serverId: channel.serverId };

  return ( 
    <ChatLayout
      chatId={channel.id}
      chatName={channel.name}
      isChannel
      member={plainMember}
      socketQuery={socketQuery}
      mentionable={mentionable}
      blockedReason={blockedReason}
    >
      <div className="bg-background flex flex-col h-full min-h-0">
        <ChatHeader
          name={channel.name}
          serverId={channel.serverId}
          type="channel"
          chatId={channel.id}
          topic={channel.topic}
          isPrivate={channel.isPrivate}
          isGroupDm={channel.isGroupDm}
          readOnly={channel.readOnly}
          slowModeSeconds={channel.slowModeSeconds}
          isText={channel.type === ChannelType.TEXT}
          canManage={can(member, "MANAGE_CHANNELS")}
          people={channel.isGroupDm ? members.filter((m) => m.id !== member.id).map((m) => m.profile) : undefined}
          repoUrl={channel.isProject ? (channel.repoOwner ? `https://github.com/${channel.repoOwner}/${channel.repoName}` : null) : undefined}
        />
        {channel.type === ChannelType.TEXT && (
          <ProjectWrap isProject={channel.isProject} channelId={channel.id}>
            <ChatMessages
              member={plainMember}
              name={channel.name}
              chatId={channel.id}
              type="channel"
              apiUrl="/api/messages"
              socketUrl="/api/socket/messages"
              socketQuery={socketQuery}
              paramKey="channelId"
              paramValue={channel.id}
              lastReadAt={lastRead?.toISOString() ?? null}
              topic={channel.topic}
              isGroupDm={channel.isGroupDm}
            />
            {channel.isProject && <PendingTasks channelId={channel.id} />}
            <ChatInput
              name={channel.name}
              type="channel"
              apiUrl="/api/socket/messages"
              query={socketQuery}
              chatId={channel.id}
              me={{ id: member.id, name: profile.name }}
              members={mentionable}
              blockedReason={blockedReason}
              slowModeSeconds={can(member, "MANAGE_MESSAGES") ? 0 : channel.slowModeSeconds}
              pageDrop
              projectAi={channel.isProject}
            />
          </ProjectWrap>
        )}
        {channel.type === ChannelType.AUDIO && (
          <MediaRoom
            chatId={channel.id}
            video={false}
            audio={true}
            trackCall
          />
        )}
        {channel.type === ChannelType.VIDEO && (
          <MediaRoom
            chatId={channel.id}
            video={true}
            audio={true}
            trackCall
          />
        )}
      </div>
    </ChatLayout>
   );
}
 
const ProjectWrap = ({ isProject, channelId, children }: { isProject: boolean; channelId: string; children: React.ReactNode }) =>
  isProject ? <ProjectGate channelId={channelId}><ProjectViews channelId={channelId}>{children}</ProjectViews></ProjectGate> : <>{children}</>;

export default ChannelIdPage;
