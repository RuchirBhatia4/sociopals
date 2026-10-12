import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { messageInclude, MESSAGES_BATCH } from "@/lib/message-include";


export async function GET(
  req: Request
) {
  try {
    const profile = await currentProfile();
    const { searchParams } = new URL(req.url);

    const cursor = searchParams.get("cursor");
    const conversationId = searchParams.get("conversationId");

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
  
    if (!conversationId) {
      return new NextResponse("Conversation ID missing", { status: 400 });
    }

    // Only the two people in a conversation may read it.
    const conversation = await db.conversation.findFirst({
      where: {
        id: conversationId,
        OR: [{ memberOne: { profileId: profile.id } }, { memberTwo: { profileId: profile.id } }],
      },
      select: { id: true },
    });
    if (!conversation) {
      return new NextResponse("Not found", { status: 404 });
    }

    const messages = await db.directMessage.findMany({
      take: MESSAGES_BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      where: { conversationId },
      include: messageInclude,
      orderBy: { createdAt: "desc" },
    });

    let nextCursor = null;

    if (messages.length === MESSAGES_BATCH) {
      nextCursor = messages[MESSAGES_BATCH - 1].id;
    }

    return NextResponse.json({
      items: messages,
      nextCursor
    });
  } catch (error) {
    console.log("[DIRECT_MESSAGES_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}