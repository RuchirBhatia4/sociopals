import { NextApiRequest } from "next";
import { TaskStatus } from "@prisma/client";

import { NextApiResponseServerIo } from "@/types";
import { currentProfilePages } from "@/lib/current-profile-pages";
import { db } from "@/lib/db";
import { getIO } from "@/lib/io";
import { can } from "@/lib/permissions";
import { chatRoom, taskKey } from "@/lib/socket-keys";
import { postChannelMessage } from "@/lib/post-message";
import { notifySystem } from "@/lib/notify";
import { GithubError, branchFor, catchUpToMain, commitFiles, createBranch, gh, githubTokenFor } from "@/lib/github";
import { projectAccess, repoOf, taskViews } from "@/lib/project";

/*
  Project tasks. POST { channelId, type, ... }:
    create  { title, description?, assigneeId? }
    update  { taskId, title?, description?, status?, assigneeId? }
    delete  { taskId }
    branch  { taskId, name? }      open a branch in the repo for this task (with your GitHub)
    catchup { taskId }             merge the latest main into the task branch
    pr      { taskId }             open a pull request
    apply   { taskId, messageId }  commit an AI proposal to the task branch
  Everyone in the channel gets a live update.
*/
export default async function handler(req: NextApiRequest, res: NextApiResponseServerIo) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const profile = await currentProfilePages(req);
  if (!profile) return res.status(401).json({ error: "Unauthorized" });

  const b = req.body ?? {};
  const p = await projectAccess(profile.id, String(b.channelId || ""));
  if (!p) return res.status(404).json({ error: "Project not found" });
  const { channel, member } = p;
  const manager = can(member, "MANAGE_CHANNELS");

  const emit = async (taskId: string, removed = false) => {
    if (removed) return getIO()?.to(chatRoom(channel.id)).emit(taskKey(channel.id), { type: "removed", id: taskId });
    const t = await db.task.findUnique({ where: { id: taskId } });
    if (t) getIO()?.to(chatRoom(channel.id)).emit(taskKey(channel.id), { type: "upsert", task: (await taskViews(channel, [t]))[0] });
  };
  const announce = (content: string) =>
    postChannelMessage({ member, channel, content, system: true }).catch((e) => console.log("[TASK_ANNOUNCE]", e));
  const assign = async (taskId: string, assigneeId: string | null, number: number, title: string) => {
    if (!assigneeId) return;
    const target = await db.member.findFirst({ where: { id: assigneeId, serverId: channel.serverId }, include: { profile: true } });
    if (!target) return;
    await announce(`📋 **${profile.name}** assigned task #${number} **${title}** to **${target.id === member.id ? "themselves" : target.profile.name}**`);
    if (target.profileId !== profile.id) {
      await notifySystem({
        profileId: target.profileId,
        type: "TASK",
        serverId: channel.serverId,
        chatId: channel.id,
        chatName: channel.name,
        actorName: profile.name,
        actorImage: profile.imageUrl,
        preview: `#${number} ${title}`,
        title: `${profile.name} assigned you a task in #${channel.name}`,
        url: `/servers/${channel.serverId}/channels/${channel.id}?task=${taskId}`,
      }).catch(() => {});
    }
  };

  const task = b.taskId ? await db.task.findFirst({ where: { id: String(b.taskId), channelId: channel.id } }) : null;
  if (b.type !== "create" && !task) return res.status(404).json({ error: "Task not found" });
  const repo = repoOf(channel);
  const needGithub = async () => {
    if (!repo) throw new GithubError(400, "Link a GitHub repo to this project first.");
    const t = await githubTokenFor(profile.id);
    if (!t) throw new GithubError(400, "Connect your GitHub first.");
    return t.token;
  };

  try {
    switch (b.type) {
      case "create": {
        const title = String(b.title || "").trim().slice(0, 140);
        if (!title) return res.status(400).json({ error: "Give the task a title" });
        const assigneeId = b.assigneeId ? String(b.assigneeId) : null;
        const last = await db.task.findFirst({ where: { channelId: channel.id }, orderBy: { number: "desc" }, select: { number: true } });
        const t = await db.task.create({
          data: {
            channelId: channel.id,
            number: (last?.number ?? 0) + 1,
            title,
            description: b.description ? String(b.description).slice(0, 5000) : null,
            createdById: member.id,
            assigneeId,
          },
        });
        await assign(t.id, assigneeId, t.number, t.title);
        await emit(t.id);
        return res.status(200).json((await taskViews(channel, [t]))[0]);
      }
      case "update": {
        const mayEdit = manager || task!.createdById === member.id || task!.assigneeId === member.id;
        if (!mayEdit) return res.status(403).json({ error: "Only the creator, the assignee or a manager can change this task" });
        const data: Record<string, unknown> = {};
        if (typeof b.title === "string" && b.title.trim()) data.title = b.title.trim().slice(0, 140);
        if ("description" in b) data.description = b.description ? String(b.description).slice(0, 5000) : null;
        if (b.status && Object.values(TaskStatus).includes(b.status)) data.status = b.status;
        const reassigned = "assigneeId" in b && (b.assigneeId || null) !== task!.assigneeId;
        if (reassigned) data.assigneeId = b.assigneeId || null;
        const t = await db.task.update({ where: { id: task!.id }, data });
        if (reassigned) await assign(t.id, t.assigneeId, t.number, t.title);
        if (data.status === "DONE" && task!.status !== "DONE") await announce(`✅ **${profile.name}** finished task #${t.number} **${t.title}**`);
        await emit(t.id);
        return res.status(200).json({ ok: true });
      }
      case "delete": {
        if (!manager && task!.createdById !== member.id) return res.status(403).json({ error: "Only the creator or a manager can delete a task" });
        await db.task.delete({ where: { id: task!.id } });
        await emit(task!.id, true);
        return res.status(200).json({ ok: true });
      }
      case "branch": {
        const token = await needGithub();
        const name = typeof b.name === "string" && /^[\w./-]{1,100}$/.test(b.name) && !b.name.includes("..") ? b.name : branchFor(task!.number, task!.title);
        await createBranch(token, repo!, name);
        await db.task.update({
          where: { id: task!.id },
          data: { branch: name, status: task!.status === "TODO" ? "IN_PROGRESS" : task!.status, assigneeId: task!.assigneeId ?? member.id },
        });
        await announce(`🌿 **${profile.name}** started task #${task!.number} on branch \`${name}\``);
        await emit(task!.id);
        return res.status(200).json({ ok: true, branch: name });
      }
      case "catchup": {
        const token = await needGithub();
        if (!task!.branch) return res.status(400).json({ error: "Open a branch for this task first" });
        const r = await catchUpToMain(token, repo!, task!.branch);
        return res.status(200).json({ ok: true, result: r });
      }
      case "pr": {
        const token = await needGithub();
        if (!task!.branch) return res.status(400).json({ error: "Open a branch for this task first" });
        let pr;
        try {
          pr = await gh(token, `/repos/${repo!.owner}/${repo!.name}/pulls`, {
            method: "POST",
            body: {
              title: `#${task!.number} ${task!.title}`,
              head: task!.branch,
              base: repo!.defaultBranch,
              body: `${task!.description ?? ""}\n\n_Opened from Sociopals, project #${channel.name}._`.trim(),
            },
          });
        } catch (e) {
          if (e instanceof GithubError && e.status === 422) {
            return res.status(400).json({ error: "GitHub won't open a pull request yet: the branch may have no new commits, or one is already open." });
          }
          throw e;
        }
        await db.task.update({ where: { id: task!.id }, data: { prNumber: pr.number, prUrl: pr.html_url, status: "IN_REVIEW" } });
        await announce(`🔀 **${profile.name}** opened a pull request for task #${task!.number}: ${pr.html_url}`);
        await emit(task!.id);
        return res.status(200).json({ ok: true, url: pr.html_url });
      }
      case "apply": {
        const token = await needGithub();
        if (!task!.branch) return res.status(400).json({ error: "Open a branch for this task first" });
        const msg = await db.taskAiMessage.findFirst({ where: { id: String(b.messageId), taskId: task!.id, profileId: profile.id } });
        const proposal = msg?.proposal as { summary: string; files: { path: string; action: "create" | "update" | "delete"; content?: string }[] } | null;
        if (!msg || !proposal?.files?.length) return res.status(404).json({ error: "Nothing to apply" });
        if (msg.appliedAt) return res.status(400).json({ error: "Already applied" });
        const sha = await commitFiles(token, repo!, task!.branch, `${proposal.summary}\n\nTask #${task!.number} (AI-assisted, applied by ${profile.name} in Sociopals)`, proposal.files);
        await db.taskAiMessage.update({ where: { id: msg.id }, data: { appliedAt: new Date(), commitSha: sha } });
        await emit(task!.id);
        return res.status(200).json({ ok: true, sha, url: `https://github.com/${repo!.owner}/${repo!.name}/commit/${sha}` });
      }
      default:
        return res.status(400).json({ error: "Unknown action" });
    }
  } catch (e) {
    if (e instanceof GithubError) return res.status(e.status >= 500 ? 502 : e.status === 401 ? 401 : 400).json({ error: e.message });
    console.log("[TASKS]", e);
    return res.status(500).json({ error: "Internal Error" });
  }
}
