"use client";

import { Member } from "@prisma/client";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { usePanel } from "@/hooks/use-panel-store";

import { ThreadPanel } from "./thread-panel";
import { PinsPanel } from "./pins-panel";
import { SearchPanel } from "./search-panel";
import { CatchupPanel } from "./catchup-panel";
import type { MentionCandidate } from "./chat-input";
import { TasksPanel } from "@/components/project/tasks-panel";
import { TaskPanel } from "@/components/project/task-panel";

/** A chat and, beside it, whichever panel is open (thread, pins, search, catch-up). */
export const ChatLayout = ({
  children, chatId, chatName, isChannel, member, socketQuery, mentionable, blockedReason,
}: {
  children: React.ReactNode;
  chatId: string;
  chatName: string;
  isChannel: boolean;
  member: Member;
  socketQuery: Record<string, string>;
  mentionable: MentionCandidate[];
  blockedReason?: string | null;
}) => {
  const { panel, threadId, taskId, open, close } = usePanel();
  const params = useSearchParams();

  // A new chat starts without a panel (search stays open, it's server-wide).
  useEffect(() => {
    if (usePanel.getState().panel !== "search") close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  // Links can open a thread: ?thread=<root id>
  useEffect(() => {
    const t = params?.get("thread");
    if (t && isChannel) open("thread", { threadId: t });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, isChannel]);

  // ...or a task: ?task=<id>
  useEffect(() => {
    const t = params?.get("task");
    if (t && isChannel) open("task", { taskId: t });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, isChannel]);

  // Escape closes the panel when you're not typing somewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === "Escape" && !["INPUT", "TEXTAREA"].includes(el.tagName)) close();
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "f") { e.preventDefault(); open("search"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, open]);

  const showThread = panel === "thread" && threadId && isChannel;
  const show = showThread || panel === "pins" || panel === "search" || (isChannel && (panel === "catchup" || panel === "tasks" || (panel === "task" && !!taskId)));

  return (
    <div className="flex h-full min-h-0">
      <div className="flex-1 min-w-0 flex flex-col h-full">{children}</div>
      {show && (
        <div className="fixed inset-0 z-40 md:static md:z-auto md:w-[380px] lg:w-[420px] flex-shrink-0 h-full">
          {showThread && (
            <ThreadPanel
              key={threadId}
              threadId={threadId!}
              chatId={chatId}
              channelName={chatName}
              member={member}
              socketQuery={socketQuery}
              mentionable={mentionable}
              blockedReason={blockedReason}
            />
          )}
          {panel === "pins" && <PinsPanel chatId={chatId} isChannel={isChannel} meId={member.id} />}
          {panel === "search" && <SearchPanel meId={member.id} channelName={isChannel ? chatName : undefined} />}
          {panel === "catchup" && isChannel && <CatchupPanel chatId={chatId} channelName={chatName} meId={member.id} />}
          {panel === "tasks" && isChannel && <TasksPanel channelId={chatId} />}
          {panel === "task" && isChannel && taskId && <TaskPanel key={taskId} channelId={chatId} taskId={taskId} />}
        </div>
      )}
    </div>
  );
};
