import { NextApiRequest } from "next";

import { NextApiResponseServerIo } from "@/types";
import { currentProfilePages } from "@/lib/current-profile-pages";
import { db } from "@/lib/db";
import { getIO } from "@/lib/io";
import { can } from "@/lib/permissions";
import { chatRoom, workspaceKey } from "@/lib/socket-keys";
import { PostError, postChannelMessage } from "@/lib/post-message";
import { projectAccess } from "@/lib/project";
import { ensureFolderPath } from "@/lib/workspace";

/*
  A project's workspace. POST { channelId, type, ... }:
    folder:create { name, parentId? }     folder:rename { folderId, name }     folder:delete { folderId }
    files:add     { folderId?, items: [{ path, url, name, type, size }] }   (path keeps dropped folders)
    file:version  { fileId, url, mime, size }                file:rename { fileId, name }
    file:move     { fileId, folderId|null }                  file:delete { fileId }
    file:share    { fileId, text? }                          post it in the chat
    doc:create    { title? }                                 doc:delete { docId }      doc:share { docId }
    doc:save      { docId, title, content, baseVersion }     (409 if someone saved in between)
    doc:restore   { docId, revisionId }
    task:attach   { taskId, fileId? | docId? }               task:detach { attachmentId }
  Everyone viewing the project refreshes live.
*/
const UPLOAD_URL = /^https:\/\/(utfs\.io|uploadthing\.com|[a-z0-9-]+\.ufs\.sh)\//;
const REVISION_EVERY_MS = 2 * 60_000;

