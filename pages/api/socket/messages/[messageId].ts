import { NextApiRequest } from "next";

import { NextApiResponseServerIo } from "@/types";
import { currentProfilePages } from "@/lib/current-profile-pages";
import { db } from "@/lib/db";
import { chatAccess } from "@/lib/access";
import { can } from "@/lib/permissions";
import { getIO } from "@/lib/io";
import { channelMessageInclude } from "@/lib/message-include";
import { chatRoom, threadKey, updateKey } from "@/lib/socket-keys";

/**
 * One channel message, ?serverId=&channelId=:
 *   PATCH { content }           edit your own message
 *   PATCH { pinned: boolean }   pin / unpin (anyone in the channel)
 *   PATCH { decision: boolean } mark / unmark as a decision (anyone in the channel)
 *   DELETE                      yours, or anyone's with Manage messages
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponseServerIo,
) {
  if (req.method !== "DELETE" && req.method !== "PATCH") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const profile = await currentProfilePages(req);
    const { messageId, serverId, channelId } = req.query as Record<string, string>;

    if (!profile) return res.status(401).json({ error: "Unauthorized" });
    if (!serverId || !channelId) return res.status(400).json({ error: "Server and channel are required" });

    const access = await chatAccess(profile.id, channelId);
    if (!access || access.kind !== "channel" || access.serverId !== serverId) {
      return res.status(404).json({ error: "Channel not found" });
    }
    const member = await db.member.findUnique({
      where: { id: access.member.id },
      include: { customRoles: { include: { role: true } } },
    });
    if (!member) return res.status(404).json({ error: "Member not found" });

    const existing = await db.message.findFirst({ where: { id: messageId, channelId } });
    if (!existing || existing.deleted) return res.status(404).json({ error: "Message not found" });

    const isOwner = existing.memberId === member.id && !existing.webhookId;
    const moderator = can(member, "MANAGE_MESSAGES");
    const body = req.body ?? {};

    let data: Record<string, unknown> | null = null;
    if (req.method === "DELETE") {
      if (!isOwner && !moderator) return res.status(403).json({ error: "You can't delete this message" });
      data = { fileUrl: null, content: "This message has been deleted.", deleted: true, pinnedAt: null, isDecision: false, linkPreview: null };
      await db.attachment.deleteMany({ where: { messageId } });
    } else if (typeof body.content === "string") {
      if (!isOwner) return res.status(403).json({ error: "You can only edit your own messages" });
      if (!body.content.trim()) return res.status(400).json({ error: "Message is empty" });
      data = { content: body.content.slice(0, 4000), editedAt: new Date() };
    } else if (typeof body.pinned === "boolean") {
      data = body.pinned ? { pinnedAt: new Date(), pinnedById: member.id } : { pinnedAt: null, pinnedById: null };
    } else if (typeof body.decision === "boolean") {
      data = { isDecision: body.decision };
    }
    if (!data) return res.status(400).json({ error: "Nothing to change" });

    const message = await db.message.update({ where: { id: messageId }, data, include: channelMessageInclude });

    const io = getIO();
    if (message.threadId) {
      io?.to(chatRoom(channelId)).emit(threadKey(message.threadId), message);
      if (req.method === "DELETE") {
        const root = await db.message.update({
          where: { id: message.threadId },
          data: { threadCount: { decrement: 1 } },
          include: channelMessageInclude,
        });
        io?.to(chatRoom(channelId)).emit(updateKey(channelId), root);
      }
    } else {
      io?.to(chatRoom(channelId)).emit(updateKey(channelId), message);
    }

    return res.status(200).json(message);
  } catch (error) {
    console.log("[MESSAGE_ID]", error);
    return res.status(500).json({ error: "Internal Error" });
  }
}
