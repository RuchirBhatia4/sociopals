import { Channel, Member, Task } from "@prisma/client";

import { db } from "@/lib/db";
import { chatAccess } from "@/lib/access";
import type { RepoRef } from "@/lib/github";

/** The project channel and your membership, or null if you can't see it / it isn't a project. */
export async function projectAccess(profileId: string, channelId: string) {
  const access = await chatAccess(profileId, channelId);
  if (!access || access.kind !== "channel" || !access.channel.isProject) return null;
  const member = await db.member.findUnique({
    where: { id: access.member.id },
    include: { profile: true, customRoles: { include: { role: true } } },
  });
  if (!member) return null;
  return { channel: access.channel, member };
}

export const repoOf = (c: Channel): RepoRef | null =>
  c.repoOwner && c.repoName ? { owner: c.repoOwner, name: c.repoName, defaultBranch: c.repoDefaultBranch || "main" } : null;

export const repoUrl = (c: Channel) => (c.repoOwner && c.repoName ? `https://github.com/${c.repoOwner}/${c.repoName}` : null);

export type TaskView = Task & {
  assignee: { id: string; name: string; imageUrl: string } | null;
  createdBy: { id: string; name: string; imageUrl: string } | null;
  branchUrl: string | null;
};

/** Tasks with the people on them, for the UI. */
export async function taskViews(channel: Channel, tasks: Task[]): Promise<TaskView[]> {
  const ids = Array.from(new Set(tasks.flatMap((t) => [t.assigneeId, t.createdById]).filter(Boolean))) as string[];
  const members: (Member & { profile: { name: string; imageUrl: string } })[] = ids.length
    ? await db.member.findMany({ where: { id: { in: ids } }, include: { profile: { select: { name: true, imageUrl: true } } } })
    : [];
  const who = (id: string | null) => {
    const m = id ? members.find((x) => x.id === id) : null;
    return m ? { id: m.id, name: m.profile.name, imageUrl: m.profile.imageUrl } : null;
  };
  const url = repoUrl(channel);
  return tasks.map((t) => ({
    ...t,
    assignee: who(t.assigneeId),
    createdBy: who(t.createdById),
    branchUrl: url && t.branch ? `${url}/tree/${t.branch}` : null,
  }));
}
