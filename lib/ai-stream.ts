import Anthropic from "@anthropic-ai/sdk";
import { AiProvider } from "@prisma/client";

import { AiError, type ToolHost } from "@/lib/ai";

/*
  Streams an answer from someone's own Claude or ChatGPT key, calling onText with
  the full text so far. If a repo host is given, the model may list and read files
  (read-only) before answering.
*/

const TOOLS = [
  {
    name: "list_files",
    description: "List file paths in the project's GitHub repo, optionally under a folder prefix.",
    schema: { type: "object", properties: { prefix: { type: "string" } } },
  },
  {
    name: "read_file",
    description: "Read one text file from the project's GitHub repo.",
    schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  },
];

async function runTool(host: ToolHost, name: string, input: any): Promise<string> {
  try {
    if (name === "list_files") {
      const prefix = typeof input?.prefix === "string" ? input.prefix.replace(/^\/+/, "") : "";
      const all = (await host.listFiles()).filter((p) => p.startsWith(prefix)).slice(0, 400);
      return all.length ? all.join("\n") : "(no files)";
    }
    if (name === "read_file") {
      const path = String(input?.path ?? "").replace(/^\/+/, "");
      if (!path || path.includes("..")) return "Invalid path";
      const text = await host.readFile(path);
      if (text === null) return `(${path} doesn't exist, is binary, or is too large)`;
      return text.length > 60_000 ? text.slice(0, 60_000) + "\n…(truncated)" : text;
    }
    return `Unknown tool ${name}`;
  } catch (e: any) {
    return `Error: ${e?.message ?? e}`;
  }
}

export type StreamArgs = {
  provider: AiProvider;
  key: string;
  model: string;
  system: string;
  prompt: string;
  host?: ToolHost | null;
  onText: (full: string) => void;
};

const MAX_STEPS = 6;

export async function streamAnswer(a: StreamArgs): Promise<string> {
  return a.provider === "ANTHROPIC" ? streamClaude(a) : streamOpenAI(a);
}

async function streamClaude({ key, model, system, prompt, host, onText }: StreamArgs) {
  const client = new Anthropic({ apiKey: key });
  const tools: Anthropic.Tool[] | undefined = host ? TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.schema as any })) : undefined;
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
  let text = "";
  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const stream = client.messages.stream({ model, max_tokens: 8000, system, messages, ...(tools ? { tools } : {}) });
      const before = text;
      stream.on("text", (delta) => { text += delta; onText(text); });
      const msg = await stream.finalMessage();
      if (msg.stop_reason === "refusal") break;
      if (msg.stop_reason === "pause_turn") { messages.push({ role: "assistant", content: msg.content }); continue; }
      const uses = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (msg.stop_reason !== "tool_use" || !uses.length || !host) break;
      // Keep the answer readable: text written before a tool call is a "thinking out loud" line.
      if (text !== before && !text.endsWith("\n\n")) { text += "\n\n"; onText(text); }
      messages.push({ role: "assistant", content: msg.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const u of uses) results.push({ type: "tool_result", tool_use_id: u.id, content: await runTool(host, u.name, u.input) });
      messages.push({ role: "user", content: results });
    }
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new AiError(400, "Your Claude key stopped working. Update it in Settings → AI keys.");
    if (e instanceof Anthropic.RateLimitError) throw new AiError(429, "Claude is rate-limiting your key. Try again in a minute.");
    if (e instanceof Anthropic.NotFoundError) throw new AiError(400, `Your key can't use the model ${model}. Pick another in Settings → AI keys.`);
    if (e instanceof Anthropic.APIError) throw new AiError(502, `Claude error: ${e.message}`);
    throw e;
  }
  return text.trim();
}

async function streamOpenAI({ key, model, system, prompt, host, onText }: StreamArgs) {
  const tools = host ? TOOLS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.schema } })) : undefined;
  const messages: any[] = [{ role: "system", content: system }, { role: "user", content: prompt }];
  let text = "";

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: true, ...(tools ? { tools } : {}) }),
    });
    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) throw new AiError(400, "Your OpenAI key stopped working. Update it in Settings → AI keys.");
      if (res.status === 429) throw new AiError(429, data?.error?.message ?? "OpenAI is rate-limiting your key (or it's out of credit).");
      throw new AiError(502, `OpenAI error: ${data?.error?.message ?? res.status}`);
    }
    // Server-sent events: text deltas, and tool calls arriving in pieces.
    const calls: { id: string; name: string; args: string }[] = [];
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let finish = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") continue;
        let chunk: any;
        try { chunk = JSON.parse(payload); } catch { continue; }
        const choice = chunk.choices?.[0];
        if (!choice) continue;
        if (choice.delta?.content) { text += choice.delta.content; onText(text); }
        for (const tc of choice.delta?.tool_calls ?? []) {
          const c = (calls[tc.index] ??= { id: "", name: "", args: "" });
          if (tc.id) c.id = tc.id;
          if (tc.function?.name) c.name += tc.function.name;
          if (tc.function?.arguments) c.args += tc.function.arguments;
        }
        if (choice.finish_reason) finish = choice.finish_reason;
      }
    }
    if (finish !== "tool_calls" || !calls.length || !host) break;
    if (text && !text.endsWith("\n\n")) { text += "\n\n"; onText(text); }
    messages.push({ role: "assistant", content: null, tool_calls: calls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.args } })) });
    for (const c of calls) {
      let input: any = {};
      try { input = JSON.parse(c.args || "{}"); } catch {}
      messages.push({ role: "tool", tool_call_id: c.id, content: await runTool(host, c.name, input) });
    }
  }
  return text.trim();
}
