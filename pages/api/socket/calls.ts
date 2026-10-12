import { NextApiRequest } from "next";
import { Prisma } from "@prisma/client";

import { NextApiResponseServerIo } from "@/types";
import { currentProfilePages } from "@/lib/current-profile-pages";
import { db } from "@/lib/db";
import { chatAccess } from "@/lib/access";
import { postChannelMessage } from "@/lib/post-message";
import { firstUrl } from "@/lib/link-preview";

type Participant = { profileId: string; name: string; joinedAt: string; leftAt?: string };

const minutes = (ms: number) => {
  const m = Math.max(1, Math.round(ms / 60_000));
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
};

/**
 * Voice/video presence for the call recap. POST { channelId, action: "join" | "leave" }.
 * When the last person leaves, a recap is posted in the channel: who was there,
 * how long it ran, and any links shared in the channel during the call.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponseServerIo) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const profile = await currentProfilePages(req);
  if (!profile) return res.status(401).json({ error: "Unauthorized" });

  const { channelId, action } = req.body ?? {};
  const access = await chatAccess(profile.id, String(channelId));
  if (!access || access.kind !== "channel" || access.channel.type === "TEXT") {
    return res.status(404).json({ error: "Call not found" });
  }

  let session = await db.callSession.findFirst({ where: { channelId: access.channel.id, endedAt: null }, orderBy: { startedAt: "desc" } });
  const now = new Date();

  if (action === "join") {
    if (!session) {
      session = await db.callSession.create({
        data: { channelId: access.channel.id, participants: [] as Prisma.InputJsonValue, active: [] as Prisma.InputJsonValue },
      });
    }
    const participants = (session.participants as Participant[]) ?? [];
    const active = new Set((session.active as string[]) ?? []);
    if (!participants.some((p) => p.profileId === profile.id && !p.leftAt)) {
      participants.push({ profileId: profile.id, name: profile.name, joinedAt: now.toISOString() });
    }
    active.add(profile.id);
    await db.callSession.update({
      where: { id: session.id },
      data: { participants: participants as Prisma.InputJsonValue, active: Array.from(active) as Prisma.InputJsonValue },
    });
    return res.status(200).json({ ok: true });
  }

  if (action === "leave" && session) {
    const participants = ((session.participants as Participant[]) ?? []).map((p) =>
      p.profileId === profile.id && !p.leftAt ? { ...p, leftAt: now.toISOString() } : p
    );
    const active = ((session.active as string[]) ?? []).filter((id) => id !== profile.id);
    const ended = active.length === 0;
    await db.callSession.update({
      where: { id: session.id },
      data: {
        participants: participants as Prisma.InputJsonValue,
        active: active as Prisma.InputJsonValue,
        endedAt: ended ? now : null,
      },
    });

    if (ended) {
      const duration = now.getTime() - session.startedAt.getTime();
      const names = Array.from(new Set(participants.map((p) => p.name)));
      // Recaps for calls under a minute with one person are just noise.
      if (duration >= 60_000 || names.length > 1) {
        const shared = await db.message.findMany({
          where: { channelId: access.channel.id, createdAt: { gte: session.startedAt, lte: now }, deleted: false, system: false },
          select: { content: true },
          take: 200,
        });
        const links = Array.from(new Set(shared.map((m) => firstUrl(m.content)).filter(Boolean))) as string[];
        const lines = [
          `**Call recap** · ${minutes(duration)} · ${names.length} ${names.length === 1 ? "person" : "people"}`,
          `With ${names.join(", ")}`,
          ...(links.length ? ["Links shared:", ...links.slice(0, 8).map((l) => `• ${l}`)] : []),
        ];
        const member = await db.member.findUnique({ where: { id: access.member.id }, include: { profile: true } });
        if (member) {
          const recap = await postChannelMessage({ member, channel: access.channel, content: lines.join("\n"), system: true });
          await db.callSession.update({ where: { id: session.id }, data: { recapMessageId: recap.id } });
        }
      }
    }
    return res.status(200).json({ ok: true, ended });
  }

  return res.status(200).json({ ok: true });
}
