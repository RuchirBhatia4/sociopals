import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { chatAccess } from "@/lib/access";

const MAX_AHEAD_MS = 120 * 86_400_000; // four months

/** Your scheduled messages. GET ?chatId= (optional) */
export async function GET(req: Request) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const chatId = new URL(req.url).searchParams.get("chatId");
  const items = await db.scheduledMessage.findMany({
    where: {
      profileId: profile.id,
      AND: [
        { OR: [{ sentAt: null }, { error: { not: null } }] },
        ...(chatId ? [{ OR: [{ channelId: chatId }, { conversationId: chatId }] }] : []),
      ],
    },
    include: { channel: { select: { name: true, isGroupDm: true } } },
    orderBy: { sendAt: "asc" },
    take: 100,
  });
  return NextResponse.json(items);
}

/** Schedule: POST { chatId, content, sendAt, replyToId? } */
export async function POST(req: Request) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const { chatId, content, sendAt, replyToId } = await req.json();
  const when = new Date(sendAt);
  if (!chatId || typeof content !== "string" || !content.trim()) return new NextResponse("Nothing to send", { status: 400 });
  if (isNaN(when.getTime()) || when.getTime() < Date.now() + 30_000) return new NextResponse("Pick a time at least a minute from now", { status: 400 });
  if (when.getTime() > Date.now() + MAX_AHEAD_MS) return new NextResponse("That's too far ahead (max four months)", { status: 400 });

  const access = await chatAccess(profile.id, chatId);
  if (!access) return new NextResponse("Not found", { status: 404 });

  const item = await db.scheduledMessage.create({
    data: {
      profileId: profile.id,
      memberId: access.member.id,
      channelId: access.kind === "channel" ? chatId : null,
      conversationId: access.kind === "conversation" ? chatId : null,
      content: content.slice(0, 4000),
      sendAt: when,
      replyToId: replyToId || null,
    },
  });
  return NextResponse.json(item);
}

/** Reschedule or edit: PATCH { id, sendAt?, content? } */
export async function PATCH(req: Request) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const { id, sendAt, content } = await req.json();
  const item = await db.scheduledMessage.findFirst({ where: { id, profileId: profile.id, sentAt: null } });
  if (!item) return new NextResponse("Not found", { status: 404 });
  const data: { sendAt?: Date; content?: string; error?: null } = {};
  if (sendAt) {
    const when = new Date(sendAt);
    if (isNaN(when.getTime()) || when.getTime() < Date.now() + 30_000) return new NextResponse("Pick a later time", { status: 400 });
    data.sendAt = when;
  }
  if (typeof content === "string" && content.trim()) data.content = content.slice(0, 4000);
  return NextResponse.json(await db.scheduledMessage.update({ where: { id }, data }));
}

/** Cancel: DELETE ?id= */
export async function DELETE(req: Request) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  await db.scheduledMessage.deleteMany({ where: { id: id ?? "", profileId: profile.id } });
  return NextResponse.json({ ok: true });
}
