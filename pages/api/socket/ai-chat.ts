import { NextApiRequest } from "next";
import { Prisma } from "@prisma/client";

import { NextApiResponseServerIo } from "@/types";
import { currentProfilePages } from "@/lib/current-profile-pages";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { getIO } from "@/lib/io";
import { AiError, PROVIDER_LABEL } from "@/lib/ai";
import { streamAnswer } from "@/lib/ai-stream";
import { githubTokenFor, listFiles, readFile } from "@/lib/github";
import { channelMessageInclude } from "@/lib/message-include";
import { PostError, postChannelMessage } from "@/lib/post-message";
import { projectAccess, repoOf } from "@/lib/project";
import { aiDeltaKey, chatRoom, updateKey } from "@/lib/socket-keys";

/*
  AI mode in a project channel. POST { channelId, prompt, aiKeyId, context?: 25|50|100|200,
  include?: { overview?: boolean, tasks?: boolean, repo?: boolean } }

  The question is posted as the person's own message; the answer is posted right after it as
  "<Name>'s Claude/ChatGPT" and streams in live for everyone. Only the asker's own key is used.
  The AI is given the recent conversation (and optionally the Overview doc, open tasks and the repo).
*/
export const config = { api: { responseLimit: false } };

const CONTEXT_SIZES = [25, 50, 100, 200];
const MAX_CONTEXT_CHARS = 90_000;
const PER_MINUTE = 6;
const recent = new Map<string, number[]>();

const forAi = (content: string) => content.replace(/@\[([^\]]{1,80})\]\([0-9a-f-]{36}\)/g, "@$1");

