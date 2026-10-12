import { NextApiRequest } from "next";
import { createHmac, timingSafeEqual } from "crypto";

import { NextApiResponseServerIo } from "@/types";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { getIO } from "@/lib/io";
import { chatRoom, taskKey } from "@/lib/socket-keys";
import { postChannelMessage } from "@/lib/post-message";
import { taskViews } from "@/lib/project";

// GitHub signs the raw body, so read it ourselves.
export const config = { api: { bodyParser: false } };

const raw = (req: NextApiRequest) =>
  new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });

/** Events from the project's GitHub repo: pushes, pull requests, issues. */
export default async function handler(req: NextApiRequest, res: NextApiResponseServerIo) {
  if (req.method !== "POST") return res.status(405).end();
  const channel = await db.channel.findUnique({ where: { id: String(req.query.channelId) }, include: { server: true } });
  if (!channel?.isProject || !channel.repoWebhookSecret) return res.status(404).json({ error: "Unknown project" });

  const body = await raw(req);
  const expected = "sha256=" + createHmac("sha256", decrypt(channel.repoWebhookSecret)).update(body).digest("hex");
  const got = String(req.headers["x-hub-signature-256"] || "");
  if (got.length !== expected.length || !timingSafeEqual(Buffer.from(got), Buffer.from(expected))) {
    return res.status(401).json({ error: "Bad signature" });
  }

  const event = String(req.headers["x-github-event"] || "");
  const e = JSON.parse(body.toString("utf8"));
  if (event === "ping") return res.status(200).json({ ok: true });

  // Posted as the person who created the channel, shown as the GitHub bot.
  const member = await db.member.findFirst({ where: { serverId: channel.serverId, profileId: channel.profileId }, include: { profile: true } });
  if (!member) return res.status(200).json({ ok: true });
  const post = (content: string) =>
    postChannelMessage({
      member,
      channel,
      content,
      webhook: { id: "github", name: "GitHub", avatarUrl: "https://github.githubassets.com/favicons/favicon-dark.png" },
    }).catch((err) => console.log("[GITHUB_HOOK]", err));

  const branchOf = (ref: string) => ref.replace(/^refs\/heads\//, "");
  const taskForBranch = (branch: string) => db.task.findFirst({ where: { channelId: channel.id, branch } });
  const emitTask = async (id: string) => {
    const t = await db.task.findUnique({ where: { id } });
    if (t) getIO()?.to(chatRoom(channel.id)).emit(taskKey(channel.id), { type: "upsert", task: (await taskViews(channel, [t]))[0] });
  };

  if (event === "push" && e.commits?.length) {
    const branch = branchOf(e.ref);
    const n = e.commits.length;
    const lines = e.commits.slice(0, 5).map((c: any) => `• [\`${c.id.slice(0, 7)}\`](${c.url}) ${String(c.message).split("\n")[0].slice(0, 100)}`);
    await post(`**${e.pusher?.name ?? e.sender?.login}** pushed ${n} ${n === 1 ? "commit" : "commits"} to \`${branch}\`\n${lines.join("\n")}${n > 5 ? `\n…and ${n - 5} more` : ""}`);
  } else if (event === "pull_request" && ["opened", "closed", "reopened", "ready_for_review"].includes(e.action)) {
    const pr = e.pull_request;
    const merged = e.action === "closed" && pr.merged;
    const verb = merged ? "merged" : e.action === "ready_for_review" ? "marked ready for review" : e.action;
    await post(`**${e.sender?.login}** ${verb} pull request [#${pr.number} ${pr.title}](${pr.html_url})`);
    const task = await taskForBranch(pr.head?.ref);
    if (task) {
      await db.task.update({
        where: { id: task.id },
        data: merged ? { status: "DONE", prNumber: pr.number, prUrl: pr.html_url } : e.action === "opened" ? { status: "IN_REVIEW", prNumber: pr.number, prUrl: pr.html_url } : {},
      });
      await emitTask(task.id);
    }
  } else if (event === "issues" && ["opened", "closed"].includes(e.action)) {
    await post(`**${e.sender?.login}** ${e.action} issue [#${e.issue.number} ${e.issue.title}](${e.issue.html_url})`);
  }
  return res.status(200).json({ ok: true });
}
