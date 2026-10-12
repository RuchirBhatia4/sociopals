import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { chatAccess } from "@/lib/access";
import { channelMessageInclude, messageInclude } from "@/lib/message-include";

/** Pinned messages and decisions for one chat: GET ?chatId= */
export async function GET(req: Request) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });

  const chatId = new URL(req.url).searchParams.get("chatId");
  if (!chatId) return new NextResponse("chatId missing", { status: 400 });

  const access = await chatAccess(profile.id, chatId);
  if (!access) return new NextResponse("Not found", { status: 404 });

  if (access.kind === "channel") {
    const [pinned, decisions] = await Promise.all([
      db.message.findMany({
        where: { channelId: chatId, deleted: false, pinnedAt: { not: null } },
        include: channelMessageInclude,
        orderBy: { pinnedAt: "desc" },
        take: 100,
      }),
      db.message.findMany({
        where: { channelId: chatId, deleted: false, isDecision: true },
        include: channelMessageInclude,
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);
    return NextResponse.json({ pinned, decisions });
  }

  const pinned = await db.directMessage.findMany({
    where: { conversationId: chatId, deleted: false, pinnedAt: { not: null } },
    include: messageInclude,
    orderBy: { pinnedAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ pinned, decisions: [] });
}
