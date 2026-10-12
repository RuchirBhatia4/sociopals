import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";

/** Mark a channel or conversation as read up to now: POST { chatId }. */
export async function POST(req: Request) {
  try {
    const profile = await currentProfile();
    if (!profile) return new NextResponse("Unauthorized", { status: 401 });

    const { chatId } = await req.json();
    if (!chatId || typeof chatId !== "string") {
      return new NextResponse("chatId missing", { status: 400 });
    }

    // Only chats this person can see: a channel in one of their servers, or
    // a conversation they are part of.
    const [channel, conversation] = await Promise.all([
      db.channel.findFirst({
        where: { id: chatId, server: { members: { some: { profileId: profile.id } } } },
        select: { id: true },
      }),
      db.conversation.findFirst({
        where: {
          id: chatId,
          OR: [{ memberOne: { profileId: profile.id } }, { memberTwo: { profileId: profile.id } }],
        },
        select: { id: true },
      }),
    ]);
    if (!channel && !conversation) return new NextResponse("Not found", { status: 404 });

    const now = new Date();
    const where = { profileId_chatId: { profileId: profile.id, chatId } };
    try {
      await db.readState.upsert({
        where,
        create: { profileId: profile.id, chatId, lastReadAt: now },
        update: { lastReadAt: now },
      });
    } catch (e: any) {
      // Two tabs (or two events) marking the same chat at once: the other one
      // created the row first, so just move it forward.
      if (e?.code !== "P2002") throw e;
      await db.readState.update({ where, data: { lastReadAt: now } });
    }

    // Reading a chat also clears its inbox items (they stay in the inbox, just read).
    const cleared = await db.notification.updateMany({ where: { profileId: profile.id, chatId, readAt: null }, data: { readAt: now } });

    return NextResponse.json({ ok: true, lastReadAt: now, cleared: cleared.count });
  } catch (error) {
    console.log("[READ_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