export default async function handler(req: NextApiRequest, res: NextApiResponseServerIo) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const profile = await currentProfilePages(req);
  if (!profile) return res.status(401).json({ error: "Unauthorized" });

  const b = req.body ?? {};
  const p = await projectAccess(profile.id, String(b.channelId || ""));
  if (!p) return res.status(404).json({ error: "Project not found" });
  const { channel, member } = p;

  const prompt = String(b.prompt || "").trim().slice(0, 8000);
  if (!prompt) return res.status(400).json({ error: "Ask something first" });

  // Only the asker's own key, ever.
  const key = await db.aiKey.findUnique({ where: { id: String(b.aiKeyId || "") } });
  if (!key || key.profileId !== profile.id) {
    return res.status(403).json({ error: "Use your own AI: add your key in Settings → AI keys." });
  }

  const now = Date.now();
  const mine = (recent.get(profile.id) ?? []).filter((t) => now - t < 60_000);
  if (mine.length >= PER_MINUTE) return res.status(429).json({ error: "That's a lot of questions at once. Give it a minute." });
  recent.set(profile.id, [...mine, now]);

  const contextSize = CONTEXT_SIZES.includes(Number(b.context)) ? Number(b.context) : 50;
  const include = { overview: b.include?.overview !== false, tasks: b.include?.tasks !== false, repo: b.include?.repo !== false };
  const label = key.label;

  // 1) The question, as the person's message (counts toward slow mode, automod, etc.)
  let question, answer;
  try {
    question = await postChannelMessage({
      member,
      channel,
      content: prompt,
      aiMeta: { kind: "prompt", label, provider: key.provider } as Prisma.InputJsonValue,
    });
    // 2) The answer, empty for now; it fills in as it streams.
    answer = await postChannelMessage({
      member,
      channel,
      content: "…",
      replyToId: question.id,
      webhook: { id: `ai:${key.id}`, name: label, avatarUrl: null },
      aiMeta: { kind: "answer", label, provider: key.provider, model: key.model, askedBy: profile.name, status: "streaming" } as Prisma.InputJsonValue,
    });
  } catch (e) {
    if (e instanceof PostError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
  res.status(200).json({ questionId: question.id, answerId: answer.id });

  // 3) Build the context and stream the answer (after replying, so the composer is free right away).
  const io = getIO();
  const answerId = answer.id;
  const finish = async (content: string, status: "done" | "error") => {
    const msg = await db.message.update({
      where: { id: answerId },
      data: {
        content: content || "(no answer)",
        aiMeta: { kind: "answer", label, provider: key.provider, model: key.model, askedBy: profile.name, status } as Prisma.InputJsonValue,
      },
      include: channelMessageInclude,
    });
    io?.to(chatRoom(channel.id)).emit(updateKey(channel.id), msg);
  };

  try {
    const history = await db.message.findMany({
      where: { channelId: channel.id, deleted: false, system: false, id: { notIn: [question.id, answerId] } },
      include: { member: { include: { profile: { select: { name: true } } } }, attachments: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: contextSize,
    });
    history.reverse();
    let transcript = history
      .map((m) => {
        const who = m.webhookName ?? m.member.profile.name;
        const where = m.threadId ? " (in a thread)" : "";
        const files = m.attachments.length ? ` [attached: ${m.attachments.map((a) => a.name).join(", ")}]` : "";
        return `[${m.createdAt.toISOString().slice(0, 16).replace("T", " ")}] ${who}${where}: ${forAi(m.content)}${files}`;
      })
      .join("\n");
    if (transcript.length > MAX_CONTEXT_CHARS) transcript = "…(earlier messages cut)\n" + transcript.slice(-MAX_CONTEXT_CHARS);

    const extras: string[] = [];
    if (include.overview) {
      const overview = await db.projectDoc.findFirst({ where: { channelId: channel.id, isOverview: true } });
      if (overview?.content.trim()) extras.push(`Project overview doc:\n${overview.content.slice(0, 15_000)}`);
    }
    if (include.tasks) {
      const tasks = await db.task.findMany({ where: { channelId: channel.id, status: { not: "DONE" } }, orderBy: { number: "asc" }, take: 40 });
      if (tasks.length) extras.push(`Open tasks:\n${tasks.map((t) => `#${t.number} [${t.status}] ${t.title}${t.branch ? ` (branch ${t.branch})` : ""}`).join("\n")}`);
    }

    // Repo access through the asker's own GitHub, read-only.
    const repo = repoOf(channel);
    const gh = include.repo && repo ? await githubTokenFor(profile.id) : null;
    let files: string[] | null = null;
    const host = repo && gh ? {
      listFiles: async () => (files ??= await listFiles(gh.token, repo, repo.defaultBranch)),
      readFile: (path: string) => readFile(gh.token, repo, repo.defaultBranch, path),
    } : null;

    const system = [
      `You are ${label} (${PROVIDER_LABEL[key.provider]}), the AI assistant ${profile.name} is using inside #${channel.name}, a team project channel in a chat app.`,
      `${profile.name} just asked you something in front of the team. Use the conversation below to understand what's being discussed: who said what, decisions made, code shared, and what "this" or "it" refers to.`,
      "Answer the question directly and concisely. Use Markdown. Put any code in fenced code blocks with the language (```ts, ```python…), complete enough to paste and run.",
      "If something important is unclear from the conversation, say what you're assuming.",
      repo ? (host ? `The project's GitHub repo is ${repo.owner}/${repo.name} (branch ${repo.defaultBranch}). You can list and read its files with your tools when it helps; read before you rely on them.` : `The project's repo is ${repo.owner}/${repo.name}, but you can't read it (${profile.name} hasn't connected GitHub).`) : "",
      extras.join("\n\n"),
      `Recent conversation in #${channel.name} (oldest first):\n${transcript || "(no earlier messages)"}`,
    ].filter(Boolean).join("\n\n");

    let lastEmit = 0;
    let latest = "";
    const text = await streamAnswer({
      provider: key.provider,
      key: decrypt(key.keyEnc),
      model: key.model,
      system,
      prompt: `${profile.name} asks: ${prompt}`,
      host,
      onText: (full) => {
        latest = full;
        const t = Date.now();
        if (t - lastEmit > 90) { lastEmit = t; io?.to(chatRoom(channel.id)).emit(aiDeltaKey(channel.id), { messageId: answerId, text: full }); }
      },
    });
    await finish(text || latest, "done");
  } catch (e) {
    console.log("[AI_CHAT]", e);
    const msg = e instanceof AiError ? e.message : "The AI request failed. Try again.";
    await finish(`⚠️ ${msg}`, "error").catch(() => {});
  }
}
