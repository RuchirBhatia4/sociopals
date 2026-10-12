import Anthropic from "@anthropic-ai/sdk";
import { AiProvider } from "@prisma/client";

import type { FileChange } from "@/lib/github";

/*
  One small agent loop that works with each person's own Claude or ChatGPT key.
  Tools let the model look around the repo and, when it has code, propose changes.
  Proposals are never committed here: the person reviews the diff and presses Apply.
*/

export const PROVIDER_LABEL: Record<AiProvider, string> = { ANTHROPIC: "Claude", OPENAI: "ChatGPT" };
export const DEFAULT_MODEL: Record<AiProvider, string> = { ANTHROPIC: "claude-opus-5-5", OPENAI: "gpt-5" };

export class AiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Check a key works and return the models it can use (for the picker). */
export async function listModels(provider: AiProvider, key: string): Promise<string[]> {
  if (provider === "ANTHROPIC") {
    try {
      const client = new Anthropic({ apiKey: key });
      const page = await client.models.list({ limit: 50 });
      return page.data.map((m) => m.id);
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw new AiError(400, "That Claude key isn't valid.");
      throw new AiError(502, "Couldn't reach Anthropic to check the key.");
    }
  }
  const res = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${key}` } });
  if (res.status === 401) throw new AiError(400, "That OpenAI key isn't valid.");
  if (!res.ok) throw new AiError(502, "Couldn't reach OpenAI to check the key.");
  const data = await res.json();
  return (data.data as { id: string }[])
    .map((m) => m.id)
    .filter((id) => /^(gpt-|o\d|chatgpt-)/.test(id) && !/(audio|realtime|tts|transcribe|image|search|embedding|instruct)/.test(id))
    .sort()
    .reverse();
}

/* ---------- tools ---------- */

export type ToolHost = {
  listFiles: (prefix?: string) => Promise<string[]>;
  readFile: (path: string) => Promise<string | null>;
};

const TOOLS = [
  {
    name: "list_files",
    description: "List file paths in the task branch. Optionally only those under a folder prefix.",
    schema: { type: "object", properties: { prefix: { type: "string", description: "Folder prefix, e.g. 'src/components'" } } },
  },
  {
    name: "read_file",
    description: "Read one text file from the task branch.",
    schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  },
  {
    name: "propose_changes",
    description:
      "Propose code changes for the person to review. Give the COMPLETE new content of every file you create or update (not a diff). " +
      "Only call this when you have working code; the person will see a diff and decide whether to commit it to their branch.",
    schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "One-line commit message" },
        files: {
          type: "array",
          items: {
            type: "object",
            properties: {
              path: { type: "string" },
              action: { type: "string", enum: ["create", "update", "delete"] },
              content: { type: "string", description: "Full file content (omit for delete)" },
            },
            required: ["path", "action"],
          },
        },
      },
      required: ["summary", "files"],
    },
  },
] as const;

export type Proposal = { summary: string; files: FileChange[] };
export type ChatTurn = { role: "user" | "assistant"; content: string };

const safePath = (p: unknown) => {
  const s = String(p ?? "").replace(/^\/+/, "");
  if (!s || s.includes("..") || s.startsWith(".git/") || s.length > 300) throw new Error(`Invalid path: ${s}`);
  return s;
};

async function runTool(host: ToolHost, name: string, input: any): Promise<{ result: string; proposal?: Proposal }> {
  try {
    if (name === "list_files") {
      const all = await host.listFiles();
      const prefix = typeof input?.prefix === "string" ? input.prefix.replace(/^\/+/, "") : "";
      const hits = all.filter((p) => p.startsWith(prefix)).slice(0, 400);
      return { result: hits.length ? hits.join("\n") : "(no files)" };
    }
    if (name === "read_file") {
      const path = safePath(input?.path);
      const text = await host.readFile(path);
      if (text === null) return { result: `(${path} doesn't exist, is binary, or is too large)` };
      return { result: text.length > 60_000 ? text.slice(0, 60_000) + "\n…(truncated)" : text };
    }
    if (name === "propose_changes") {
      const files: FileChange[] = (Array.isArray(input?.files) ? input.files : []).slice(0, 25).map((f: any) => ({
        path: safePath(f.path),
        action: ["create", "update", "delete"].includes(f.action) ? f.action : "update",
        content: f.action === "delete" ? undefined : String(f.content ?? ""),
      }));
      if (!files.length) return { result: "No files given; nothing proposed." };
      return { result: "Proposal shown to the person for review.", proposal: { summary: String(input?.summary || "Update files").slice(0, 120), files } };
    }
    return { result: `Unknown tool ${name}` };
  } catch (e: any) {
    return { result: `Error: ${e?.message ?? e}` };
  }
}

