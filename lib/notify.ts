import { Channel, Member, NotificationType, Profile, Server } from "@prisma/client";

import { db } from "@/lib/db";
import { getIO } from "@/lib/io";
import { plainText } from "@/lib/format-text";
import { channelAudience } from "@/lib/access";
import { mentionedIds, mentionsEveryone, NOTIFY_EVENT, profileRoom } from "@/lib/socket-keys";

type Author = Member & { profile: Profile };

export type NotifyPayload = {
  /** null for a plain "new message" ping (channels set to All), which is not kept in the inbox */
  notification: { id: string; type: NotificationType; chatId: string; preview: string; actorName: string | null; chatName: string | null } | null;
  /** show a desktop notification? false in focus mode / quiet hours / when turned off */
  push: boolean;
  title: string;
  body: string;
  url: string;
};

const PRIORITY: NotificationType[] = ["MENTION", "REPLY", "THREAD", "KEYWORD", "DIRECT"];

/* ---------- calm-hours helpers ---------- */
function minutesNow(timeZone?: string | null) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "numeric", hourCycle: "h23", timeZone: timeZone || undefined }).formatToParts(new Date());
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
    return h * 60 + m;
  } catch {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }
}

/** True when desktop alerts for this person should stay silent right now. */
export function isQuiet(p: Pick<Profile, "focusUntil" | "focusAllow" | "quietStart" | "quietEnd" | "timeZone" | "desktopNotify">, actorProfileId?: string) {
  if (!p.desktopNotify) return true;
  if (p.focusUntil && p.focusUntil.getTime() > Date.now()) {
    const allow = Array.isArray(p.focusAllow) ? (p.focusAllow as string[]) : [];
    if (!actorProfileId || !allow.includes(actorProfileId)) return true;
  }
  if (p.quietStart != null && p.quietEnd != null && p.quietStart !== p.quietEnd) {
    const now = minutesNow(p.timeZone);
    const inside = p.quietStart < p.quietEnd ? now >= p.quietStart && now < p.quietEnd : now >= p.quietStart || now < p.quietEnd;
    if (inside) return true;
  }
  return false;
}

const keywordHit = (keywords: unknown, text: string) => {
  if (!Array.isArray(keywords) || !keywords.length) return false;
  const t = text.toLowerCase();
  return (keywords as string[]).some((k) => {
    const w = String(k).trim().toLowerCase();
    return w.length > 1 && new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}\\p{N}]|$)`, "u").test(t);
  });
};

async function deliver(profileId: string, payload: NotifyPayload) {
  getIO()?.to(profileRoom(profileId)).emit(NOTIFY_EVENT, payload);
}

/**
 * After a channel message is saved: inbox items for mentions, replies, thread
 * replies and keyword hits; desktop pings for channels set to "All".
 */
export async function notifyChannelMessage(args: {
  message: { id: string; content: string; memberId: string; replyToId: string | null; threadId: string | null; webhookName?: string | null };
  channel: Channel;
  server: Server;
  author: Author;
  everyoneAllowed: boolean;
}) {
  const { message, channel, server, author, everyoneAllowed } = args;
  const audience = (await channelAudience(channel)).filter((a) => a.profileId !== author.profileId);
  if (!audience.length) return;

  const profileIds = audience.map((a) => a.profileId);
  const [profiles, prefs] = await Promise.all([
    db.profile.findMany({ where: { id: { in: profileIds } } }),
    db.chatPreference.findMany({ where: { chatId: channel.id, profileId: { in: profileIds } } }),
  ]);
  const prefOf = new Map(prefs.map((p) => [p.profileId, p]));
  const byId = new Map(profiles.map((p) => [p.id, p]));

  const mentioned = new Set(mentionedIds(message.content));
  const everyone = everyoneAllowed && mentionsEveryone(message.content);

  const [replyTo, threadPeople] = await Promise.all([
    message.replyToId ? db.message.findUnique({ where: { id: message.replyToId }, select: { member: { select: { profileId: true } } } }) : null,
    message.threadId
      ? db.message.findMany({
          where: { OR: [{ id: message.threadId }, { threadId: message.threadId }] },
          select: { member: { select: { profileId: true } } },
          distinct: ["memberId"],
        })
      : [],
  ]);
  const threadSet = new Set(threadPeople.map((t) => t.member.profileId));

  const actorName = message.webhookName || author.profile.name;
  const preview = plainText(message.content).slice(0, 280) || "Sent an attachment";
  const url = `/servers/${server.id}/channels/${channel.id}?m=${message.id}${message.threadId ? `&thread=${message.threadId}` : ""}`;

  for (const a of audience) {
    const p = byId.get(a.profileId);
    if (!p) continue;
    const pref = prefOf.get(a.profileId);
    if (pref?.muted || pref?.level === "NONE") continue;

    const reasons: NotificationType[] = [];
    if (mentioned.has(a.memberId) || everyone) reasons.push("MENTION");
    if (replyTo?.member.profileId === a.profileId) reasons.push("REPLY");
    if (threadSet.has(a.profileId)) reasons.push("THREAD");
    if (keywordHit(p.keywords, message.content)) reasons.push("KEYWORD");

    const quiet = isQuiet(p, author.profileId);
    if (!reasons.length) {
      // No inbox item; a desktop ping only if they asked for every message here.
      if (pref?.level === "ALL" && !quiet) {
        await deliver(p.id, { notification: null, push: true, title: `${actorName} in #${channel.name}`, body: preview, url });
      }
      continue;
    }
    const type = PRIORITY.find((t) => reasons.includes(t))!;
    const n = await db.notification.create({
      data: {
        type,
        profileId: p.id,
        serverId: server.id,
        chatId: channel.id,
        chatName: `#${channel.name}`,
        messageId: message.id,
        actorName,
        actorImage: author.profile.imageUrl,
        preview,
      },
    });
    const verb = { MENTION: "mentioned you", REPLY: "replied to you", THREAD: "replied in a thread", KEYWORD: "used a word you follow", DIRECT: "messaged you", REMINDER: "", POLL: "", TASK: "assigned you a task" }[type];
    await deliver(p.id, {
      notification: { id: n.id, type, chatId: channel.id, preview, actorName, chatName: n.chatName },
      push: !quiet,
      title: `${actorName} ${verb} in #${channel.name}`,
      body: preview,
      url,
    });
  }
}

