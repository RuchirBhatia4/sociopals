import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";

/*
  Run code on the Sociopals code runner (deploy/code-runner), for the languages a
  browser can't run (C, C++, Java, Go, Rust…). Signed-in people only, with limits
  per person so one person can't hog the free server.
*/
export const maxDuration = 60;

const URL_ = process.env.CODE_RUNNER_URL?.replace(/\/$/, "");
const TOKEN = process.env.CODE_RUNNER_TOKEN;
const PER_MINUTE = 8;
const PER_DAY = 150;

let cache: { at: number; langs: { id: string; label: string }[] } | null = null;

async function runner(path: string, init?: RequestInit, timeoutMs = 10_000) {
  return fetch(`${URL_}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
}

/** Which languages the runner has: GET → { configured, languages } */
export async function GET() {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  if (!URL_ || !TOKEN) return NextResponse.json({ configured: false, languages: [] });
  if (cache && Date.now() - cache.at < 5 * 60_000) return NextResponse.json({ configured: true, languages: cache.langs });
  try {
    const r = await runner("/languages");
    if (!r.ok) throw new Error(String(r.status));
    const langs = ((await r.json()) as { id: string; label: string }[]).map(({ id, label }) => ({ id, label }));
    cache = { at: Date.now(), langs };
    return NextResponse.json({ configured: true, languages: langs });
  } catch {
    return NextResponse.json({ configured: true, online: false, languages: cache?.langs ?? [] });
  }
}

/** Run: POST { language, code, stdin? } */
export async function POST(req: Request) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  if (!URL_ || !TOKEN) return NextResponse.json({ error: "The code runner isn't set up on this server yet." }, { status: 503 });

  const { language, code, stdin } = await req.json().catch(() => ({}));
  if (typeof code !== "string" || !code.trim()) return NextResponse.json({ error: "Nothing to run" }, { status: 400 });
  if (code.length > 64 * 1024) return NextResponse.json({ error: "That's too much code to run here (64 KB max)." }, { status: 400 });

  const now = Date.now();
  const [lastMinute, today] = await Promise.all([
    db.codeRun.count({ where: { profileId: profile.id, createdAt: { gt: new Date(now - 60_000) } } }),
    db.codeRun.count({ where: { profileId: profile.id, createdAt: { gt: new Date(now - 86_400_000) } } }),
  ]);
  if (lastMinute >= PER_MINUTE) return NextResponse.json({ error: "Slow down a little: try again in a minute." }, { status: 429 });
  if (today >= PER_DAY) return NextResponse.json({ error: `You've used today's ${PER_DAY} runs. They reset over the next 24 hours.` }, { status: 429 });

  const started = Date.now();
  try {
    const r = await runner("/run", { method: "POST", body: JSON.stringify({ language: String(language), code, stdin: typeof stdin === "string" ? stdin : "" }) }, 50_000);
    const data = await r.json().catch(() => ({}));
    await db.codeRun.create({ data: { profileId: profile.id, language: String(language).slice(0, 30), ms: data.ms ?? Date.now() - started, ok: r.ok } });
    if (!r.ok) return NextResponse.json({ error: data.error ?? "The runner couldn't run that." }, { status: r.status === 503 ? 503 : 502 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "The code runner didn't answer. It may be offline; try again soon." }, { status: 502 });
  }
}
