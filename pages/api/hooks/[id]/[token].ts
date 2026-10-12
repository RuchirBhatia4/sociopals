import { NextApiRequest } from "next";
import { timingSafeEqual } from "crypto";

import { NextApiResponseServerIo } from "@/types";
import { db } from "@/lib/db";
import { PostError, postChannelMessage } from "@/lib/post-message";

/**
 * Incoming webhook (public, no login): POST /api/hooks/<id>/<token>
 *   { content, username?, avatarUrl? }
 * The secret token in the URL is the only key, so treat it like a password.
 * GitHub-style JSON (with "text" instead of "content") also works.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponseServerIo) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  const { id, token } = req.query as { id: string; token: string };

  const hook = await db.webhook.findUnique({ where: { id: String(id) }, include: { channel: { include: { server: true } } } });
  const a = Buffer.from(String(hook?.token ?? ""));
  const b = Buffer.from(String(token ?? ""));
  if (!hook || a.length !== b.length || !timingSafeEqual(a, b)) {
    return res.status(404).json({ error: "Unknown webhook" });
  }

  const body = req.body ?? {};
  const content = String(body.content ?? body.text ?? "").slice(0, 4000);
  if (!content.trim()) return res.status(400).json({ error: "content is required" });

  // Webhook messages are posted on behalf of the person who created the hook,
  // but shown with the webhook's own name and a BOT badge.
  const member = await db.member.findUnique({ where: { id: hook.createdById }, include: { profile: true } });
  if (!member || member.serverId !== hook.serverId) return res.status(410).json({ error: "Webhook owner left the server" });

  try {
    const message = await postChannelMessage({
      member,
      channel: hook.channel,
      content,
      webhook: {
        id: hook.id,
        name: typeof body.username === "string" && body.username.trim() ? body.username.trim().slice(0, 40) : hook.name,
        avatarUrl: typeof body.avatarUrl === "string" && body.avatarUrl.startsWith("https://") ? body.avatarUrl : hook.avatarUrl,
      },
    });
    return res.status(200).json({ id: message.id });
  } catch (e) {
    if (e instanceof PostError) return res.status(e.status).json({ error: e.message });
    console.log("[WEBHOOK]", e);
    return res.status(500).json({ error: "Internal Error" });
  }
}
