import { NextApiRequest } from "next";

import { NextApiResponseServerIo } from "@/types";
import { currentProfilePages } from "@/lib/current-profile-pages";
import { db } from "@/lib/db";
import { PostError, postDirectMessage } from "@/lib/post-message";

/** Send a direct message: POST ?conversationId= { content, fileUrl?, attachments?, replyToId? } */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponseServerIo,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const profile = await currentProfilePages(req);
    const { conversationId } = req.query;

    if (!profile) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!conversationId) {
      return res.status(400).json({ error: "Conversation ID missing" });
    }

    const conversation = await db.conversation.findFirst({
      where: {
        id: conversationId as string,
        OR: [{ memberOne: { profileId: profile.id } }, { memberTwo: { profileId: profile.id } }],
      },
      include: { memberOne: true, memberTwo: true },
    });
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const mine = conversation.memberOne.profileId === profile.id ? conversation.memberOne : conversation.memberTwo;
    const member = await db.member.findUnique({ where: { id: mine.id }, include: { profile: true } });
    if (!member) {
      return res.status(404).json({ error: "Member not found" });
    }

    const { content, fileUrl, attachments, replyToId } = req.body ?? {};
    const message = await postDirectMessage({ member, conversation, content: content ?? "", fileUrl, attachments, replyToId });
    return res.status(200).json(message);
  } catch (error) {
    if (error instanceof PostError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.log("[DIRECT_MESSAGES_POST]", error);
    return res.status(500).json({ error: "Internal Error" });
  }
}
