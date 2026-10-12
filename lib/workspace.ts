import { ProjectFile, ProjectFileVersion } from "@prisma/client";

import { db } from "@/lib/db";

export const OVERVIEW_TEMPLATE = `# Project overview

## What we're building
A sentence or two about the goal.

## Links
- Repo:
- Designs:

## Decisions
- 

## Open questions
- [ ] 
`;

/** Make sure a folder path (e.g. "designs/v2") exists; returns the deepest folder id. */
export async function ensureFolderPath(channelId: string, parentId: string | null, path: string[], memberId: string) {
  let parent = parentId;
  for (const raw of path) {
    const name = raw.trim().slice(0, 120);
    if (!name || name === "." || name === "..") continue;
    const existing = await db.projectFolder.findFirst({ where: { channelId, parentId: parent, name } });
    parent = existing ? existing.id : (await db.projectFolder.create({ data: { channelId, parentId: parent, name, createdById: memberId } })).id;
  }
  return parent;
}

/** Breadcrumb from the root to a folder. */
export async function breadcrumb(folderId: string | null) {
  const trail: { id: string; name: string }[] = [];
  let id = folderId;
  for (let i = 0; id && i < 20; i++) {
    const f = await db.projectFolder.findUnique({ where: { id }, select: { id: true, name: true, parentId: true } });
    if (!f) break;
    trail.unshift({ id: f.id, name: f.name });
    id = f.parentId;
  }
  return trail;
}

export type FileView = {
  id: string; name: string; folderId: string | null; source: string; messageId: string | null;
  url: string; size: number; type: string; versions: number; createdAt: Date; updatedAt: Date;
  uploadedBy: { id: string; name: string; imageUrl: string } | null;
};

/** Files with their latest version and who uploaded it. */
export async function fileViews(files: (ProjectFile & { versions: ProjectFileVersion[]; _count?: { versions: number } })[]): Promise<FileView[]> {
  const ids = Array.from(new Set(files.map((f) => f.versions[0]?.uploadedById ?? f.createdById)));
  const members = ids.length ? await db.member.findMany({ where: { id: { in: ids } }, include: { profile: { select: { name: true, imageUrl: true } } } }) : [];
  return files.map((f) => {
    const v = f.versions[0];
    const m = members.find((x) => x.id === (v?.uploadedById ?? f.createdById));
    return {
      id: f.id, name: f.name, folderId: f.folderId, source: f.source, messageId: f.messageId,
      url: v?.url ?? "", size: v?.size ?? 0, type: v?.type ?? "", versions: f._count?.versions ?? f.versions.length,
      createdAt: f.createdAt, updatedAt: v?.createdAt ?? f.updatedAt,
      uploadedBy: m ? { id: m.id, name: m.profile.name, imageUrl: m.profile.imageUrl } : null,
    };
  });
}

/** Files shared in a project channel's chat also land in its Files tab. */
export async function collectChatFiles(args: {
  channelId: string;
  messageId: string;
  memberId: string;
  attachments: { url: string; name: string; type: string; size: number }[];
}) {
  if (!args.attachments.length) return;
  const folderId = await ensureFolderPath(args.channelId, null, ["Shared in chat"], args.memberId);
  for (const a of args.attachments) {
    await db.projectFile.create({
      data: {
        channelId: args.channelId,
        folderId,
        name: a.name.slice(0, 200),
        source: "chat",
        messageId: args.messageId,
        createdById: args.memberId,
        versions: { create: { url: a.url, size: a.size, type: a.type, uploadedById: args.memberId } },
      },
    });
  }
}
