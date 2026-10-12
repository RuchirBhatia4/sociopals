import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { projectAccess } from "@/lib/project";
import { breadcrumb, fileViews } from "@/lib/workspace";

const latest = { versions: { orderBy: { createdAt: "desc" as const }, take: 1 }, _count: { select: { versions: true } } };

/** A folder's contents: GET ?folderId= (root when empty), or ?q= to search every file, or ?all=1 for a flat list */
export async function GET(req: Request, { params }: { params: { channelId: string } }) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const p = await projectAccess(profile.id, params.channelId);
  if (!p) return new NextResponse("Not found", { status: 404 });
  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") || "").trim();
  const folderId = sp.get("folderId") || null;

  const usage = await db.projectFileVersion.aggregate({ where: { file: { channelId: p.channel.id } }, _sum: { size: true }, _count: true });
  const usageInfo = { bytes: usage._sum.size ?? 0, versions: usage._count };
  const allFolders = await db.projectFolder.findMany({ where: { channelId: p.channel.id }, select: { id: true, name: true, parentId: true }, orderBy: { name: "asc" } });

  if (q || sp.get("all")) {
    const files = await db.projectFile.findMany({
      where: { channelId: p.channel.id, ...(q ? { name: { contains: q } } : {}) },
      include: latest,
      orderBy: { updatedAt: "desc" },
      take: 300,
    });
    return NextResponse.json({ folders: [], files: await fileViews(files), trail: [], usage: usageInfo, allFolders });
  }

  const [folders, files, trail] = await Promise.all([
    db.projectFolder.findMany({ where: { channelId: p.channel.id, parentId: folderId }, orderBy: { name: "asc" } }),
    db.projectFile.findMany({ where: { channelId: p.channel.id, folderId }, include: latest, orderBy: { name: "asc" } }),
    breadcrumb(folderId),
  ]);
  const counts = folders.length
    ? await db.projectFile.groupBy({ by: ["folderId"], where: { folderId: { in: folders.map((f) => f.id) } }, _count: true })
    : [];
  return NextResponse.json({
    folders: folders.map((f) => ({ ...f, files: counts.find((c) => c.folderId === f.id)?._count ?? 0 })),
    files: await fileViews(files),
    trail,
    usage: usageInfo,
    allFolders,
  });
}
