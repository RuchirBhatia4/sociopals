import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";

async function manager(profileId: string, channelId: string) {
  const channel = await db.channel.findUnique({ where: { id: channelId } });
  if (!channel || channel.type !== "TEXT" || channel.isGroupDm) return null;
  const member = await db.member.findFirst({
    where: { serverId: channel.serverId, profileId },
    include: { customRoles: { include: { role: true } } },
  });
  if (!member || !can(member, "MANAGE_WEBHOOKS")) return null;
  return { channel, member };
}

const urlFor = (req: Request, id: string, token: string) => `${new URL(req.url).origin}/api/hooks/${id}/${token}`;

/** Webhooks for a channel (Manage webhooks): GET ?channelId= */
export async function GET(req: Request) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const channelId = new URL(req.url).searchParams.get("channelId") || "";
  if (!(await manager(profile.id, channelId))) return new NextResponse("Not allowed", { status: 403 });
  const hooks = await db.webhook.findMany({ where: { channelId }, orderBy: { createdAt: "asc" } });
  return NextResponse.json(hooks.map((h) => ({ id: h.id, name: h.name, avatarUrl: h.avatarUrl, createdAt: h.createdAt, url: urlFor(req, h.id, h.token) })));
}

/** Create: POST { channelId, name, avatarUrl? }  →  includes the secret URL */
export async function POST(req: Request) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const { channelId, name, avatarUrl } = await req.json();
  const m = await manager(profile.id, String(channelId || ""));
  if (!m) return new NextResponse("Not allowed", { status: 403 });
  const clean = String(name || "").trim().slice(0, 40);
  if (!clean) return new NextResponse("Name the webhook", { status: 400 });
  const hook = await db.webhook.create({
    data: {
      name: clean,
      avatarUrl: typeof avatarUrl === "string" && avatarUrl.startsWith("https://") ? avatarUrl : null,
      token: randomBytes(32).toString("base64url"),
      channelId: m.channel.id,
      serverId: m.channel.serverId,
      createdById: m.member.id,
    },
  });
  return NextResponse.json({ id: hook.id, name: hook.name, avatarUrl: hook.avatarUrl, createdAt: hook.createdAt, url: urlFor(req, hook.id, hook.token) });
}

/** Delete: DELETE ?id= */
export async function DELETE(req: Request) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const id = new URL(req.url).searchParams.get("id") || "";
  const hook = await db.webhook.findUnique({ where: { id } });
  if (!hook || !(await manager(profile.id, hook.channelId))) return new NextResponse("Not allowed", { status: 403 });
  await db.webhook.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
