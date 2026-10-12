import { NextApiRequest } from "next";

import { NextApiResponseServerIo } from "@/types";
import { currentProfilePages } from "@/lib/current-profile-pages";
import { db } from "@/lib/db";
import { chatAccess } from "@/lib/access";
import { PostError, postChannelMessage } from "@/lib/post-message";

/** Send a channel message: POST ?channelId=&serverId= { content, fileUrl?, attachments?, replyToId?, threadId?, poll? } */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponseServerIo,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const profile = await currentProfilePages(req);
    if (!profile) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { serverId, channelId } = req.query;
    if (!serverId || !channelId) {
      return res.status(400).json({ error: "Server and channel are required" });
    }

    const access = await chatAccess(profile.id, channelId as string);
    if (!access || access.kind !== "channel" || access.serverId !== serverId) {
      return res.status(404).json({ error: "Channel not found" });
    }

    const member = await db.member.findUnique({
      where: { id: access.member.id },
      include: { profile: true, customRoles: { include: { role: true } } },
    });
    if (!member) {
      return res.status(404).json({ error: "Member not found" });
    }

    const { content, fileUrl, attachments, replyToId, threadId, poll } = req.body ?? {};
    const message = await postChannelMessage({
      member,
      channel: access.channel,
      content: content ?? "",
      fileUrl,
      attachments,
      replyToId,
      threadId,
      poll: poll
        ? { question: poll.question, options: poll.options ?? [], multi: !!poll.multi, closesAt: poll.closesAt ? new Date(poll.closesAt) : null }
        : null,
    });

    return res.status(200).json(message);
  } catch (error) {
    if (error instanceof PostError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.log("[MESSAGES_POST]", error);
    return res.status(500).json({ error: "Internal Error" });
  }
}
