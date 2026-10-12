import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { gh } from "@/lib/github";

/** GitHub sends people back here after they approve Sociopals. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = cookies();
  const back = (status: string) => {
    const to = new URL(jar.get("gh_return")?.value || "/", url.origin);
    to.searchParams.set("github", status);
    const res = NextResponse.redirect(to);
    res.cookies.delete("gh_state");
    res.cookies.delete("gh_return");
    return res;
  };

  const profile = await currentProfile();
  if (!profile) return back("signed-out");
  const state = url.searchParams.get("state");
  if (!state || state !== jar.get("gh_state")?.value) return back("expired");
  const code = url.searchParams.get("code");
  if (!code) return back("cancelled");

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${url.origin}/api/github/callback`,
    }),
  });
  const token = await tokenRes.json().catch(() => ({}));
  if (!token.access_token) return back("failed");

  const user = await gh(token.access_token, "/user");
  const data = {
    githubId: String(user.id),
    login: user.login,
    avatarUrl: user.avatar_url ?? null,
    tokenEnc: encrypt(token.access_token),
    scopes: token.scope ?? null,
  };
  await db.githubAccount.upsert({ where: { profileId: profile.id }, create: { profileId: profile.id, ...data }, update: data });
  return back("connected");
}
