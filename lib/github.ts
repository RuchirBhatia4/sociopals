import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";

/* GitHub REST calls made with a person's own token (Sign in with GitHub). */

export class GithubError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const githubConfigured = () => !!process.env.GITHUB_CLIENT_ID && !!process.env.GITHUB_CLIENT_SECRET;

export async function githubTokenFor(profileId: string): Promise<{ token: string; login: string } | null> {
  const acc = await db.githubAccount.findUnique({ where: { profileId } });
  if (!acc) return null;
  return { token: decrypt(acc.tokenEnc), login: acc.login };
}

export async function gh<T = any>(token: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Sociopals",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      res.status === 401 ? "Your GitHub connection expired. Reconnect GitHub." :
      res.status === 403 ? (data?.message?.includes("rate limit") ? "GitHub rate limit reached. Try again in a bit." : "GitHub says you don't have permission for that. Ask the repo owner to add you as a collaborator with write access.") :
      res.status === 404 ? "Not found on GitHub (or you don't have access to this repo)." :
      data?.message || `GitHub error ${res.status}`;
    throw new GithubError(res.status, msg);
  }
  return data as T;
}

/** A branch name from a task: task/12-fix-login-button */
export const branchFor = (n: number, title: string) =>
  `task/${n}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "work"}`;

export type RepoRef = { owner: string; name: string; defaultBranch: string };

export async function createBranch(token: string, repo: RepoRef, branch: string) {
  const base = await gh(token, `/repos/${repo.owner}/${repo.name}/git/ref/heads/${encodeURIComponent(repo.defaultBranch)}`);
  try {
    await gh(token, `/repos/${repo.owner}/${repo.name}/git/refs`, { method: "POST", body: { ref: `refs/heads/${branch}`, sha: base.object.sha } });
  } catch (e) {
    // Already exists: that's fine, we'll use it.
    if (!(e instanceof GithubError && e.status === 422)) throw e;
  }
}

/** Merge the latest main into the branch. */
export async function catchUpToMain(token: string, repo: RepoRef, branch: string): Promise<"merged" | "up-to-date"> {
  try {
    const r = await gh(token, `/repos/${repo.owner}/${repo.name}/merges`, {
      method: "POST",
      body: { base: branch, head: repo.defaultBranch, commit_message: `Catch up with ${repo.defaultBranch}` },
    });
    return r ? "merged" : "up-to-date";
  } catch (e) {
    if (e instanceof GithubError && e.status === 409) {
      throw new GithubError(409, `There are conflicts between ${repo.defaultBranch} and ${branch}. Resolve them locally (git merge ${repo.defaultBranch}), then push.`);
    }
    throw e;
  }
}

/** Every file path in the branch (for AI context), largest repos trimmed. */
export async function listFiles(token: string, repo: RepoRef, ref: string, limit = 600): Promise<string[]> {
  const t = await gh(token, `/repos/${repo.owner}/${repo.name}/git/trees/${encodeURIComponent(ref)}?recursive=1`);
  return (t.tree as { path: string; type: string }[])
    .filter((x) => x.type === "blob" && !/(^|\/)(node_modules|\.git|dist|build|\.next|vendor)\//.test(x.path))
    .map((x) => x.path)
    .slice(0, limit);
}

/** A text file's contents, or null if missing / binary / huge. */
export async function readFile(token: string, repo: RepoRef, ref: string, path: string): Promise<string | null> {
  try {
    const f = await gh(token, `/repos/${repo.owner}/${repo.name}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`);
    if (Array.isArray(f) || f.type !== "file" || f.size > 200_000) return null;
    const text = Buffer.from(f.content, "base64").toString("utf8");
    return text.includes("\u0000") ? null : text;
  } catch (e) {
    if (e instanceof GithubError && e.status === 404) return null;
    throw e;
  }
}

export type FileChange = { path: string; action: "create" | "update" | "delete"; content?: string };

/** Commit several file changes to a branch in one commit (Git Data API). */
export async function commitFiles(token: string, repo: RepoRef, branch: string, message: string, files: FileChange[]): Promise<string> {
  const base = `/repos/${repo.owner}/${repo.name}`;
  const ref = await gh(token, `${base}/git/ref/heads/${encodeURIComponent(branch)}`);
  const parent = await gh(token, `${base}/git/commits/${ref.object.sha}`);
  const tree = await gh(token, `${base}/git/trees`, {
    method: "POST",
    body: {
      base_tree: parent.tree.sha,
      tree: files.map((f) =>
        f.action === "delete"
          ? { path: f.path, mode: "100644", type: "blob", sha: null }
          : { path: f.path, mode: "100644", type: "blob", content: f.content ?? "" }
      ),
    },
  });
  const commit = await gh(token, `${base}/git/commits`, { method: "POST", body: { message, tree: tree.sha, parents: [ref.object.sha] } });
  await gh(token, `${base}/git/refs/heads/${encodeURIComponent(branch)}`, { method: "PATCH", body: { sha: commit.sha } });
  return commit.sha as string;
}
