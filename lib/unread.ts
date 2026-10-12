import { db } from "@/lib/db";
import { mentionToken } from "@/lib/mention";

export type UnreadCounts = Record<string, { unread: number; mentions: number }>;

/**
 * Unread and mention counts for a set of channels, from this profile's read
 * states. Your own messages never count as unread. A channel you have never
 * opened counts everything in it as unread (capped at 99 for display).
 */
export async function channelUnreads(profileId: string, memberId: string, channelIds: string[]): Promise<UnreadCounts> {
  if (!channelIds.length) return {};
  const states = await db.readState.findMany({ where: { profileId, chatId: { in: channelIds } } });
  const lastRead = new Map(states.map((s) => [s.chatId, s.lastReadAt]));

  const entries = await Promise.all(
    channelIds.map(async (channelId) => {
      const since = lastRead.get(channelId);
      const where = {
        channelId,
        deleted: false,
        memberId: { not: memberId },
        ...(since ? { createdAt: { gt: since } } : {}),
      };
      const [unread, mentions] = await Promise.all([
        db.message.count({ where }),
        db.message.count({ where: { ...where, content: { contains: mentionToken(memberId) } } }),
      ]);
      return [channelId, { unread: Math.min(unread, 99), mentions: Math.min(mentions, 99) }] as const;
    })
  );
  return Object.fromEntries(entries);
}

/** Unread direct-message counts per other member, for this member's conversations. */
export async function directUnreads(profileId: string, memberId: string): Promise<Record<string, number>> {
  const conversations = await db.conversation.findMany({
    where: { OR: [{ memberOneId: memberId }, { memberTwoId: memberId }] },
    select: { id: true, memberOneId: true, memberTwoId: true },
  });
  if (!conversations.length) return {};
  const states = await db.readState.findMany({
    where: { profileId, chatId: { in: conversations.map((c) => c.id) } },
  });
  const lastRead = new Map(states.map((s) => [s.chatId, s.lastReadAt]));

  const entries = await Promise.all(
    conversations.map(async (c) => {
      const since = lastRead.get(c.id);
      const n = await db.directMessage.count({
        where: {
          conversationId: c.id,
          deleted: false,
          memberId: { not: memberId },
          ...(since ? { createdAt: { gt: since } } : {}),
        },
      });
      const other = c.memberOneId === memberId ? c.memberTwoId : c.memberOneId;
      return [other, Math.min(n, 99)] as const;
    })
  );
  return Object.fromEntries(entries.filter(([, n]) => n > 0));
}

/** When this profile last read a chat (null = never opened). */
export async function lastReadAt(profileId: string, chatId: string): Promise<Date | null> {
  const s = await db.readState.findUnique({ where: { profileId_chatId: { profileId, chatId } } });
  return s?.lastReadAt ?? null;
}
