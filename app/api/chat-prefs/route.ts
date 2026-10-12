import { NextResponse } from "next/server";
import { NotifyLevel } from "@prisma/client";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { chatAccess } from "@/lib/access";

/** How loud a chat may be for you. GET ?chatId=  →  { level, muted } */
export async function GET(req: Request) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const chatId = new URL(req.url).searchParams.get("chatId");
  if (!chatId) return new NextResponse("chatId missing", { status: 400 });
  const pref = await db.chatPreference.findUnique({ where: { profileId_chatId: { profileId: profile.id, chatId } } });
  return NextResponse.json({ level: pref?.level ?? "MENTIONS", muted: pref?.muted ?? false, explicit: !!pref });
}

/** PUT { chatId, level?: "ALL" | "MENTIONS" | "NONE", muted?: boolean } */
export async function PUT(req: Request) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const { chatId, level, muted } = await req.json();
  if (!chatId || !(await chatAccess(profile.id, chatId))) return new NextResponse("Not found", { status: 404 });
  const data: { level?: NotifyLevel; muted?: boolean } = {};
  if (level && Object.values(NotifyLevel).includes(level)) data.level = level;
  if (typeof muted === "boolean") data.muted = muted;
  const pref = await db.chatPreference.upsert({
    where: { profileId_chatId: { profileId: profile.id, chatId } },
    create: { profileId: profile.id, chatId, level: data.level ?? "MENTIONS", muted: data.muted ?? false },
    update: data,
  });
  return NextResponse.json(pref);
}
