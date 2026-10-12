import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

import { currentProfile } from "@/lib/current-profile";
import { githubConfigured } from "@/lib/github";

/** Start "Sign in with GitHub": GET ?returnTo=/servers/... */
export async function GET(req: Request) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const url = new URL(req.url);
  if (!githubConfigured()) return NextResponse.redirect(new URL("/?github=not-configured", url.origin));

  const state = randomBytes(16).toString("hex");
  const returnTo = url.searchParams.get("returnTo") || "/";
  const auth = new URL("https://github.com/login/oauth/authorize");
  auth.searchParams.set("client_id", process.env.GITHUB_CLIENT_ID!);
  auth.searchParams.set("redirect_uri", `${url.origin}/api/github/callback`);
  // repo: branches, commits, pull requests; admin:repo_hook: the project webhook; read:user: your name
  auth.searchParams.set("scope", "repo admin:repo_hook read:user");
  auth.searchParams.set("state", state);
  auth.searchParams.set("allow_signup", "true");

  const res = NextResponse.redirect(auth);
  const cookie = { httpOnly: true, sameSite: "lax" as const, secure: url.protocol === "https:", path: "/api/github", maxAge: 600 };
  res.cookies.set("gh_state", state, cookie);
  res.cookies.set("gh_return", returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/", cookie);
  return res;
}
