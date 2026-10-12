"use client";

import { Check, Github } from "lucide-react";
import { usePathname } from "next/navigation";

/** "Connect GitHub" button, or who you're connected as. */
export const GithubConnect = ({ configured, connected, login }: { configured: boolean; connected: boolean; login: string | null }) => {
  const path = usePathname();
  if (!configured) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
        GitHub sign-in isn&apos;t set up on this server yet. Whoever runs Sociopals needs to add a GitHub OAuth app
        (<code className="text-xs">GITHUB_CLIENT_ID</code> / <code className="text-xs">GITHUB_CLIENT_SECRET</code> in .env).
      </div>
    );
  }
  if (connected) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-brand/40 bg-brand/[0.08] p-3">
        <Github className="h-5 w-5" />
        <p className="text-sm flex-1">Connected as <span className="font-semibold">@{login}</span></p>
        <Check className="h-4 w-4 text-brand" />
        <a href={`/api/github/connect?returnTo=${encodeURIComponent(path ?? "/")}`} className="text-xs text-muted-foreground hover:text-foreground underline">Switch</a>
      </div>
    );
  }
  return (
    <a
      href={`/api/github/connect?returnTo=${encodeURIComponent(path ?? "/")}`}
      className="flex items-center justify-center gap-2 h-11 rounded-xl bg-[#24292f] hover:bg-[#32383f] text-white text-sm font-medium transition border border-white/10"
    >
      <Github className="h-5 w-5" /> Sign in with GitHub
    </a>
  );
};
