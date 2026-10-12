import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { chatAccess } from "@/lib/access";
import { plainText } from "@/lib/format-text";

export const maxDuration = 60;

const MAX_MESSAGES = 400;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["overview", "decisions", "questionsForYou", "actionItems"],
  properties: {
    overview: { type: "array", items: { type: "string" }, description: "3-5 short bullet points, most important first" },
    decisions: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["text", "ref"], properties: { text: { type: "string" }, ref: { type: "string" } } },
    },
    questionsForYou: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["text", "ref"], properties: { text: { type: "string" }, ref: { type: "string" } } },
    },
    actionItems: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "owner", "ref"],
        properties: { text: { type: "string" }, owner: { type: "string" }, ref: { type: "string" } },
      },
    },
  },
} as const;

type Summary = {
  overview: string[];
  decisions: { text: string; ref: string }[];
  questionsForYou: { text: string; ref: string }[];
  actionItems: { text: string; owner: string; ref: string }[];
};

/**
 * AI catch-up for a busy channel: a few bullets, decisions, questions waiting
 * on you and action items, each linked to the message it came from.
 * POST { chatId, since? }   Needs ANTHROPIC_API_KEY on the server.
 */
export async function POST(req: Request) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI summaries aren't set up on this server yet." }, { status: 503 });
  }

  const { chatId, since: sinceRaw } = await req.json();
  const access = await chatAccess(profile.id, String(chatId || ""));
  if (!access || access.kind !== "channel") return new NextResponse("Not found", { status: 404 });

  const read = await db.readState.findUnique({ where: { profileId_chatId: { profileId: profile.id, chatId } } });
  const parsed = sinceRaw ? new Date(sinceRaw) : null;
  const since = parsed && !isNaN(parsed.getTime()) ? parsed : read?.lastReadAt ?? new Date(Date.now() - 86_400_000);

  const messages = await db.message.findMany({
    where: { channelId: chatId, deleted: false, createdAt: { gt: since } },
    include: { member: { include: { profile: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
    take: MAX_MESSAGES,
  });
  messages.reverse();
  if (messages.length < 3) {
    return NextResponse.json({ error: "There isn't enough new here to summarize." }, { status: 400 });
  }

  // Short refs (m1, m2, …) keep the transcript compact; we map them back to ids.
  const refToId = new Map<string, string>();
  const transcript = messages
    .map((m, i) => {
      const ref = `m${i + 1}`;
      refToId.set(ref, m.id);
      const who = m.webhookName ? `${m.webhookName} (bot)` : m.member.profile.name;
      const body = plainText(m.content) + (m.fileUrl ? " [attachment]" : "");
      return `[${ref}] ${who}${m.threadId ? " (in a thread)" : ""}: ${body}`;
    })
    .join("\n");

  const client = new Anthropic();
  let summary: Summary;
  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system:
        "You summarize a team chat channel for someone who was away. Be brief and concrete; use people's names. " +
        "Only include decisions that were clearly agreed, and questions or requests that are directed at the reader by name or are open to everyone. " +
        "Every item must cite the [m#] ref of the message it comes from in its ref field. If a section has nothing, return an empty list.",
      messages: [
        {
          role: "user",
          content: `The reader is ${profile.name}. Here is what was said in #${access.channel.name} since they last looked:\n\n${transcript}`,
        },
      ],
    } as any);
    if ((response as any).stop_reason === "refusal") {
      return NextResponse.json({ error: "The summary couldn't be generated for this channel." }, { status: 422 });
    }
    const text = (response as any).content.find((b: any) => b.type === "text")?.text ?? "";
    summary = JSON.parse(text);
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Too many summaries right now. Try again in a minute." }, { status: 429 });
    }
    if (error instanceof Anthropic.APIError) {
      console.log("[CATCHUP_AI]", error.status, error.message);
      return NextResponse.json({ error: "The summary service had a problem. Try again shortly." }, { status: 502 });
    }
    console.log("[CATCHUP_AI]", error);
    return NextResponse.json({ error: "Couldn't read the summary." }, { status: 500 });
  }

  const link = <T extends { ref: string }>(items: T[]) =>
    items.map((it) => ({ ...it, messageId: refToId.get(it.ref.replace(/[\[\]]/g, "")) ?? null }));

  return NextResponse.json({
    since,
    count: messages.length,
    overview: summary.overview,
    decisions: link(summary.decisions),
    questionsForYou: link(summary.questionsForYou),
    actionItems: link(summary.actionItems),
  });
}