export default async function handler(req: NextApiRequest, res: NextApiResponseServerIo) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const profile = await currentProfilePages(req);
  if (!profile) return res.status(401).json({ error: "Unauthorized" });
  const b = req.body ?? {};
  const p = await projectAccess(profile.id, String(b.channelId || ""));
  if (!p) return res.status(404).json({ error: "Project not found" });
  const { channel, member } = p;
  const manager = can(member, "MANAGE_CHANNELS");
  const changed = (what: "files" | "docs" | "attachments", extra: object = {}) =>
    getIO()?.to(chatRoom(channel.id)).emit(workspaceKey(channel.id), { type: what, by: profile.id, ...extra });

  const inProject = {
    folder: (id: unknown) => (id ? db.projectFolder.findFirst({ where: { id: String(id), channelId: channel.id } }) : Promise.resolve(null)),
    file: (id: unknown) => db.projectFile.findFirst({ where: { id: String(id || ""), channelId: channel.id } }),
    doc: (id: unknown) => db.projectDoc.findFirst({ where: { id: String(id || ""), channelId: channel.id } }),
  };
  const cleanName = (n: unknown) => String(n ?? "").replace(/[\\/]/g, "-").trim().slice(0, 200);

  try {
    switch (b.type) {
      /* ---------- folders ---------- */
      case "folder:create": {
        const name = cleanName(b.name);
        if (!name) return res.status(400).json({ error: "Name the folder" });
        if (b.parentId && !(await inProject.folder(b.parentId))) return res.status(404).json({ error: "Folder not found" });
        const f = await db.projectFolder.create({ data: { channelId: channel.id, parentId: b.parentId || null, name, createdById: member.id } });
        changed("files");
        return res.status(200).json(f);
      }
      case "folder:rename": {
        const f = await inProject.folder(b.folderId);
        const name = cleanName(b.name);
        if (!f || !name) return res.status(400).json({ error: "Folder not found" });
        await db.projectFolder.update({ where: { id: f.id }, data: { name } });
        changed("files");
        return res.status(200).json({ ok: true });
      }
      case "folder:delete": {
        const f = await inProject.folder(b.folderId);
        if (!f) return res.status(404).json({ error: "Folder not found" });
        if (!manager && f.createdById !== member.id) return res.status(403).json({ error: "Only who made it or a manager can delete this folder" });
        // Nothing is lost: what's inside moves up one level.
        await db.$transaction([
          db.projectFile.updateMany({ where: { folderId: f.id }, data: { folderId: f.parentId } }),
          db.projectFolder.updateMany({ where: { parentId: f.id }, data: { parentId: f.parentId } }),
          db.projectFolder.delete({ where: { id: f.id } }),
        ]);
        changed("files");
        return res.status(200).json({ ok: true });
      }

      /* ---------- files ---------- */
      case "files:add": {
        const items: any[] = Array.isArray(b.items) ? b.items.slice(0, 200) : [];
        if (b.folderId && !(await inProject.folder(b.folderId))) return res.status(404).json({ error: "Folder not found" });
        let added = 0;
        for (const it of items) {
          if (typeof it?.url !== "string" || !UPLOAD_URL.test(it.url)) continue;
          const parts = String(it.path || it.name || "file").split("/").filter(Boolean);
          const name = cleanName(parts.pop() || it.name);
          if (!name) continue;
          const folderId = await ensureFolderPath(channel.id, b.folderId || null, parts.slice(0, 10), member.id);
          // Same name in the same folder: it's a new version of that file.
          const existing = await db.projectFile.findFirst({ where: { channelId: channel.id, folderId, name } });
          const version = { url: it.url, size: Number(it.size) || 0, type: String(it.type || "application/octet-stream").slice(0, 100), uploadedById: member.id };
          if (existing) {
            await db.projectFileVersion.create({ data: { fileId: existing.id, ...version } });
            await db.projectFile.update({ where: { id: existing.id }, data: { updatedAt: new Date() } });
          } else {
            await db.projectFile.create({ data: { channelId: channel.id, folderId, name, createdById: member.id, versions: { create: version } } });
          }
          added++;
        }
        changed("files");
        return res.status(200).json({ added });
      }
      case "file:version": {
        const f = await inProject.file(b.fileId);
        if (!f || typeof b.url !== "string" || !UPLOAD_URL.test(b.url)) return res.status(400).json({ error: "File not found" });
        await db.projectFileVersion.create({ data: { fileId: f.id, url: b.url, size: Number(b.size) || 0, type: String(b.mime || "application/octet-stream").slice(0, 100), uploadedById: member.id } });
        await db.projectFile.update({ where: { id: f.id }, data: { updatedAt: new Date() } });
        changed("files");
        return res.status(200).json({ ok: true });
      }
      case "file:rename": {
        const f = await inProject.file(b.fileId);
        const name = cleanName(b.name);
        if (!f || !name) return res.status(400).json({ error: "File not found" });
        await db.projectFile.update({ where: { id: f.id }, data: { name } });
        changed("files");
        return res.status(200).json({ ok: true });
      }
      case "file:move": {
        const f = await inProject.file(b.fileId);
        if (!f) return res.status(404).json({ error: "File not found" });
        if (b.folderId && !(await inProject.folder(b.folderId))) return res.status(404).json({ error: "Folder not found" });
        await db.projectFile.update({ where: { id: f.id }, data: { folderId: b.folderId || null } });
        changed("files");
        return res.status(200).json({ ok: true });
      }
      case "file:delete": {
        const f = await inProject.file(b.fileId);
        if (!f) return res.status(404).json({ error: "File not found" });
        if (!manager && f.createdById !== member.id) return res.status(403).json({ error: "Only who uploaded it or a manager can delete this file" });
        await db.projectFile.delete({ where: { id: f.id } });
        changed("files");
        changed("attachments");
        return res.status(200).json({ ok: true });
      }
      case "file:share": {
        const f = await db.projectFile.findFirst({ where: { id: String(b.fileId || ""), channelId: channel.id }, include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } } });
        const v = f?.versions[0];
        if (!f || !v) return res.status(404).json({ error: "File not found" });
        const author = await db.member.findUnique({ where: { id: member.id }, include: { profile: true, customRoles: { include: { role: true } } } });
        // Posted as a link to the existing upload (not a new attachment), so it isn't collected twice.
        await postChannelMessage({
          member: author!,
          channel,
          content: `${b.text ? `${String(b.text).slice(0, 2000)}\n` : ""}📎 **${f.name}** (from Files): ${v.url}`,
        });
        return res.status(200).json({ ok: true });
      }

      /* ---------- docs ---------- */
      case "doc:create": {
        const title = String(b.title || "Untitled").trim().slice(0, 140) || "Untitled";
        const d = await db.projectDoc.create({ data: { channelId: channel.id, title, content: "", createdById: member.id, updatedById: member.id } });
        changed("docs");
        return res.status(200).json(d);
      }
      case "doc:save": {
        const d = await inProject.doc(b.docId);
        if (!d) return res.status(404).json({ error: "Doc not found" });
        const title = String(b.title ?? d.title).trim().slice(0, 140) || "Untitled";
        const content = String(b.content ?? "").slice(0, 500_000);
        if (Number(b.baseVersion) !== d.version) {
          return res.status(409).json({ error: "Someone else saved this doc while you were editing.", doc: d });
        }
        // Keep a snapshot of the previous text now and then, so edits can be undone.
        const last = await db.projectDocRevision.findFirst({ where: { docId: d.id }, orderBy: { createdAt: "desc" } });
        // Always keep a version that's being overwritten after a conflict ("Keep mine").
        if (d.content && (b.force || !last || Date.now() - last.createdAt.getTime() > REVISION_EVERY_MS || d.updatedById !== member.id)) {
          await db.projectDocRevision.create({ data: { docId: d.id, title: d.title, content: d.content, editedById: d.updatedById } });
        }
        const saved = await db.projectDoc.update({
          where: { id: d.id },
          data: { title: d.isOverview ? d.title : title, content, version: { increment: 1 }, updatedById: member.id },
        });
        changed("docs", { docId: d.id, version: saved.version });
        return res.status(200).json({ version: saved.version, updatedAt: saved.updatedAt });
      }
      case "doc:share": {
        const d = await inProject.doc(b.docId);
        if (!d) return res.status(404).json({ error: "Doc not found" });
        const author = await db.member.findUnique({ where: { id: member.id }, include: { profile: true, customRoles: { include: { role: true } } } });
        const site = process.env.NEXT_PUBLIC_SITE_URL || `https://${req.headers.host}`;
        await postChannelMessage({
          member: author!,
          channel,
          content: `📄 **${d.title}** (doc): ${site}/servers/${channel.serverId}/channels/${channel.id}?view=docs&doc=${d.id}`,
        });
        return res.status(200).json({ ok: true });
      }
      case "doc:delete": {
        const d = await inProject.doc(b.docId);
        if (!d) return res.status(404).json({ error: "Doc not found" });
        if (d.isOverview) return res.status(400).json({ error: "The overview can't be deleted" });
        if (!manager && d.createdById !== member.id) return res.status(403).json({ error: "Only who made it or a manager can delete this doc" });
        await db.projectDoc.delete({ where: { id: d.id } });
        changed("docs", { docId: d.id, deleted: true });
        changed("attachments");
        return res.status(200).json({ ok: true });
      }
      case "doc:restore": {
        const d = await inProject.doc(b.docId);
        const rev = d ? await db.projectDocRevision.findFirst({ where: { id: String(b.revisionId || ""), docId: d.id } }) : null;
        if (!d || !rev) return res.status(404).json({ error: "Version not found" });
        await db.projectDocRevision.create({ data: { docId: d.id, title: d.title, content: d.content, editedById: d.updatedById } });
        const saved = await db.projectDoc.update({ where: { id: d.id }, data: { title: d.isOverview ? d.title : rev.title, content: rev.content, version: { increment: 1 }, updatedById: member.id } });
        changed("docs", { docId: d.id, version: saved.version });
        return res.status(200).json({ ok: true });
      }

      /* ---------- task attachments ---------- */
      case "task:attach": {
        const task = await db.task.findFirst({ where: { id: String(b.taskId || ""), channelId: channel.id } });
        if (!task) return res.status(404).json({ error: "Task not found" });
        const file = b.fileId ? await inProject.file(b.fileId) : null;
        const doc = b.docId ? await inProject.doc(b.docId) : null;
        if (!file && !doc) return res.status(404).json({ error: "Pick a file or doc" });
        const dupe = await db.taskAttachment.findFirst({ where: { taskId: task.id, fileId: file?.id ?? null, docId: doc?.id ?? null } });
        if (!dupe) await db.taskAttachment.create({ data: { taskId: task.id, fileId: file?.id ?? null, docId: doc?.id ?? null, addedById: member.id } });
        changed("attachments", { taskId: task.id });
        return res.status(200).json({ ok: true });
      }
      case "task:detach": {
        const a = await db.taskAttachment.findFirst({ where: { id: String(b.attachmentId || ""), task: { channelId: channel.id } } });
        if (!a) return res.status(404).json({ error: "Not found" });
        await db.taskAttachment.delete({ where: { id: a.id } });
        changed("attachments", { taskId: a.taskId });
        return res.status(200).json({ ok: true });
      }
      default:
        return res.status(400).json({ error: "Unknown action" });
    }
  } catch (e) {
    if (e instanceof PostError) return res.status(e.status).json({ error: e.message });
    console.log("[WORKSPACE]", e);
    return res.status(500).json({ error: "Internal Error" });
  }
}
