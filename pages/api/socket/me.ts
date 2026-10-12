import { NextApiRequest } from "next";

import { NextApiResponseServerIo } from "@/types";
import { currentProfilePages } from "@/lib/current-profile-pages";
import { db } from "@/lib/db";
import { getIO } from "@/lib/io";
import { isOnline } from "@/lib/presence";
import { PRESENCE_EVENT, serverRoom, type Presence } from "@/lib/socket-keys";

const clampMinutes = (v: unknown) => (v === null ? null : Number.isFinite(Number(v)) ? Math.max(0, Math.min(1439, Math.round(Number(v)))) : undefined);

/**
 * Your own settings.
 *   GET    → status, focus, quiet hours, keywords, desktop alerts
 *   PATCH  { statusText?, statusEmoji?, statusExpiresAt?, focusUntil?, focusAllow?,
 *            quietStart?, quietEnd?, timeZone?, keywords?, desktopNotify? }
 * Status changes are shown live to everyone in your servers.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponseServerIo) {
  const profile = await currentProfilePages(req);
  if (!profile) return res.status(401).json({ error: "Unauthorized" });

  const view = (p: typeof profile) => {
    const statusLive = !p.statusExpiresAt || p.statusExpiresAt.getTime() > Date.now();
    return {
      id: p.id,
      name: p.name,
      imageUrl: p.imageUrl,
      statusText: statusLive ? p.statusText : null,
      statusEmoji: statusLive ? p.statusEmoji : null,
      statusExpiresAt: statusLive ? p.statusExpiresAt : null,
      focusUntil: p.focusUntil && p.focusUntil.getTime() > Date.now() ? p.focusUntil : null,
      focusAllow: Array.isArray(p.focusAllow) ? p.focusAllow : [],
      quietStart: p.quietStart,
      quietEnd: p.quietEnd,
      timeZone: p.timeZone,
      keywords: Array.isArray(p.keywords) ? p.keywords : [],
      desktopNotify: p.desktopNotify,
    };
  };

  if (req.method === "GET") return res.status(200).json(view(profile));
  if (req.method !== "PATCH") return res.status(405).json({ error: "Method not allowed" });

  const b = req.body ?? {};
  const data: Record<string, unknown> = {};
  if ("statusText" in b) data.statusText = b.statusText ? String(b.statusText).slice(0, 80) : null;
  if ("statusEmoji" in b) data.statusEmoji = b.statusEmoji ? String(b.statusEmoji).slice(0, 16) : null;
  if ("statusExpiresAt" in b) data.statusExpiresAt = b.statusExpiresAt ? new Date(b.statusExpiresAt) : null;
  if ("focusUntil" in b) data.focusUntil = b.focusUntil ? new Date(b.focusUntil) : null;
  if ("focusAllow" in b && Array.isArray(b.focusAllow)) data.focusAllow = b.focusAllow.map(String).slice(0, 50);
  if ("quietStart" in b) data.quietStart = clampMinutes(b.quietStart);
  if ("quietEnd" in b) data.quietEnd = clampMinutes(b.quietEnd);
  if ("timeZone" in b) data.timeZone = b.timeZone ? String(b.timeZone).slice(0, 64) : null;
  if ("keywords" in b && Array.isArray(b.keywords)) {
    data.keywords = Array.from(new Set(b.keywords.map((k: unknown) => String(k).trim().toLowerCase()).filter((k: string) => k.length > 1))).slice(0, 30);
  }
  if ("desktopNotify" in b) data.desktopNotify = !!b.desktopNotify;
  for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];

  const updated = await db.profile.update({ where: { id: profile.id }, data });

  if ("statusText" in data || "statusEmoji" in data || "statusExpiresAt" in data) {
    const servers = await db.member.findMany({ where: { profileId: profile.id }, select: { serverId: true } });
    const v = view(updated);
    const p: Presence = { profileId: profile.id, online: isOnline(profile.id), statusText: v.statusText, statusEmoji: v.statusEmoji };
    servers.forEach((s) => getIO()?.to(serverRoom(s.serverId)).emit(PRESENCE_EVENT, p));
  }
  return res.status(200).json(view(updated));
}
