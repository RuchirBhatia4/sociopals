import { NextResponse } from "next/server";
import { AiProvider } from "@prisma/client";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { AiError, DEFAULT_MODEL, PROVIDER_LABEL, listModels } from "@/lib/ai";

/*
  Your own AI keys. Only you ever see the last 4 characters, and only you can
  change, remove or use them. The full key never leaves the server.
*/
const view = (k: { id: string; provider: AiProvider; label: string; model: string; last4: string; updatedAt: Date }) => ({
  id: k.id, provider: k.provider, label: k.label, model: k.model, last4: k.last4, updatedAt: k.updatedAt,
});

export async function GET() {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const keys = await db.aiKey.findMany({ where: { profileId: profile.id }, orderBy: { createdAt: "asc" } });
  return NextResponse.json(keys.map(view));
}

/** Add or replace: POST { provider, key, model? } (checked against the provider first) */
export async function POST(req: Request) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const { provider, key, model } = await req.json();
  if (!Object.values(AiProvider).includes(provider)) return NextResponse.json({ error: "Pick Claude or ChatGPT" }, { status: 400 });
  const clean = String(key || "").trim();
  if (clean.length < 20) return NextResponse.json({ error: "That doesn't look like an API key" }, { status: 400 });

  let models: string[];
  try {
    models = await listModels(provider, clean);
  } catch (e) {
    if (e instanceof AiError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  const chosen = model && models.includes(model) ? model : models.includes(DEFAULT_MODEL[provider as AiProvider]) ? DEFAULT_MODEL[provider as AiProvider] : models[0];
  if (!chosen) return NextResponse.json({ error: "This key has no chat models available" }, { status: 400 });

  const data = {
    label: `${profile.name.split(" ")[0]}'s ${PROVIDER_LABEL[provider as AiProvider]}`,
    model: chosen,
    keyEnc: encrypt(clean),
    last4: clean.slice(-4),
  };
  const saved = await db.aiKey.upsert({
    where: { profileId_provider: { profileId: profile.id, provider } },
    create: { profileId: profile.id, provider, ...data },
    update: data,
  });
  return NextResponse.json({ ...view(saved), models });
}

/** Change the model: PATCH { id, model } */
export async function PATCH(req: Request) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const { id, model } = await req.json();
  const k = await db.aiKey.findFirst({ where: { id: String(id), profileId: profile.id } });
  if (!k) return new NextResponse("Not found", { status: 404 });
  const saved = await db.aiKey.update({ where: { id: k.id }, data: { model: String(model).slice(0, 100) } });
  return NextResponse.json(view(saved));
}

/** Remove: DELETE ?id= */
export async function DELETE(req: Request) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const id = new URL(req.url).searchParams.get("id") || "";
  await db.aiKey.deleteMany({ where: { id, profileId: profile.id } });
  return NextResponse.json({ ok: true });
}
