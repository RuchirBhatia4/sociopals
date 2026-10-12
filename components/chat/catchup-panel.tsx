"use client";

import axios from "axios";
import { formatDistanceToNowStrict } from "date-fns";
import { AtSign, CheckCheck, CornerDownRight, Flame, Gavel, HelpCircle, ListChecks, Loader2, Pin, Sparkles } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { UserAvatar } from "@/components/user-avatar";
import { jumpToMessage } from "@/lib/jump";
import { usePanel } from "@/hooks/use-panel-store";

import { PanelShell } from "./panel-shell";
import { MessageSnippet } from "./message-snippet";

type Item = { id: string; preview: string; author: string; authorImage: string; createdAt: string; reactions: number; threadId: string | null };
type Digest = {
  since: string;
  total: number;
  people: { name: string; imageUrl: string }[];
  mentions: Item[];
  replies: Item[];
  decisions: Item[];
  pinned: Item[];
  popular: Item[];
  aiAvailable: boolean;
};
type Ref = { text: string; ref: string; messageId: string | null; owner?: string };
type AiSummary = { overview: string[]; decisions: Ref[]; questionsForYou: Ref[]; actionItems: Ref[]; count: number };

/** "Since you were away": what needs you first, then what happened, with an optional AI summary. */
export const CatchupPanel = ({ chatId, channelName, meId }: { chatId: string; channelName: string; meId: string }) => {
  const since = usePanel((s) => s.since);
  const setSince = (d: Date) => { usePanel.setState({ since: d.toISOString() }); setAi(null); setAiState("idle"); };
  const openPanel = usePanel((s) => s.open);
  const close = usePanel((s) => s.close);
  const [ai, setAi] = useState<AiSummary | null>(null);
  const [aiState, setAiState] = useState<"idle" | "loading" | "error">("idle");
  const [aiError, setAiError] = useState("");

  const { data, status } = useQuery<Digest>({
    queryKey: ["catchup", chatId, since],
    queryFn: () => fetch(`/api/catchup?chatId=${chatId}${since ? `&since=${encodeURIComponent(since)}` : ""}`).then((r) => r.json()),
  });

  const summarize = async () => {
    setAiState("loading");
    try {
      const { data: res } = await axios.post("/api/catchup/ai", { chatId, since: since ?? data?.since });
      setAi(res);
      setAiState("idle");
    } catch (e: any) {
      setAiError(e?.response?.data?.error ?? "Couldn't summarize right now.");
      setAiState("error");
    }
  };

  const go = (id: string | null, threadId?: string | null) => {
    if (threadId) openPanel("thread", { threadId });
    else if (id) jumpToMessage(id);
  };

  const sections: { key: keyof Digest; title: string; icon: React.ReactNode; empty?: string }[] = [
    { key: "mentions", title: "Mentioned you", icon: <AtSign className="h-3.5 w-3.5 text-mention" /> },
    { key: "replies", title: "Replied to you", icon: <CornerDownRight className="h-3.5 w-3.5 text-sky-400" /> },
    { key: "decisions", title: "Decisions", icon: <Gavel className="h-3.5 w-3.5 text-brand" /> },
    { key: "pinned", title: "Newly pinned", icon: <Pin className="h-3.5 w-3.5 text-amber-400" /> },
    { key: "popular", title: "Most reacted", icon: <Flame className="h-3.5 w-3.5 text-orange-400" /> },
  ];

  const nothingForMe = data && !data.mentions.length && !data.replies.length;

  return (
    <PanelShell title="Catch up" subtitle={`#${channelName}`} icon={<Sparkles className="h-4 w-4 text-brand" />}>
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-3 space-y-4">
        {status === "loading" && <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
        {data && (
          <>
            <div className="rounded-2xl border border-border p-4 glow-brand">
              <p className="text-xs text-muted-foreground">Since {formatDistanceToNowStrict(new Date(data.since), { addSuffix: true })}</p>
              <p className="text-2xl font-semibold mt-0.5 tabular-nums">{data.total} new {data.total === 1 ? "message" : "messages"}</p>
              {data.people.length > 0 && (
                <div className="flex items-center mt-2">
                  <div className="flex -space-x-2">
                    {data.people.slice(0, 6).map((p) => (
                      <span key={p.name} title={p.name} className="ring-2 ring-sidebar rounded-full"><UserAvatar src={p.imageUrl} className="h-6 w-6 md:h-6 md:w-6" /></span>
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground ml-2 truncate">
                    {data.people.slice(0, 3).map((p) => p.name.split(" ")[0]).join(", ")}
                    {data.people.length > 3 ? ` and ${data.people.length - 3} more` : ""}
                  </span>
                </div>
              )}
              {nothingForMe && data.total > 0 && <p className="text-xs text-muted-foreground mt-2">Nothing was addressed to you directly.</p>}
              {data.total === 0 && <p className="text-xs text-muted-foreground mt-2">You haven&apos;t missed anything. Want a recap anyway?</p>}
              <div className="flex gap-1.5 mt-3">
                {[{ l: "Last 24 h", h: 24 }, { l: "Last 3 days", h: 72 }, { l: "Last week", h: 168 }].map((o) => (
                  <button key={o.l} type="button" onClick={() => setSince(new Date(Date.now() - o.h * 3_600_000))} className="h-7 px-2.5 rounded-full text-[11px] border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30">
                    {o.l}
                  </button>
                ))}
              </div>
            </div>

            {/* AI summary */}
            <div className="rounded-2xl border border-border bg-background/60 p-3.5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-400" />
                <p className="text-sm font-semibold flex-1">AI summary</p>
                {!ai && data.aiAvailable && data.total >= 3 && (
                  <button
                    type="button"
                    onClick={summarize}
                    disabled={aiState === "loading"}
                    className="h-8 px-3 rounded-lg text-xs font-medium bg-violet-500/[0.15] text-violet-300 hover:bg-violet-500/25 flex items-center gap-1.5 disabled:opacity-60"
                  >
                    {aiState === "loading" ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading…</> : "Summarize"}
                  </button>
                )}
              </div>
              {!data.aiAvailable && (
                <p className="text-xs text-muted-foreground mt-2">Not switched on for this server yet. Whoever runs Sociopals can turn it on by adding an Anthropic API key. Everything else on this page works without it.</p>
              )}
              {data.aiAvailable && data.total < 3 && !ai && <p className="text-xs text-muted-foreground mt-2">Not much to summarize; you can read it all in a few seconds.</p>}
              {aiState === "error" && <p className="text-xs text-destructive mt-2">{aiError}</p>}
              {ai && (
                <div className="mt-3 space-y-3 text-sm">
                  <ul className="space-y-1.5">
                    {ai.overview.map((o, i) => (
                      <li key={i} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 rounded-full bg-violet-400 flex-shrink-0" /><span>{o}</span></li>
                    ))}
                  </ul>
                  <AiList title="Waiting on you" icon={<HelpCircle className="h-3.5 w-3.5 text-mention" />} items={ai.questionsForYou} onGo={go} />
                  <AiList title="Decided" icon={<Gavel className="h-3.5 w-3.5 text-brand" />} items={ai.decisions} onGo={go} />
                  <AiList title="To do" icon={<ListChecks className="h-3.5 w-3.5 text-sky-400" />} items={ai.actionItems} onGo={go} />
                  <p className="text-[11px] text-muted-foreground">Summarized from {ai.count} messages. AI can miss things; tap an item to see the original.</p>
                </div>
              )}
            </div>

            {sections.map(({ key, title, icon }) => {
              const items = data[key] as Item[];
              if (!items?.length) return null;
              return (
                <section key={key}>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2 px-1">
                    {icon} {title} <span className="tabular-nums">· {items.length}</span>
                  </h3>
                  <div className="space-y-2">
                    {items.map((m) => (
                      <MessageSnippet
                        key={m.id}
                        name={m.author}
                        imageUrl={m.authorImage}
                        content={m.preview}
                        createdAt={m.createdAt}
                        meId={meId}
                        onClick={() => go(m.id, m.threadId)}
                      >
                        {key === "popular" && <p className="text-[11px] text-muted-foreground mt-1">{m.reactions} reactions</p>}
                      </MessageSnippet>
                    ))}
                  </div>
                </section>
              );
            })}
          </>
        )}
      </div>
      <div className="p-3 border-t border-border">
        <button
          type="button"
          onClick={() => { fetch("/api/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId }) }); close(); }}
          className="w-full h-9 rounded-lg bg-foreground/[0.06] hover:bg-foreground/10 text-sm flex items-center justify-center gap-2"
        >
          <CheckCheck className="h-4 w-4" /> I&apos;m caught up
        </button>
      </div>
    </PanelShell>
  );
};

const AiList = ({ title, icon, items, onGo }: { title: string; icon: React.ReactNode; items: Ref[]; onGo: (id: string | null) => void }) =>
  items.length ? (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-1">{icon} {title}</p>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={i}>
            <button type="button" onClick={() => onGo(it.messageId)} className="text-left w-full rounded-lg px-2 py-1.5 hover:bg-foreground/[0.05] text-sm">
              {it.text}
              {it.owner && <span className="text-xs text-muted-foreground"> · {it.owner}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  ) : null;
