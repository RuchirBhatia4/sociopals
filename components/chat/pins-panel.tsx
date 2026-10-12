"use client";

import { Gavel, Loader2, Pin } from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useSocket } from "@/components/providers/socket-provider";
import { updateKey } from "@/lib/socket-keys";
import { jumpToMessage } from "@/lib/jump";
import { cn } from "@/lib/utils";
import type { MessagePayload } from "@/lib/message-include";
import { usePanel } from "@/hooks/use-panel-store";

import { PanelShell } from "./panel-shell";
import { MessageSnippet } from "./message-snippet";

/** Everything worth keeping from a chat: pinned messages and the decisions made. */
export const PinsPanel = ({ chatId, isChannel, meId }: { chatId: string; isChannel: boolean; meId: string }) => {
  const [tab, setTab] = useState<"decisions" | "pinned">(isChannel ? "decisions" : "pinned");
  const { socket } = useSocket();
  const qc = useQueryClient();
  const openPanel = usePanel((s) => s.open);
  const { data, status } = useQuery<{ pinned: MessagePayload[]; decisions: MessagePayload[] }>({
    queryKey: ["pins", chatId],
    queryFn: () => fetch(`/api/pins?chatId=${chatId}`).then((r) => r.json()),
  });

  // Refresh when anything in the chat is pinned, unpinned or decided.
  useEffect(() => {
    if (!socket) return;
    const k = updateKey(chatId);
    const refresh = () => qc.invalidateQueries(["pins", chatId]);
    socket.on(k, refresh);
    return () => { socket.off(k, refresh); };
  }, [socket, chatId, qc]);

  const list = tab === "pinned" ? data?.pinned ?? [] : data?.decisions ?? [];
  const open = (m: MessagePayload) => (m.threadId ? openPanel("thread", { threadId: m.threadId }) : jumpToMessage(m.id));

  return (
    <PanelShell title={isChannel ? "Pins & decisions" : "Pinned messages"} icon={<Pin className="h-4 w-4 text-amber-400" />}>
      {isChannel && (
        <div className="flex gap-1 p-2 border-b border-border">
          {(["decisions", "pinned"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn("flex-1 h-8 rounded-lg text-sm flex items-center justify-center gap-1.5 transition", tab === t ? "bg-foreground/[0.09] text-foreground font-medium" : "text-muted-foreground hover:text-foreground")}
            >
              {t === "decisions" ? <Gavel className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
              {t === "decisions" ? "Decisions" : "Pinned"}
              <span className="text-xs text-muted-foreground tabular-nums">{(t === "decisions" ? data?.decisions : data?.pinned)?.length ?? 0}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-3 space-y-2">
        {status === "loading" && <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
        {status === "success" && list.length === 0 && (
          <div className="text-center py-12 px-6">
            <div className="h-12 w-12 rounded-2xl bg-foreground/[0.05] flex items-center justify-center mx-auto mb-3">
              {tab === "decisions" ? <Gavel className="h-5 w-5 text-brand" /> : <Pin className="h-5 w-5 text-amber-400" />}
            </div>
            <p className="font-medium text-sm">{tab === "decisions" ? "No decisions yet" : "Nothing pinned yet"}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {tab === "decisions"
                ? "Mark a message as a decision from its ⋯ menu, or close a poll and save the winner. They collect here so nobody has to scroll for them."
                : "Pin important messages from their ⋯ menu so everyone can find them later."}
            </p>
          </div>
        )}
        {list.map((m) => (
          <MessageSnippet
            key={m.id}
            name={m.webhookName ?? m.member.profile.name}
            imageUrl={m.webhookName ? m.webhookAvatar : m.member.profile.imageUrl}
            bot={!!m.webhookName}
            content={m.content}
            createdAt={m.createdAt}
            pinned={tab === "decisions" && !!m.pinnedAt}
            decision={tab === "pinned" && m.isDecision}
            files={m.attachments?.length}
            onClick={() => open(m)}
            meId={meId}
          />
        ))}
      </div>
    </PanelShell>
  );
};
