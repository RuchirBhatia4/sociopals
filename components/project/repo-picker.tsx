"use client";

import axios from "axios";
import { Loader2, Lock, Search } from "lucide-react";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { toast } from "@/hooks/use-toast";

type Repo = { owner: string; name: string; fullName: string; private: boolean; defaultBranch: string; admin: boolean };

/** Pick one of your GitHub repos to link to a project channel. */
export const RepoPicker = ({ channelId, onLinked }: { channelId: string; onLinked?: () => void }) => {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery<Repo[]>({
    queryKey: ["gh-repos"],
    queryFn: async () => {
      const r = await fetch("/api/github/repos");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      return d;
    },
  });
  const list = (data ?? []).filter((r) => r.fullName.toLowerCase().includes(q.toLowerCase()));

  const link = async (r: Repo) => {
    try {
      setBusy(r.fullName);
      const { data: res } = await axios.post(`/api/projects/${channelId}`, { type: "link", owner: r.owner, name: r.name });
      qc.invalidateQueries(["project", channelId]);
      toast({ title: `Linked ${r.fullName}`, body: res.note ?? "Pushes and pull requests will show up in the channel." });
      onLinked?.();
    } catch (e: any) {
      toast({ title: e?.response?.data?.error ?? "Couldn't link the repo", tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a repository" className="w-full h-10 rounded-lg bg-background border border-border pl-9 pr-3 text-sm outline-none focus:border-brand" />
      </div>
      <div className="rounded-xl border border-border divide-y divide-border max-h-64 overflow-y-auto scrollbar-thin">
        {isLoading && <div className="p-4 flex justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>}
        {!!error && <p className="p-3 text-sm text-destructive">{(error as Error).message}</p>}
        {list.map((r) => (
          <button key={r.fullName} type="button" disabled={!!busy} onClick={() => link(r)} className="w-full flex items-center gap-2 px-3 h-11 text-left hover:bg-foreground/[0.04] disabled:opacity-60">
            {r.private && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
            <span className="text-sm truncate flex-1">{r.fullName}</span>
            <span className="text-[11px] text-muted-foreground">{r.defaultBranch}</span>
            {busy === r.fullName && <Loader2 className="h-4 w-4 animate-spin" />}
          </button>
        ))}
        {data && list.length === 0 && <p className="p-3 text-sm text-muted-foreground">No repos you can push to match that.</p>}
      </div>
    </div>
  );
};
