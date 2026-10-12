"use client";

import { Loader2, Search, X } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { parseSearch } from "@/lib/search-query";
import { cn } from "@/lib/utils";
import { usePanel } from "@/hooks/use-panel-store";

import { PanelShell } from "./panel-shell";
import { MessageSnippet } from "./message-snippet";

const FILTERS = [
  { label: "Files", token: "has:file" },
  { label: "Images", token: "has:image" },
  { label: "Links", token: "has:link" },
  { label: "Pinned", token: "is:pinned" },
  { label: "Decisions", token: "is:decision" },
  { label: "Threads", token: "is:thread" },
];

const WHEN = [
  { label: "Today", days: 0 },
  { label: "Past week", days: 7 },
  { label: "Past month", days: 30 },
];

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Search the whole server, with filters you can click or type (from: in: has: is: before: after:). */
export const SearchPanel = ({ meId, channelName }: { meId: string; channelName?: string }) => {
  const params = useParams();
  const router = useRouter();
  const serverId = params?.serverId as string;
  const initial = usePanel((s) => s.searchQuery);
  const setQuery = (q: string) => usePanel.setState({ searchQuery: q });
  const [q, setQ] = useState(initial);
  const [debounced, setDebounced] = useState(initial);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    const t = setTimeout(() => { setDebounced(q.trim()); setQuery(q); }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isFetching } = useQuery<{ channel: any[]; direct: any[] }>({
    queryKey: ["search", serverId, debounced],
    queryFn: () => fetch(`/api/search?serverId=${serverId}&q=${encodeURIComponent(debounced)}`).then((r) => r.json()),
    enabled: !!debounced,
    keepPreviousData: true,
  });

  const parsed = useMemo(() => parseSearch(debounced), [debounced]);
  const has = (token: string) => q.split(/\s+/).includes(token);
  const toggle = (token: string) => {
    const parts = q.split(/\s+/).filter(Boolean);
    setQ((parts.includes(token) ? parts.filter((p) => p !== token) : [...parts, token]).join(" ") + " ");
    input.current?.focus();
  };
  const setWhen = (days: number) => {
    const parts = q.split(/\s+/).filter((p) => p && !p.startsWith("after:") && !p.startsWith("on:"));
    const d = new Date(Date.now() - days * 86_400_000);
    setQ([...parts, days === 0 ? `on:${ymd(new Date())}` : `after:${ymd(d)}`].join(" ") + " ");
  };

  const results = [
    ...(data?.channel ?? []).map((m) => ({ ...m, kind: "channel" as const })),
    ...(data?.direct ?? []).map((m) => ({ ...m, kind: "direct" as const })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const open = (m: any) => {
    if (m.kind === "channel") {
      const thread = m.threadId ? `&thread=${m.threadId}` : "";
      router.push(`/servers/${serverId}/channels/${m.channelId}?m=${m.id}${thread}`);
    } else {
      router.push(`/servers/${serverId}/conversations/${m.otherMemberId}?m=${m.id}`);
    }
  };

  return (
    <PanelShell title="Search" subtitle="Every channel you can see, plus your DMs" icon={<Search className="h-4 w-4 text-sky-400" />}>
      <div className="p-3 border-b border-border space-y-2.5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={channelName ? `Search… try in:${channelName} from:name` : "Search messages…"}
            className="w-full h-10 rounded-lg bg-background border border-border pl-9 pr-9 text-sm outline-none focus:border-brand"
            aria-label="Search messages"
          />
          {q && (
            <button type="button" aria-label="Clear search" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {channelName && (
            <Chip active={has(`in:${channelName}`)} onClick={() => toggle(`in:${channelName}`)}>In #{channelName}</Chip>
          )}
          {FILTERS.map((f) => <Chip key={f.token} active={has(f.token)} onClick={() => toggle(f.token)}>{f.label}</Chip>)}
          {WHEN.map((w) => <Chip key={w.label} onClick={() => setWhen(w.days)}>{w.label}</Chip>)}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-3 space-y-2">
        {!debounced && (
          <div className="text-sm text-muted-foreground space-y-3 px-1">
            <p>Search reaches all the way back; nothing is hidden behind a paywall.</p>
            <div className="rounded-xl border border-border p-3 space-y-1.5 text-xs">
              {[
                ["from:alex", "messages from a person"],
                ["in:design", "only in one channel"],
                ["has:file  has:link", "with files or links"],
                ["is:decision  is:pinned", "what was decided or pinned"],
                ["before:2026-10-01", "by date (also after:, on:)"],
                ['"exact phrase"', "words in that order"],
              ].map(([k, v]) => (
                <p key={k} className="flex gap-2"><code className="text-brand whitespace-nowrap">{k}</code><span>{v}</span></p>
              ))}
            </div>
          </div>
        )}
        {debounced && isFetching && !data && <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
        {debounced && data && (
          <p className="text-xs text-muted-foreground px-1 flex items-center gap-2">
            {results.length} {results.length === 1 ? "result" : "results"}{results.length >= 50 ? "+" : ""}
            {isFetching && <Loader2 className="h-3 w-3 animate-spin" />}
          </p>
        )}
        {debounced && data && results.length === 0 && !isFetching && (
          <p className="text-sm text-muted-foreground text-center py-8">Nothing matches that. Try fewer words or remove a filter.</p>
        )}
        {results.map((m) => (
          <MessageSnippet
            key={`${m.kind}-${m.id}`}
            name={m.webhookName ?? m.member.profile.name}
            imageUrl={m.webhookName ? m.webhookAvatar : m.member.profile.imageUrl}
            bot={!!m.webhookName}
            content={m.content}
            createdAt={m.createdAt}
            chatName={m.kind === "channel" ? m.chatName : undefined}
            decision={m.isDecision}
            pinned={!!m.pinnedAt}
            files={m.attachments?.length}
            highlight={parsed.terms}
            meId={meId}
            onClick={() => open(m)}
          >
            {m.kind === "direct" && <p className="text-[11px] text-muted-foreground mt-1.5">Direct message with {m.chatName}</p>}
          </MessageSnippet>
        ))}
      </div>
    </PanelShell>
  );
};

const Chip = ({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={cn(
      "h-7 px-2.5 rounded-full text-xs border transition",
      active ? "bg-brand/[0.15] border-brand/60 text-foreground" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
    )}
  >
    {children}
  </button>
);
