import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { projectAccess } from "@/lib/project";
import { OVERVIEW_TEMPLATE } from "@/lib/workspace";

/** The project's docs (Overview first, created on first visit): GET ?q= */
export async function GET(req: Request, { params }: { params: { channelId: string } }) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const p = await projectAccess(profile.id, params.channelId);
  if (!p) return new NextResponse("Not found", { status: 404 });

  if (!(await db.projectDoc.findFirst({ where: { channelId: p.channel.id, isOverview: true } }))) {
    await db.projectDoc.create({
      data: { channelId: p.channel.id, title: "Overview", content: OVERVIEW_TEMPLATE, isOverview: true, createdById: p.member.id, updatedById: p.member.id },
    });
  }
  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  const docs = await db.projectDoc.findMany({
    where: { channelId: p.channel.id, ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" as const } }, { content: { contains: q, mode: "insensitive" as const } }] } : {}) },
    select: { id: true, title: true, isOverview: true, updatedAt: true, updatedById: true, content: true },
    orderBy: [{ isOverview: "desc" }, { updatedAt: "desc" }],
  });
  const ids = Array.from(new Set(docs.map((d) => d.updatedById)));
  const members = await db.member.findMany({ where: { id: { in: ids } }, include: { profile: { select: { name: true } } } });
  return NextResponse.json(
    docs.map(({ content, ...d }) => ({
      ...d,
      preview: content.replace(/[#*_`>\-\[\]]/g, "").replace(/\s+/g, " ").trim().slice(0, 120),
      updatedBy: members.find((m) => m.id === d.updatedById)?.profile.name ?? "Someone",
    }))
  );
}
