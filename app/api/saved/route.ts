import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { chatAccess } from "@/lib/access";

const include = {
  message: {
    include: {
      member: { include: { profile: true } },
      channel: { select: { id: true, name: true, serverId: true, server: { select: { name: true } } } },
      attachments: true,
    },
  },
  directMessage: {
    include: {
      member: { include: { profile: true } },
      conversation: { include: { memberOne: { include: { profile: true } }, memberTwo: { include: { profile: true } } } },
      attachments: true,
    },
  },
} as const;

/** Saved for later. GET ?status=open|done */
export async function GET(req: Request) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const done = new URL(req.url).searchParams.get("status") === "done";
  const items = await db.savedItem.findMany({
    where: { profileId: profile.id, doneAt: done ? { not: null } : null },
    include,
    orderBy: done ? { doneAt: "desc" } : [{ remindAt: "asc" }, { createdAt: "desc" }],
    take: 200,
  });
  return NextResponse.json(items);
}

/** Save: POST { chatId, messageId? | directMessageId?, remindAt? } (saving twice just updates the reminder) */
export async function POST(req: Request) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const { chatId, messageId, directMessageId, remindAt } = await req.json();
  const access = chatId ? await chatAccess(profile.id, chatId) : null;
  if (!access) return new NextResponse("Not found", { status: 404 });

  if (access.kind === "channel" && !(messageId && (await db.message.findFirst({ where: { id: messageId, channelId: chatId } })))) {
    return new NextResponse("Message not found", { status: 404 });
  }
  if (access.kind === "conversation" && !(directMessageId && (await db.directMessage.findFirst({ where: { id: directMessageId, conversationId: chatId } })))) {
    return new NextResponse("Message not found", { status: 404 });
  }
  const when = remindAt ? new Date(remindAt) : null;
  const existing = await db.savedItem.findFirst({
    where: { profileId: profile.id, ...(messageId ? { messageId } : { directMessageId }) },
  });
  const data = { remindAt: when && !isNaN(when.getTime()) ? when : null, remindedAt: null, doneAt: null };
  const item = existing
    ? await db.savedItem.update({ where: { id: existing.id }, data })
    : await db.savedItem.create({
        data: {
          ...data,
          profileId: profile.id,
          chatId,
          serverId: access.serverId,
          messageId: access.kind === "channel" ? messageId : null,
          directMessageId: access.kind === "conversation" ? directMessageId : null,
        },
      });
  return NextResponse.json(item);
}

/** PATCH { id, done?: boolean, remindAt?: string|null } */
export async function PATCH(req: Request) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const { id, done, remindAt } = await req.json();
  const item = await db.savedItem.findFirst({ where: { id, profileId: profile.id } });
  if (!item) return new NextResponse("Not found", { status: 404 });
  const data: Record<string, unknown> = {};
  if (typeof done === "boolean") data.doneAt = done ? new Date() : null;
  if (remindAt !== undefined) {
    const when = remindAt ? new Date(remindAt) : null;
    data.remindAt = when && !isNaN(when.getTime()) ? when : null;
    data.remindedAt = null;
  }
  return NextResponse.json(await db.savedItem.update({ where: { id }, data }));
}

/** Unsave: DELETE ?id=  or  ?messageId= / ?directMessageId= */
export async function DELETE(req: Request) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const p = new URL(req.url).searchParams;
  const where = p.get("id")
    ? { id: p.get("id")!, profileId: profile.id }
    : p.get("messageId")
      ? { messageId: p.get("messageId")!, profileId: profile.id }
      : { directMessageId: p.get("directMessageId") ?? "", profileId: profile.id };
  await db.savedItem.deleteMany({ where });
  return NextResponse.json({ ok: true });
}
