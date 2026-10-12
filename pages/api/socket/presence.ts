import { NextApiRequest } from "next";

import { NextApiResponseServerIo } from "@/types";
import { currentProfilePages } from "@/lib/current-profile-pages";
import { db } from "@/lib/db";
import { isOnline } from "@/lib/presence";

/** Who in this server is online, with live statuses: GET ?serverId= */
export default async function handler(req: NextApiRequest, res: NextApiResponseServerIo) {
  const profile = await currentProfilePages(req);
  if (!profile) return res.status(401).json({ error: "Unauthorized" });
  const serverId = String(req.query.serverId || "");
  const me = await db.member.findFirst({ where: { serverId, profileId: profile.id }, select: { id: true } });
  if (!me) return res.status(404).json({ error: "Not found" });

  const members = await db.member.findMany({
    where: { serverId },
    select: { profile: { select: { id: true, statusText: true, statusEmoji: true, statusExpiresAt: true, lastSeenAt: true } } },
  });
  const now = Date.now();
  return res.status(200).json(
    members.map(({ profile: p }) => {
      const live = !p.statusExpiresAt || p.statusExpiresAt.getTime() > now;
      return {
        profileId: p.id,
        online: isOnline(p.id),
        statusText: live ? p.statusText : null,
        statusEmoji: live ? p.statusEmoji : null,
        lastSeenAt: p.lastSeenAt,
      };
    })
  );
}
