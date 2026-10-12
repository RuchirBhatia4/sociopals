import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { AiError, runAgent, type ChatTurn } from "@/lib/ai";
import { GithubError, githubTokenFor, listFiles, readFile } from "@/lib/github";
import { projectAccess, repoOf } from "@/lib/project";

export const maxDuration = 300;

async function load(profileId: string, taskId: string) {
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task) return null;
  const p = await projectAccess(profileId, task.channelId);
  return p ? { task, ...p } : null;
}

/** Your AI chat on this task: GET */
export async function GET(_req: Request, { params }: { params: { taskId: string } }) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  if (!(await load(profile.id, params.taskId))) return new NextResponse("Not found", { status: 404 });
  const messages = await db.taskAiMessage.findMany({
    where: { taskId: params.taskId, profileId: profile.id },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  return NextResponse.json(messages);
}

/** Ask the AI: POST { message, aiKeyId } — only with your own key. */
export async function POST(req: Request, { params }: { params: { taskId: string } }) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const ctx = await load(profile.id, params.taskId);
  if (!ctx) return new NextResponse("Not found", { status: 404 });
  const { task, channel } = ctx;

  const { message, aiKeyId } = await req.json();
  const text = String(message || "").trim().slice(0, 8000);
  if (!text) return NextResponse.json({ error: "Write something first" }, { status: 400 });

  const key = await db.aiKey.findUnique({ where: { id: String(aiKeyId || "") } });
  if (!key) return NextResponse.json({ error: "Pick an AI first" }, { status: 400 });
  if (key.profileId !== profile.id) return NextResponse.json({ error: "Only its owner can use that AI. Add your own key in Settings → AI keys." }, { status: 403 });

  // Repo access through your own GitHub; without it the AI just can't look at files.
  const repo = repoOf(channel);
  const gh = await githubTokenFor(profile.id);
  const ref = task.branch ?? repo?.defaultBranch ?? "main";
  let files: string[] | null = null;
  const host = {
    listFiles: async () => {
      if (!repo || !gh) return [];
      files ??= await listFiles(gh.token, repo, ref);
      return files;
    },
    readFile: async (path: string) => (repo && gh ? readFile(gh.token, repo, ref, path) : null),
  };

  let tree = "";
  try {
    const all = await host.listFiles();
    tree = all.slice(0, 250).join("\n") + (all.length > 250 ? `\n…and ${all.length - 250} more (use list_files)` : "");
  } catch (e) {
    tree = e instanceof GithubError ? `(couldn't list files: ${e.message})` : "(couldn't list files)";
  }

  const system = [
    "You are a senior engineer pairing with a teammate inside a team chat app, helping with one task in their project.",
    repo ? `Repository: ${repo.owner}/${repo.name}. You are looking at branch "${ref}"${task.branch ? " (the task branch)" : " (no task branch yet: the main branch, read-only)"}.` : "No GitHub repo is linked yet, so you can't read files.",
    !gh && repo ? "The person hasn't connected GitHub, so you can't read files; say so if it matters." : "",
    `Task #${task.number}: ${task.title}`,
    task.description ? `Details:\n${task.description}` : "",
    tree ? `Files in the branch:\n${tree}` : "",
    "Read the files you need before changing them. Be concise. When you have concrete code changes, call propose_changes with complete file contents;",
    "the person reviews a diff and decides whether to commit it." + (task.branch ? "" : " (They need to open a branch before applying; mention that if you propose changes.)"),
  ].filter(Boolean).join("\n\n");

  const past = await db.taskAiMessage.findMany({
    where: { taskId: task.id, profileId: profile.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const history: ChatTurn[] = [
    ...past.reverse().map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content + (m.proposal ? `\n\n[You proposed changes to: ${((m.proposal as any).files ?? []).map((f: any) => f.path).join(", ")}${m.appliedAt ? " — committed" : " — not applied"}]` : ""),
    })),
    { role: "user", content: text },
  ];

  const userMsg = await db.taskAiMessage.create({ data: { taskId: task.id, profileId: profile.id, role: "user", content: text } });
  try {
    const out = await runAgent({ provider: key.provider, key: decrypt(key.keyEnc), model: key.model, system, history, host });
    let proposal: Prisma.InputJsonValue | undefined;
    if (out.proposal) {
      // Keep the original files beside the new ones so the diff can be shown.
      const withOriginals = await Promise.all(
        out.proposal.files.map(async (f) => ({ ...f, original: f.action === "create" ? null : await host.readFile(f.path).catch(() => null) }))
      );
      proposal = { summary: out.proposal.summary, files: withOriginals } as unknown as Prisma.InputJsonValue;
    }
    const reply = await db.taskAiMessage.create({
      data: { taskId: task.id, profileId: profile.id, role: "assistant", content: out.text, aiLabel: `${key.label} · ${key.model}`, proposal },
    });
    return NextResponse.json({ user: userMsg, reply });
  } catch (e) {
    await db.taskAiMessage.delete({ where: { id: userMsg.id } }).catch(() => {});
    if (e instanceof AiError || e instanceof GithubError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.log("[TASK_AI]", e);
    return NextResponse.json({ error: "The AI request failed. Try again." }, { status: 500 });
  }
}
