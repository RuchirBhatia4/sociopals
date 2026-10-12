"use client";

import { Member } from "@prisma/client";
import { Loader2, MessagesSquare } from "lucide-react";
import { Fragment, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useSocket } from "@/components/providers/socket-provider";
import { threadKey, updateKey } from "@/lib/socket-keys";
import { plainText } from "@/lib/format";
import type { MessagePayload } from "@/lib/message-include";

import { PanelShell } from "./panel-shell";
import { ChatItem } from "./chat-item";
import { ChatInput, type MentionCandidate } from "./chat-input";

type ThreadData = { root: MessagePayload | null; items: MessagePayload[] };

export const ThreadPanel = ({
  threadId, chatId, channelName, member, socketQuery, mentionable, blockedReason,
}: {
  threadId: string;
  chatId: string;
  channelName: string;
  member: Member;
  socketQuery: Record<string, string>;
  mentionable: MentionCandidate[];
  blockedReason?: string | null;
}) => {
  const { socket } = useSocket();
  const qc = useQueryClient();
  const key = ["thread", threadId];
  const bottom = useRef<HTMLDivElement>(null);

  const { data, status } = useQuery<ThreadData>({
    queryKey: key,
    queryFn: () => fetch(`/api/messages?channelId=${chatId}&threadId=${threadId}`).then((r) => (r.ok ? r.json() : Promise.reject(r))),
  });

  useEffect(() => {
    if (!socket) return;
    const onAdd = (m: MessagePayload) =>
      qc.setQueryData<ThreadData>(key, (old) => (old && !old.items.some((x) => x.id === m.id) ? { ...old, items: [...old.items, m] } : old));
    const onUpdate = (m: MessagePayload) =>
      qc.setQueryData<ThreadData>(key, (old) =>
        old ? { root: old.root?.id === m.id ? m : old.root, items: old.items.map((x) => (x.id === m.id ? m : x)) } : old
      );
    socket.on(threadKey(threadId), onAdd);
    socket.on(updateKey(chatId), onUpdate);
    return () => { socket.off(threadKey(threadId), onAdd); socket.off(updateKey(chatId), onUpdate); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, threadId, chatId, qc]);

  const count = data?.items.length ?? 0;
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [count]);

  return (
    <PanelShell
      title="Thread"
      subtitle={<>#{channelName}{data?.root ? ` · ${plainText(data.root.content).slice(0, 60)}` : ""}</>}
      icon={<MessagesSquare className="h-4 w-4 text-brand" />}
    >
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin pt-5 pb-2">
        {status === "loading" && <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
        {status === "error" && <p className="text-sm text-muted-foreground text-center py-10">This thread couldn&apos;t be loaded.</p>}
        {data?.root && (
          <>
            <ChatItem message={data.root} currentMember={member} chatId={chatId} type="channel" grouped={false} socketUrl="/api/socket/messages" socketQuery={socketQuery} inThread />
            <div className="flex items-center gap-3 px-4 my-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">{count} {count === 1 ? "reply" : "replies"}</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            {data.items.map((m, i) => {
              const prev = data.items[i - 1];
              const grouped = !!prev && prev.memberId === m.memberId && !m.replyTo && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
              return (
                <Fragment key={m.id}>
                  <ChatItem message={m} currentMember={member} chatId={chatId} type="channel" grouped={grouped} socketUrl="/api/socket/messages" socketQuery={socketQuery} inThread />
                </Fragment>
              );
            })}
            {count === 0 && <p className="px-4 text-sm text-muted-foreground">No replies yet. Start the conversation below; the channel stays tidy.</p>}
          </>
        )}
        <div ref={bottom} />
      </div>
      {data?.root && !data.root.deleted && (
        <ChatInput
          apiUrl="/api/socket/messages"
          query={socketQuery}
          name={channelName}
          type="channel"
          chatId={chatId}
          me={{ id: member.id, name: "" }}
          members={mentionable}
          threadId={threadId}
          blockedReason={blockedReason}
        />
      )}
    </PanelShell>
  );
};
