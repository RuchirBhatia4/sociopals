import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { projectAccess } from "@/lib/project";

/** One file with every version: GET */
export async function GET(_req: Request, { params }: { params: { channelId: string; fileId: string } }) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const p = await projectAccess(profile.id, params.channelId);
  if (!p) return new NextResponse("Not found", { status: 404 });
  const f = await db.projectFile.findFirst({
    where: { id: params.fileId, channelId: p.channel.id },
    include: { versions: { orderBy: { createdAt: "desc" } } },
  });
  if (!f) return new NextResponse("Not found", { status: 404 });
  const ids = Array.from(new Set(f.versions.map((v) => v.uploadedById)));
  const members = await db.member.findMany({ where: { id: { in: ids } }, include: { profile: { select: { name: true } } } });
  return NextResponse.json({
    ...f,
    versions: f.versions.map((v) => ({ ...v, uploadedBy: members.find((m) => m.id === v.uploadedById)?.profile.name ?? "Someone" })),
  });
}
