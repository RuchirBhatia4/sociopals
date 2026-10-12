import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { GithubError, gh, githubTokenFor } from "@/lib/github";

/** Repos you can push to, newest first (for linking a project): GET ?q= */
export async function GET(req: Request) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const t = await githubTokenFor(profile.id);
  if (!t) return NextResponse.json({ error: "Connect GitHub first" }, { status: 400 });
  const q = (new URL(req.url).searchParams.get("q") || "").toLowerCase();
  try {
    const repos = await gh<any[]>(t.token, "/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator,organization_member");
    return NextResponse.json(
      repos
        .filter((r) => r.permissions?.push && (!q || r.full_name.toLowerCase().includes(q)))
        .slice(0, 50)
        .map((r) => ({ owner: r.owner.login, name: r.name, fullName: r.full_name, private: r.private, defaultBranch: r.default_branch, updatedAt: r.updated_at, admin: !!r.permissions?.admin }))
    );
  } catch (e) {
    if (e instanceof GithubError) return NextResponse.json({ error: e.message }, { status: e.status === 401 ? 401 : 502 });
    throw e;
  }
}
