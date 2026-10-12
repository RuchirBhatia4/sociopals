import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { AiError, listModels } from "@/lib/ai";

/** Models your saved key can use: GET ?id= */
export async function GET(req: Request) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const k = await db.aiKey.findFirst({ where: { id: new URL(req.url).searchParams.get("id") || "", profileId: profile.id } });
  if (!k) return new NextResponse("Not found", { status: 404 });
  try {
    return NextResponse.json(await listModels(k.provider, decrypt(k.keyEnc)));
  } catch (e) {
    if (e instanceof AiError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
