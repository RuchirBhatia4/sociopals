import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { projectAccess } from "@/lib/project";

/** One doc and its history: GET (?revision=<id> returns that old version's text) */
export async function GET(req: Request, { params }: { params: { channelId: string; docId: string } }) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const p = await projectAccess(profile.id, params.channelId);
  if (!p) return new NextResponse("Not found", { status: 404 });
  const doc = await db.projectDoc.findFirst({ where: { id: params.docId, channelId: p.channel.id } });
  if (!doc) return new NextResponse("Not found", { status: 404 });

  const revId = new URL(req.url).searchParams.get("revision");
  if (revId) {
    const r = await db.projectDocRevision.findFirst({ where: { id: revId, docId: doc.id } });
    return r ? NextResponse.json(r) : new NextResponse("Not found", { status: 404 });
  }
  const revisions = await db.projectDocRevision.findMany({
    where: { docId: doc.id },
    select: { id: true, createdAt: true, editedById: true, title: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const ids = Array.from(new Set([doc.updatedById, ...revisions.map((r) => r.editedById)]));
  const members = await db.member.findMany({ where: { id: { in: ids } }, include: { profile: { select: { name: true } } } });
  const name = (id: string) => members.find((m) => m.id === id)?.profile.name ?? "Someone";
  return NextResponse.json({ ...doc, updatedBy: name(doc.updatedById), revisions: revisions.map((r) => ({ ...r, editedBy: name(r.editedById) })) });
}
