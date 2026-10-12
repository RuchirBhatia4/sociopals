import { NextApiRequest } from "next";

import { NextApiResponseServerIo } from "@/types";
import { currentProfilePages } from "@/lib/current-profile-pages";
import { db } from "@/lib/db";
import { channelMessageInclude, messageInclude } from "@/lib/message-include";
import { chatAccess } from "@/lib/access";
import { getIO } from "@/lib/io";
import { chatRoom, threadKey, updateKey } from "@/lib/socket-keys";

/**
 * Toggle one emoji reaction: POST { emoji } with either
 *   ?messageId=…&channelId=…&serverId=…        (channel message)
 *   ?directMessageId=…&conversationId=…        (direct message)
 * Everyone viewing the chat gets the updated message over the socket.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponseServerIo) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const profile = await currentProfilePages(req);
    if (!profile) return res.status(401).json({ error: "Unauthorized" });

    const emoji = typeof req.body?.emoji === "string" ? req.body.emoji.trim() : "";
    if (!emoji || emoji.length > 16 || /\s/.test(emoji)) {
      return res.status(400).json({ error: "Invalid emoji" });
    }

    const { messageId, channelId, serverId, directMessageId, conversationId } = req.query as Record<string, string | undefined>;

    if (messageId && channelId && serverId) {
      const access = await chatAccess(profile.id, channelId);
      if (!access || access.kind !== "channel" || access.serverId !== serverId) return res.status(404).json({ error: "Channel not found" });
      const message = await db.message.findFirst({ where: { id: messageId, channelId, deleted: false }, select: { id: true } });
      if (!message) return res.status(404).json({ error: "Message not found" });

      const existing = await db.reaction.findFirst({ where: { profileId: profile.id, messageId, emoji } });
      if (existing) await db.reaction.delete({ where: { id: existing.id } });
      else await db.reaction.create({ data: { profileId: profile.id, messageId, emoji } });

      const updated = await db.message.findUnique({ where: { id: messageId }, include: channelMessageInclude });
      if (updated?.threadId) getIO()?.to(chatRoom(channelId)).emit(threadKey(updated.threadId), updated);
      else getIO()?.to(chatRoom(channelId)).emit(updateKey(channelId), updated);
      return res.status(200).json(updated);
    }

    if (directMessageId && conversationId) {
      const message = await db.directMessage.findFirst({
        where: {
          id: directMessageId,
          conversationId,
          deleted: false,
          conversation: {
            OR: [{ memberOne: { profileId: profile.id } }, { memberTwo: { profileId: profile.id } }],
          },
        },
        select: { id: true },
      });
      if (!message) return res.status(404).json({ error: "Message not found" });

      const existing = await db.reaction.findFirst({ where: { profileId: profile.id, directMessageId, emoji } });
      if (existing) await db.reaction.delete({ where: { id: existing.id } });
      else await db.reaction.create({ data: { profileId: profile.id, directMessageId, emoji } });

      const updated = await db.directMessage.findUnique({ where: { id: directMessageId }, include: messageInclude });
      getIO()?.to(chatRoom(conversationId)).emit(updateKey(conversationId), updated);
      return res.status(200).json(updated);
    }

    return res.status(400).json({ error: "Message id and chat missing" });
  } catch (error) {
    console.log("[REACTIONS]", error);
    return res.status(500).json({ error: "Internal Error" });
  }
}
