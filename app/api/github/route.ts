import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { githubConfigured } from "@/lib/github";

/** Your GitHub connection: GET status, DELETE to disconnect. */
export async function GET() {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const acc = await db.githubAccount.findUnique({ where: { profileId: profile.id } });
  return NextResponse.json({
    configured: githubConfigured(),
    connected: !!acc,
    login: acc?.login ?? null,
    avatarUrl: acc?.avatarUrl ?? null,
  });
}

export async function DELETE() {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  await db.githubAccount.deleteMany({ where: { profileId: profile.id } });
  return NextResponse.json({ ok: true });
}
