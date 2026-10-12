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
 * POST { pollId, option }          vote (toggle; single-choice polls move your vote)
 * POST { pollId, action: "close" } close now (the asker or a moderator)
 * POST { pollId, action: "decide", option } close and record the winner as a decision
 */
export default async function handler(req: NextApiRequest, res: NextApiResponseServerIo) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const profile = await currentProfilePages(req);
  if (!profile) return res.status(401).json({ error: "Unauthorized" });

  const { pollId, option, action } = req.body ?? {};
  const poll = await db.poll.findUnique({ where: { id: String(pollId) }, include: { message: true } });
  if (!poll) return res.status(404).json({ error: "Poll not found" });
  const access = await chatAccess(profile.id, poll.message.channelId);
  if (!access || access.kind !== "channel") return res.status(404).json({ error: "Poll not found" });

  const options = (poll.options as string[]) ?? [];

  if (action === "close" || action === "decide") {
    const member = await db.member.findUnique({ where: { id: access.member.id }, include: { customRoles: { include: { role: true } } } });
    if (!member || (poll.message.memberId !== member.id && !can(member, "MANAGE_MESSAGES"))) {
      return res.status(403).json({ error: "Only the person who asked can close this poll" });
    }
    await db.poll.update({ where: { id: poll.id }, data: { closedAt: poll.closedAt ?? new Date() } });
    if (action === "decide" && Number.isInteger(option) && options[option]) {
      await db.message.update({
        where: { id: poll.messageId },
        data: { isDecision: true, content: `${poll.question}\n**Decision:** ${options[option]}` },
      });
    }
  } else {
    if (poll.closedAt || (poll.closesAt && poll.closesAt.getTime() < Date.now())) {
      return res.status(400).json({ error: "This poll is closed" });
    }
    const i = Number(option);
    if (!Number.isInteger(i) || i < 0 || i >= options.length) return res.status(400).json({ error: "Unknown option" });
    const mine = await db.pollVote.findFirst({ where: { pollId: poll.id, profileId: profile.id, option: i } });
    if (mine) {
      await db.pollVote.delete({ where: { id: mine.id } });
    } else {
      if (!poll.multi) await db.pollVote.deleteMany({ where: { pollId: poll.id, profileId: profile.id } });
      await db.pollVote.create({ data: { pollId: poll.id, profileId: profile.id, option: i } });
    }
  }

  const message = await db.message.findUnique({ where: { id: poll.messageId }, include: channelMessageInclude });
  const io = getIO();
  if (message?.threadId) io?.to(chatRoom(message.channelId)).emit(threadKey(message.threadId), message);
  else if (message) io?.to(chatRoom(message.channelId)).emit(updateKey(message.channelId), message);
  return res.status(200).json(message);
}
