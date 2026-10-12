import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";

/**
 * Your data, yours to take: GET returns everything we store about you as a
 * JSON download. No ID or phone verification is ever asked for.
 */
export async function GET() {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });

  const members = await db.member.findMany({
    where: { profileId: profile.id },
    include: { server: { select: { id: true, name: true } } },
  });
  const memberIds = members.map((m) => m.id);

  const [messages, directMessages, reactions, saved, scheduled, notifications, chatPrefs, votes, ownedServers] = await Promise.all([
    db.message.findMany({
      where: { memberId: { in: memberIds }, deleted: false },
      select: { id: true, content: true, fileUrl: true, channelId: true, createdAt: true, updatedAt: true, attachments: { select: { url: true, name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.directMessage.findMany({
      where: { memberId: { in: memberIds }, deleted: false },
      select: { id: true, content: true, fileUrl: true, conversationId: true, createdAt: true, updatedAt: true, attachments: { select: { url: true, name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.reaction.findMany({ where: { profileId: profile.id }, select: { emoji: true, messageId: true, directMessageId: true, createdAt: true } }),
    db.savedItem.findMany({ where: { profileId: profile.id } }),
    db.scheduledMessage.findMany({ where: { profileId: profile.id } }),
    db.notification.findMany({ where: { profileId: profile.id }, orderBy: { createdAt: "desc" }, take: 1000 }),
    db.chatPreference.findMany({ where: { profileId: profile.id } }),
    db.pollVote.findMany({ where: { profileId: profile.id } }),
    db.server.findMany({ where: { profileId: profile.id }, select: { id: true, name: true, createdAt: true } }),
  ]);

  const { userId, ...me } = profile;
  const data = {
    exportedAt: new Date().toISOString(),
    profile: me,
    servers: members.map((m) => ({ id: m.server.id, name: m.server.name, role: m.role, joinedAt: m.createdAt })),
    ownedServers,
    messages,
    directMessages,
    reactions,
    saved,
    scheduled,
    notifications,
    notificationSettings: chatPrefs,
    pollVotes: votes,
  };

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="sociopals-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}

/**
 * Delete your account for good: DELETE with { confirm: "<your name>" }.
 * Servers you own are deleted with it (hand them over first if you want them to live on);
 * your messages everywhere else are removed too.
 */
export async function DELETE(req: Request) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const { confirm } = await req.json().catch(() => ({}));
  if (String(confirm || "").trim() !== profile.name.trim()) {
    return new NextResponse("Type your name exactly to confirm", { status: 400 });
  }

  // relationMode = "prisma" emulates the cascades declared in the schema.
  await db.profile.delete({ where: { id: profile.id } });
  try {
    await clerkClient.users.deleteUser(profile.userId);
  } catch (e) {
    console.log("[DELETE_ACCOUNT_CLERK]", e);
  }
  return NextResponse.json({ ok: true });
}