const MAX_STEPS = 10;

/** Run the agent on a conversation; returns its reply and, if it made one, a proposal. */
export async function runAgent(args: {
  provider: AiProvider;
  key: string;
  model: string;
  system: string;
  history: ChatTurn[];
  host: ToolHost;
}): Promise<{ text: string; proposal: Proposal | null }> {
  return args.provider === "ANTHROPIC" ? runClaude(args) : runOpenAI(args);
}

async function runClaude({ key, model, system, history, host }: Parameters<typeof runAgent>[0]) {
  const client = new Anthropic({ apiKey: key });
  const tools: Anthropic.Tool[] = TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.schema as any }));
  const messages: Anthropic.MessageParam[] = history.map((h) => ({ role: h.role, content: h.content }));
  let proposal: Proposal | null = null;
  const texts: string[] = [];

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const message = await client.messages.stream({ model, max_tokens: 16000, system, tools, messages }).finalMessage();
      for (const b of message.content) if (b.type === "text" && b.text.trim()) texts.push(b.text.trim());
      if (message.stop_reason === "refusal") break;
      if (message.stop_reason === "pause_turn") { messages.push({ role: "assistant", content: message.content }); continue; }
      const uses = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (message.stop_reason !== "tool_use" || !uses.length) break;
      messages.push({ role: "assistant", content: message.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const u of uses) {
        const r = await runTool(host, u.name, u.input);
        if (r.proposal) proposal = r.proposal;
        results.push({ type: "tool_result", tool_use_id: u.id, content: r.result });
      }
      messages.push({ role: "user", content: results });
      if (proposal) {
        // Let it say one short line about the proposal, then stop.
        const wrap = await client.messages.stream({ model, max_tokens: 2000, system, tools, tool_choice: { type: "none" } as any, messages }).finalMessage();
        for (const b of wrap.content) if (b.type === "text" && b.text.trim()) texts.push(b.text.trim());
        break;
      }
    }
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new AiError(400, "This Claude key stopped working. Update it in Settings → AI keys.");
    if (e instanceof Anthropic.RateLimitError) throw new AiError(429, "Claude is rate-limiting this key. Try again in a minute.");
    if (e instanceof Anthropic.NotFoundError) throw new AiError(400, `This key can't use the model ${model}. Pick another in Settings → AI keys.`);
    if (e instanceof Anthropic.APIError) throw new AiError(502, `Claude error: ${e.message}`);
    throw e;
  }
  return { text: texts.join("\n\n") || (proposal ? "Here are the changes." : "(no reply)"), proposal };
}

async function runOpenAI({ key, model, system, history, host }: Parameters<typeof runAgent>[0]) {
  const tools = TOOLS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.schema } }));
  const messages: any[] = [{ role: "system", content: system }, ...history.map((h) => ({ role: h.role, content: h.content }))];
  let proposal: Proposal | null = null;
  const texts: string[] = [];

  const call = async (extra: object = {}) => {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, tools, ...extra }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) throw new AiError(400, "This OpenAI key stopped working. Update it in Settings → AI keys.");
    if (res.status === 429) throw new AiError(429, data?.error?.message ?? "OpenAI is rate-limiting this key (or it's out of credit).");
    if (!res.ok) throw new AiError(502, `OpenAI error: ${data?.error?.message ?? res.status}`);
    return data.choices[0].message;
  };

  for (let step = 0; step < MAX_STEPS; step++) {
    const msg = await call();
    if (msg.content?.trim()) texts.push(msg.content.trim());
    if (!msg.tool_calls?.length) break;
    messages.push(msg);
    for (const tc of msg.tool_calls) {
      let input: any = {};
      try { input = JSON.parse(tc.function.arguments || "{}"); } catch {}
      const r = await runTool(host, tc.function.name, input);
      if (r.proposal) proposal = r.proposal;
      messages.push({ role: "tool", tool_call_id: tc.id, content: r.result });
    }
    if (proposal) {
      const wrap = await call({ tool_choice: "none" });
      if (wrap.content?.trim()) texts.push(wrap.content.trim());
      break;
    }
  }
  return { text: texts.join("\n\n") || (proposal ? "Here are the changes." : "(no reply)"), proposal };
}
