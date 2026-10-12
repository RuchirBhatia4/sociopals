import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { GithubError, gh, githubConfigured, githubTokenFor } from "@/lib/github";
import { PROVIDER_LABEL } from "@/lib/ai";
import { encrypt } from "@/lib/crypto";
import { projectAccess, repoUrl } from "@/lib/project";

/** Everything the project screens need: GET */
export async function GET(_req: Request, { params }: { params: { channelId: string } }) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const p = await projectAccess(profile.id, params.channelId);
  if (!p) return new NextResponse("Not found", { status: 404 });
  const { channel, member } = p;

  const audience = channel.isPrivate
    ? await db.member.findMany({ where: { channelMemberships: { some: { channelId: channel.id } } }, include: { profile: true } })
    : await db.member.findMany({ where: { serverId: channel.serverId }, include: { profile: true } });

  const [setup, github, keys] = await Promise.all([
    db.projectSetup.findUnique({ where: { channelId_memberId: { channelId: channel.id, memberId: member.id } } }),
    db.githubAccount.findUnique({ where: { profileId: profile.id } }),
    db.aiKey.findMany({ where: { profileId: { in: audience.map((m) => m.profileId) } }, orderBy: { createdAt: "asc" } }),
  ]);

  return NextResponse.json({
    channel: {
      id: channel.id,
      name: channel.name,
      repo: channel.repoOwner ? { owner: channel.repoOwner, name: channel.repoName, defaultBranch: channel.repoDefaultBranch, url: repoUrl(channel) } : null,
      webhook: !!channel.repoWebhookId,
    },
    me: { memberId: member.id, profileId: profile.id, canManage: can(member, "MANAGE_CHANNELS") },
    setupDone: !!setup?.completedAt,
    github: { configured: githubConfigured(), connected: !!github, login: github?.login ?? null },
    // Everyone sees whose AI is connected; only the owner sees the last digits.
    ais: keys.map((k) => {
      const owner = audience.find((m) => m.profileId === k.profileId)!;
      const mine = k.profileId === profile.id;
      return {
        id: k.id,
        provider: k.provider,
        providerLabel: PROVIDER_LABEL[k.provider],
        label: k.label,
        ownerName: owner.profile.name,
        ownerImage: owner.profile.imageUrl,
        mine,
        model: mine ? k.model : undefined,
        last4: mine ? k.last4 : undefined,
      };
    }),
    members: audience.map((m) => ({ id: m.id, name: m.profile.name, imageUrl: m.profile.imageUrl })),
  });
}

/**
 * POST { type: "setup:complete" }                   finish the joining steps
 * POST { type: "link", owner, name }                 link a GitHub repo (Manage channels)
 */
export async function POST(req: Request, { params }: { params: { channelId: string } }) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const p = await projectAccess(profile.id, params.channelId);
  if (!p) return new NextResponse("Not found", { status: 404 });
  const body = await req.json();

  if (body.type === "setup:complete") {
    await db.projectSetup.upsert({
      where: { channelId_memberId: { channelId: p.channel.id, memberId: p.member.id } },
      create: { channelId: p.channel.id, memberId: p.member.id, completedAt: new Date() },
      update: { completedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  if (body.type === "link") {
    if (!can(p.member, "MANAGE_CHANNELS")) return NextResponse.json({ error: "Only people who manage channels can link the repo" }, { status: 403 });
    const t = await githubTokenFor(profile.id);
    if (!t) return NextResponse.json({ error: "Connect GitHub first" }, { status: 400 });
    const owner = String(body.owner || "");
    const name = String(body.name || "");
    try {
      const repo = await gh(t.token, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`);
      if (!repo.permissions?.push) return NextResponse.json({ error: "You need write access to that repo" }, { status: 403 });

      // Webhook so pushes and pull requests show up in the channel. GitHub can't reach localhost.
      const site = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
      let webhookId: string | null = null;
      let secret: string | null = null;
      let note: string | null = null;
      if (/^https?:\/\/(localhost|127\.|\[::1\])/.test(site)) {
        note = "GitHub can't send events to localhost, so repo activity will appear here once the app is deployed.";
      } else if (repo.permissions?.admin) {
        secret = randomBytes(24).toString("hex");
        try {
          const hook = await gh(t.token, `/repos/${repo.owner.login}/${repo.name}/hooks`, {
            method: "POST",
            body: { name: "web", active: true, events: ["push", "pull_request", "issues"], config: { url: `${site}/api/github/webhook/${p.channel.id}`, content_type: "json", secret } },
          });
          webhookId = String(hook.id);
        } catch (e) {
          note = `Couldn't add the GitHub webhook: ${(e as Error).message}`;
          secret = null;
        }
      } else {
        note = "Only a repo admin can add the webhook for live repo activity. Everything else works.";
      }

      await db.channel.update({
        where: { id: p.channel.id },
        data: {
          repoOwner: repo.owner.login,
          repoName: repo.name,
          repoDefaultBranch: repo.default_branch,
          repoWebhookId: webhookId,
          repoWebhookSecret: secret ? encrypt(secret) : null,
        },
      });
      return NextResponse.json({ ok: true, note });
    } catch (e) {
      if (e instanceof GithubError) return NextResponse.json({ error: e.message }, { status: e.status === 404 ? 404 : 502 });
      throw e;
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
