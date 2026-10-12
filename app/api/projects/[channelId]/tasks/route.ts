import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { projectAccess, taskViews } from "@/lib/project";

/** Tasks in a project channel: GET ?mine=1 for just yours that aren't done */
export async function GET(req: Request, { params }: { params: { channelId: string } }) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const p = await projectAccess(profile.id, params.channelId);
  if (!p) return new NextResponse("Not found", { status: 404 });
  const mine = new URL(req.url).searchParams.get("mine");
  const tasks = await db.task.findMany({
    where: { channelId: p.channel.id, ...(mine ? { assigneeId: p.member.id, status: { not: "DONE" } } : {}) },
    orderBy: [{ status: "asc" }, { number: "desc" }],
    take: 300,
  });
  return NextResponse.json(await taskViews(p.channel, tasks));
}
