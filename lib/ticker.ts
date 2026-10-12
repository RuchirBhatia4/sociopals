import { db } from "@/lib/db";
import { getIO } from "@/lib/io";
import { channelMessageInclude } from "@/lib/message-include";
import { notifySystem } from "@/lib/notify";
import { postChannelMessage, postDirectMessage } from "@/lib/post-message";
import { plainText } from "@/lib/format-text";
import { chatRoom, profileRoom, updateKey } from "@/lib/socket-keys";

const TICK_MS = 15_000;
const g = globalThis as unknown as { __sociopalsTicker?: ReturnType<typeof setInterval> };

/** Deliver "send later" messages that are due. */
async function sendScheduled() {
  const due = await db.scheduledMessage.findMany({
    where: { sentAt: null, error: null, sendAt: { lte: new Date() } },
    take: 50,
    orderBy: { sendAt: "asc" },
  });
  for (const s of due) {
    // claim it first so two ticks never send twice
    const claimed = await db.scheduledMessage.updateMany({ where: { id: s.id, sentAt: null }, data: { sentAt: new Date() } });
    if (!claimed.count) continue;
    try {
      const member = await db.member.findUnique({
        where: { id: s.memberId },
        include: { profile: true, customRoles: { include: { role: true } } },
      });
      if (!member || member.profileId !== s.profileId) throw new Error("You are no longer in that server.");
      if (s.channelId) {
        const channel = await db.channel.findUnique({ where: { id: s.channelId }, include: { server: true } });
        if (!channel || channel.serverId !== member.serverId) throw new Error("That channel was deleted.");
        await postChannelMessage({ member, channel, content: s.content, replyToId: s.replyToId });
      } else if (s.conversationId) {
        const conversation = await db.conversation.findUnique({
          where: { id: s.conversationId },
          include: { memberOne: true, memberTwo: true },
        });
        if (!conversation || (conversation.memberOneId !== member.id && conversation.memberTwoId !== member.id)) {
          throw new Error("That conversation is gone.");
        }
        await postDirectMessage({ member, conversation, content: s.content, replyToId: s.replyToId });
      }
    } catch (e: any) {
      await db.scheduledMessage.update({ where: { id: s.id }, data: { error: String(e?.message || e).slice(0, 190) } });
    }
    getIO()?.to(profileRoom(s.profileId)).emit("scheduled:changed");
  }
}

/** "Remind me" on saved messages. */
async function sendReminders() {
  const due = await db.savedItem.findMany({
    where: { remindAt: { lte: new Date() }, remindedAt: null, doneAt: null },
    include: {
      message: { select: { content: true, channel: { select: { id: true, name: true, serverId: true } } } },
      directMessage: { select: { content: true, member: { select: { id: true } } } },
    },
    take: 50,
  });
  for (const s of due) {
    const claimed = await db.savedItem.updateMany({ where: { id: s.id, remindedAt: null }, data: { remindedAt: new Date() } });
    if (!claimed.count) continue;
    const text = plainText(s.message?.content ?? s.directMessage?.content ?? "").slice(0, 200) || "A saved message";
    const url = s.message?.channel
      ? `/servers/${s.message.channel.serverId}/channels/${s.message.channel.id}?m=${s.messageId}`
      : `/saved`;
    await notifySystem({
      profileId: s.profileId,
      type: "REMINDER",
      serverId: s.serverId,
      chatId: s.chatId,
      chatName: s.message?.channel ? `#${s.message.channel.name}` : "Direct message",
      messageId: s.messageId,
      directMessageId: s.directMessageId,
      preview: text,
      title: "Reminder",
      url,
    });
  }
}

/** Close polls whose time is up and tell the person who asked. */
async function closePolls() {
  const due = await db.poll.findMany({
    where: { closedAt: null, closesAt: { lte: new Date() } },
    include: { message: { include: { channel: true, member: true } }, votes: true },
    take: 50,
  });
  for (const p of due) {
    const claimed = await db.poll.updateMany({ where: { id: p.id, closedAt: null }, data: { closedAt: new Date() } });
    if (!claimed.count) continue;
    const message = await db.message.findUnique({ where: { id: p.messageId }, include: channelMessageInclude });
    if (message) getIO()?.to(chatRoom(message.channelId)).emit(updateKey(message.channelId), message);
    const options = (p.options as string[]) ?? [];
    const counts = options.map((_, i) => p.votes.filter((v) => v.option === i).length);
    const top = Math.max(0, ...counts);
    const winners = options.filter((_, i) => counts[i] === top && top > 0);
    await notifySystem({
      profileId: p.message.member.profileId,
      type: "POLL",
      serverId: p.message.channel.serverId,
      chatId: p.message.channelId,
      chatName: `#${p.message.channel.name}`,
      messageId: p.messageId,
      preview: winners.length ? `"${p.question}" → ${winners.join(" / ")} (${top} vote${top === 1 ? "" : "s"})` : `"${p.question}" closed with no votes`,
      title: "Your poll closed",
      url: `/servers/${p.message.channel.serverId}/channels/${p.message.channelId}?m=${p.messageId}`,
    });
  }
}

let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    await sendScheduled();
    await sendReminders();
    await closePolls();
  } catch (e) {
    console.log("[TICKER]", e);
  } finally {
    running = false;
  }
}

/** Start once per server process (safe to call again after hot reloads). */
export function startTicker() {
  if (g.__sociopalsTicker) return;
  g.__sociopalsTicker = setInterval(tick, TICK_MS);
  setTimeout(tick, 2000);
}
