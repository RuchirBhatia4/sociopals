import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { projectAccess } from "@/lib/project";

/** Files and docs attached to a task: GET */
export async function GET(_req: Request, { params }: { params: { taskId: string } }) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const task = await db.task.findUnique({ where: { id: params.taskId } });
  if (!task || !(await projectAccess(profile.id, task.channelId))) return new NextResponse("Not found", { status: 404 });
  const items = await db.taskAttachment.findMany({
    where: { taskId: task.id },
    include: {
      file: { include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } } },
      doc: { select: { id: true, title: true, isOverview: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(
    items.map((a) => ({
      id: a.id,
      file: a.file ? { id: a.file.id, name: a.file.name, url: a.file.versions[0]?.url ?? "", type: a.file.versions[0]?.type ?? "", size: a.file.versions[0]?.size ?? 0 } : null,
      doc: a.doc,
    }))
  );
}
