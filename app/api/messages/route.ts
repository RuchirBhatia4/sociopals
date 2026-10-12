import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { chatAccess } from "@/lib/access";
import { channelMessageInclude, MESSAGES_BATCH } from "@/lib/message-include";

/**
 * Channel history, newest first, MESSAGES_BATCH at a time.
 *   ?channelId=…&cursor=…      a page of the channel (thread replies excluded)
 *   ?threadId=…                 every reply in one thread, oldest first
 */
export async function GET(
  req: Request
) {
  try {
    const profile = await currentProfile();
    const { searchParams } = new URL(req.url);

    const cursor = searchParams.get("cursor");
    const channelId = searchParams.get("channelId");
    const threadId = searchParams.get("threadId");

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (threadId) {
      const root = await db.message.findUnique({ where: { id: threadId }, include: channelMessageInclude });
      if (!root || !(await chatAccess(profile.id, root.channelId))) {
        return new NextResponse("Not found", { status: 404 });
      }
      const replies = await db.message.findMany({
        where: { threadId },
        include: channelMessageInclude,
        orderBy: { createdAt: "asc" },
        take: 500,
      });
      return NextResponse.json({ root, items: replies });
    }

    if (!channelId) {
      return new NextResponse("Channel ID missing", { status: 400 });
    }

    // Only people who can see the channel (server members; listed members if private).
    if (!(await chatAccess(profile.id, channelId))) {
      return new NextResponse("Not found", { status: 404 });
    }

    const messages = await db.message.findMany({
      take: MESSAGES_BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      where: { channelId, threadId: null },
      include: channelMessageInclude,
      orderBy: { createdAt: "desc" },
    });

    const nextCursor = messages.length === MESSAGES_BATCH ? messages[MESSAGES_BATCH - 1].id : null;

    return NextResponse.json({
      items: messages,
      nextCursor
    });
  } catch (error) {
    console.log("[MESSAGES_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
