import { Channel, Conversation, Member, Server } from "@prisma/client";

import { db } from "@/lib/db";

export type ChatAccess =
  | { kind: "channel"; channel: Channel & { server: Server }; member: Member; serverId: string }
  | { kind: "conversation"; conversation: Conversation; member: Member; other: Member; serverId: string };

/**
 * Can this profile see this chat (a channel id or a conversation id)?
 * Channels: you must be in the server, and in the channel's member list if it
 * is private or a group DM. Conversations: you must be one of the two people.
 */
export async function chatAccess(profileId: string, chatId: string): Promise<ChatAccess | null> {
  const channel = await db.channel.findUnique({ where: { id: chatId }, include: { server: true } });
  if (channel) {
    const member = await db.member.findFirst({ where: { serverId: channel.serverId, profileId } });
    if (!member) return null;
    if (channel.isPrivate || channel.isGroupDm) {
      const inside = await db.channelMember.findUnique({
        where: { channelId_memberId: { channelId: channel.id, memberId: member.id } },
      });
      if (!inside) return null;
    }
    return { kind: "channel", channel, member, serverId: channel.serverId };
  }

  const conversation = await db.conversation.findUnique({
    where: { id: chatId },
    include: { memberOne: true, memberTwo: true },
  });
  if (!conversation) return null;
  const { memberOne, memberTwo } = conversation;
  if (memberOne.profileId === profileId) return { kind: "conversation", conversation, member: memberOne, other: memberTwo, serverId: memberOne.serverId };
  if (memberTwo.profileId === profileId) return { kind: "conversation", conversation, member: memberTwo, other: memberOne, serverId: memberTwo.serverId };
  return null;
}

/** Profile ids that can see a channel (everyone in the server, or the private list). */
export async function channelAudience(channel: Channel): Promise<{ profileId: string; memberId: string }[]> {
  if (channel.isPrivate || channel.isGroupDm) {
    const rows = await db.channelMember.findMany({ where: { channelId: channel.id }, include: { member: true } });
    return rows.map((r) => ({ profileId: r.member.profileId, memberId: r.memberId }));
  }
  const members = await db.member.findMany({ where: { serverId: channel.serverId }, select: { id: true, profileId: true } });
  return members.map((m) => ({ profileId: m.profileId, memberId: m.id }));
}