/** After a direct message is saved: one inbox item for the other person. */
export async function notifyDirectMessage(args: {
  message: { id: string; content: string };
  conversationId: string;
  serverId: string;
  author: Author;
  recipient: Member;
}) {
  const { message, conversationId, serverId, author, recipient } = args;
  const [p, pref] = await Promise.all([
    db.profile.findUnique({ where: { id: recipient.profileId } }),
    db.chatPreference.findUnique({ where: { profileId_chatId: { profileId: recipient.profileId, chatId: conversationId } } }),
  ]);
  if (!p || pref?.muted || pref?.level === "NONE") return;
  const preview = plainText(message.content).slice(0, 280) || "Sent an attachment";
  const n = await db.notification.create({
    data: {
      type: "DIRECT",
      profileId: p.id,
      serverId,
      chatId: conversationId,
      chatName: author.profile.name,
      directMessageId: message.id,
      actorName: author.profile.name,
      actorImage: author.profile.imageUrl,
      preview,
    },
  });
  await deliver(p.id, {
    notification: { id: n.id, type: "DIRECT", chatId: conversationId, preview, actorName: author.profile.name, chatName: author.profile.name },
    push: !isQuiet(p, author.profileId),
    title: author.profile.name,
    body: preview,
    url: `/servers/${serverId}/conversations/${author.id}?m=${message.id}`,
  });
}

/** A reminder or poll result for one person. */
export async function notifySystem(args: {
  profileId: string;
  type: "REMINDER" | "POLL" | "TASK";
  serverId?: string | null;
  actorName?: string | null;
  actorImage?: string | null;
  chatId: string;
  chatName?: string | null;
  messageId?: string | null;
  directMessageId?: string | null;
  preview: string;
  title: string;
  url: string;
}) {
  const p = await db.profile.findUnique({ where: { id: args.profileId } });
  if (!p) return;
  const n = await db.notification.create({
    data: {
      type: args.type,
      profileId: p.id,
      serverId: args.serverId ?? null,
      chatId: args.chatId,
      chatName: args.chatName ?? null,
      messageId: args.messageId ?? null,
      directMessageId: args.directMessageId ?? null,
      actorName: args.actorName ?? null,
      actorImage: args.actorImage ?? null,
      preview: args.preview,
    },
  });
  await deliver(p.id, {
    notification: { id: n.id, type: args.type, chatId: args.chatId, preview: args.preview, actorName: args.actorName ?? null, chatName: args.chatName ?? null },
    push: !isQuiet(p),
    title: args.title,
    body: args.preview,
    url: args.url,
  });
}
