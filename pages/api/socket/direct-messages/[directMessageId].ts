import { NextApiRequest } from "next";

import { NextApiResponseServerIo } from "@/types";
import { currentProfilePages } from "@/lib/current-profile-pages";
import { db } from "@/lib/db";
import { getIO } from "@/lib/io";
import { messageInclude } from "@/lib/message-include";
import { chatRoom, updateKey } from "@/lib/socket-keys";

/**
 * One direct message, ?conversationId=. Only the two people in the
 * conversation can reach it, and only the author can edit or delete.
 *   PATCH { content } | PATCH { pinned: boolean } | DELETE
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
    const { directMessageId, conversationId } = req.query as Record<string, string>;
    if (!profile) return res.status(401).json({ error: "Unauthorized" });
    if (!conversationId) return res.status(400).json({ error: "Conversation ID missing" });

    const conversation = await db.conversation.findFirst({
      where: {
        id: conversationId,
        OR: [{ memberOne: { profileId: profile.id } }, { memberTwo: { profileId: profile.id } }],
      },
      include: { memberOne: true, memberTwo: true },
    });
    if (!conversation) return res.status(404).json({ error: "Conversation not found" });

    const member = conversation.memberOne.profileId === profile.id ? conversation.memberOne : conversation.memberTwo;
    const existing = await db.directMessage.findFirst({ where: { id: directMessageId, conversationId } });
    if (!existing || existing.deleted) return res.status(404).json({ error: "Message not found" });

    const isOwner = existing.memberId === member.id;
    const body = req.body ?? {};
    let data: Record<string, unknown> | null = null;

    if (req.method === "DELETE") {
      if (!isOwner) return res.status(403).json({ error: "You can only delete your own messages" });
      data = { fileUrl: null, content: "This message has been deleted.", deleted: true, pinnedAt: null, linkPreview: null };
      await db.attachment.deleteMany({ where: { directMessageId } });
    } else if (typeof body.content === "string") {
      if (!isOwner) return res.status(403).json({ error: "You can only edit your own messages" });
      if (!body.content.trim()) return res.status(400).json({ error: "Message is empty" });
      data = { content: body.content.slice(0, 4000), editedAt: new Date() };
    } else if (typeof body.pinned === "boolean") {
      data = { pinnedAt: body.pinned ? new Date() : null };
    }
    if (!data) return res.status(400).json({ error: "Nothing to change" });

    const directMessage = await db.directMessage.update({ where: { id: directMessageId }, data, include: messageInclude });
    getIO()?.to(chatRoom(conversation.id)).emit(updateKey(conversation.id), directMessage);
    return res.status(200).json(directMessage);
  } catch (error) {
    console.log("[DIRECT_MESSAGE_ID]", error);
    return res.status(500).json({ error: "Internal Error" });
  }
}
