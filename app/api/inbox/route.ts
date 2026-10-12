import { NextResponse } from "next/server";
import { NotificationType } from "@prisma/client";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";

/**
 * Your inbox: mentions, replies, thread replies, DMs, keyword hits, reminders
 * and poll results from every server, in one list you can work through.
 *   GET ?view=open|done&type=MENTION|...&count=1
 */
export async function GET(req: Request) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const p = new URL(req.url).searchParams;

  if (p.get("count")) {
    const unread = await db.notification.count({ where: { profileId: profile.id, doneAt: null, readAt: null } });
    return NextResponse.json({ unread });
  }

  const done = p.get("view") === "done";
  const type = p.get("type") as NotificationType | null;
  const items = await db.notification.findMany({
    where: {
      profileId: profile.id,
      doneAt: done ? { not: null } : null,
      ...(type && Object.values(NotificationType).includes(type) ? { type } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  // server names for grouping
  const serverIds = Array.from(new Set(items.map((i) => i.serverId).filter(Boolean))) as string[];
  const servers = await db.server.findMany({ where: { id: { in: serverIds } }, select: { id: true, name: true, imageUrl: true } });
  return NextResponse.json({ items, servers });
}

/** POST { action: "read" | "unread" | "done" | "undone", ids?: string[], all?: boolean } */
export async function POST(req: Request) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const { action, ids, all, chatId } = await req.json();
  const where = {
    profileId: profile.id,
    ...(all ? {} : chatId ? { chatId: String(chatId) } : { id: { in: Array.isArray(ids) ? ids.map(String) : [] } }),
  };
  const now = new Date();
  const data =
    action === "read" ? { readAt: now } :
    action === "unread" ? { readAt: null } :
    action === "done" ? { doneAt: now, readAt: now } :
    action === "undone" ? { doneAt: null } : null;
  if (!data) return new NextResponse("Unknown action", { status: 400 });
  const r = await db.notification.updateMany({ where: { ...where, ...(action === "read" ? { readAt: null } : {}) }, data });
  return NextResponse.json({ updated: r.count });
}
