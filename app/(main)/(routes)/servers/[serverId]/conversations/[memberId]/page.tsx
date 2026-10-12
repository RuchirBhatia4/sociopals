import { redirectToSignIn } from "@clerk/nextjs";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { getOrCreateConversation } from "@/lib/conversation";
import { currentProfile } from "@/lib/current-profile";
import { lastReadAt } from "@/lib/unread";
import { ChatHeader } from "@/components/chat/chat-header";
import { ChatMessages } from "@/components/chat/chat-messages";
import { ChatInput } from "@/components/chat/chat-input";
import { MediaRoom } from "@/components/media-room";
import { ChatLayout } from "@/components/chat/chat-layout";

interface MemberIdPageProps {
  params: {
    memberId: string;
    serverId: string;
  },
  searchParams: {
    video?: boolean;
  }
}

const MemberIdPage = async ({
  params,
  searchParams,
}: MemberIdPageProps) => {
  const profile = await currentProfile();

  if (!profile) {
    return redirectToSignIn();
  }

  const currentMember = await db.member.findFirst({
    where: {
      serverId: params.serverId,
      profileId: profile.id,
    },
    include: {
      profile: true,
    },
  });

  if (!currentMember) {
    return redirect("/");
  }

  const conversation = await getOrCreateConversation(currentMember.id, params.memberId);

  if (!conversation) {
    return redirect(`/servers/${params.serverId}`);
  }

  const { memberOne, memberTwo } = conversation;

  const otherMember = memberOne.profileId === profile.id ? memberTwo : memberOne;
  const lastRead = await lastReadAt(profile.id, conversation.id);
  const mentionable = [memberOne, memberTwo].map((m) => ({ id: m.id, name: m.profile.name, imageUrl: m.profile.imageUrl }));

  const statusLive = !otherMember.profile.statusExpiresAt || otherMember.profile.statusExpiresAt.getTime() > Date.now();
  const { profile: _p, ...plainMember } = currentMember;

  return (
    <ChatLayout
      chatId={conversation.id}
      chatName={otherMember.profile.name}
      isChannel={false}
      member={plainMember}
      socketQuery={{ conversationId: conversation.id }}
      mentionable={mentionable}
    >
    <div className="bg-background flex flex-col h-full min-h-0">
      <ChatHeader
        imageUrl={otherMember.profile.imageUrl}
        name={otherMember.profile.name}
        serverId={params.serverId}
        type="conversation"
        chatId={conversation.id}
        isText={!searchParams.video}
        status={statusLive ? { emoji: otherMember.profile.statusEmoji, text: otherMember.profile.statusText } : null}
      />
      {searchParams.video && (
        <MediaRoom
          chatId={conversation.id}
          video={true}
          audio={true}
        />
      )}
      {!searchParams.video && (
        <>
          <ChatMessages
            member={currentMember}
            name={otherMember.profile.name}
            chatId={conversation.id}
            type="conversation"
            apiUrl="/api/direct-messages"
            paramKey="conversationId"
            paramValue={conversation.id}
            socketUrl="/api/socket/direct-messages"
            socketQuery={{
              conversationId: conversation.id,
            }}
            lastReadAt={lastRead?.toISOString() ?? null}
          />
          <ChatInput
            name={otherMember.profile.name}
            type="conversation"
            apiUrl="/api/socket/direct-messages"
            query={{
              conversationId: conversation.id,
            }}
            chatId={conversation.id}
            me={{ id: currentMember.id, name: profile.name }}
            members={mentionable}
            pageDrop
          />
        </>
      )}
    </div>
    </ChatLayout>
  );
}

export default MemberIdPage;