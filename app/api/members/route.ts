import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";

/** People in a server you're in (for pickers): GET ?serverId= */
export async function GET(req: Request) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const serverId = new URL(req.url).searchParams.get("serverId") || "";
  const me = await db.member.findFirst({ where: { serverId, profileId: profile.id }, select: { id: true } });
  if (!me) return new NextResponse("Not found", { status: 404 });
  const members = await db.member.findMany({
    where: { serverId },
    include: { profile: { select: { id: true, name: true, imageUrl: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({
    me: me.id,
    members: members.map((m) => ({ id: m.id, profileId: m.profile.id, name: m.profile.name, imageUrl: m.profile.imageUrl, role: m.role })),
  });
}
