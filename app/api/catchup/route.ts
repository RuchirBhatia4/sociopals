import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { chatAccess } from "@/lib/access";
import { mentionToken } from "@/lib/mention";
import { plainText } from "@/lib/format-text";

const DAY = 86_400_000;

/**
 * "Since you were away" for one channel: what matters first, the rest after.
 * GET ?chatId=&since=ISO (defaults to when you last read it, or the last 24 h)
 * No AI involved: this is computed from the messages themselves.
 */
export async function GET(req: Request) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const p = new URL(req.url).searchParams;
  const chatId = p.get("chatId") || "";
  const access = await chatAccess(profile.id, chatId);
  if (!access || access.kind !== "channel") return new NextResponse("Not found", { status: 404 });

  const read = await db.readState.findUnique({ where: { profileId_chatId: { profileId: profile.id, chatId } } });
  const sinceParam = p.get("since") ? new Date(p.get("since")!) : null;
  const since = sinceParam && !isNaN(sinceParam.getTime()) ? sinceParam : read?.lastReadAt ?? new Date(Date.now() - DAY);

  const where = { channelId: chatId, deleted: false, system: false, createdAt: { gt: since } };
  const include = { member: { include: { profile: { select: { name: true, imageUrl: true } } } }, reactions: { select: { emoji: true } } } as const;

  const [total, mentions, replies, decisions, pinned, all] = await Promise.all([
    db.message.count({ where: { ...where, memberId: { not: access.member.id } } }),
    db.message.findMany({ where: { ...where, content: { contains: mentionToken(access.member.id) } }, include, orderBy: { createdAt: "asc" }, take: 20 }),
    db.message.findMany({ where: { ...where, replyTo: { memberId: access.member.id }, memberId: { not: access.member.id } }, include, orderBy: { createdAt: "asc" }, take: 20 }),
    db.message.findMany({ where: { channelId: chatId, deleted: false, isDecision: true, updatedAt: { gt: since } }, include, orderBy: { createdAt: "asc" }, take: 20 }),
    db.message.findMany({ where: { channelId: chatId, deleted: false, pinnedAt: { gt: since } }, include, orderBy: { pinnedAt: "asc" }, take: 20 }),
    db.message.findMany({ where, include, orderBy: { createdAt: "asc" }, take: 500 }),
  ]);

  const popular = all
    .filter((m) => m.reactions.length >= 2)
    .sort((a, b) => b.reactions.length - a.reactions.length)
    .slice(0, 5);
  const people = Array.from(new Map(all.filter((m) => m.memberId !== access.member.id).map((m) => [m.memberId, m.member.profile])).values()).slice(0, 12);

  const view = (m: (typeof all)[number]) => ({
    id: m.id,
    preview: plainText(m.content).slice(0, 240),
    author: m.member.profile.name,
    authorImage: m.member.profile.imageUrl,
    createdAt: m.createdAt,
    reactions: m.reactions.length,
    threadId: m.threadId,
  });

  return NextResponse.json({
    since,
    total,
    people,
    mentions: mentions.map(view),
    replies: replies.map(view),
    decisions: decisions.map(view),
    pinned: pinned.map(view),
    popular: popular.map(view),
    aiAvailable: !!process.env.ANTHROPIC_API_KEY,
  });
}
