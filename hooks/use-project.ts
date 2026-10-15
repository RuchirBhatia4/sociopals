"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useSocket } from "@/components/providers/socket-provider";
import { taskKey } from "@/lib/socket-keys";

export type ProjectAi = {
  id: string; provider: "ANTHROPIC" | "OPENAI"; providerLabel: string; label: string;
  ownerName: string; ownerImage: string; mine: boolean; model?: string; last4?: string;
};
export type ProjectInfo = {
  channel: { id: string; name: string; repo: { owner: string; name: string; defaultBranch: string; url: string } | null; webhook: boolean };
  me: { memberId: string; profileId: string; canManage: boolean };
  setupDone: boolean;
  github: { configured: boolean; connected: boolean; login: string | null };
  ais: ProjectAi[];
  members: { id: string; name: string; imageUrl: string }[];
};
export type TaskStatus = "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE";
export type Task = {
  id: string; number: number; title: string; description: string | null; status: TaskStatus;
  assigneeId: string | null; createdById: string; branch: string | null; branchUrl: string | null;
  prNumber: number | null; prUrl: string | null; createdAt: string; updatedAt: string;
  assignee: { id: string; name: string; imageUrl: string } | null;
  createdBy: { id: string; name: string; imageUrl: string } | null;
};

export const useProject = (channelId: string) =>
  useQuery<ProjectInfo>({
    queryKey: ["project", channelId],
    queryFn: () => fetch(`/api/projects/${channelId}`).then((r) => (r.ok ? r.json() : Promise.reject(r))),
    staleTime: 30_000,
    enabled: !!channelId,
  });

/** All tasks in a project, kept live over the socket. */
export function useTasks(channelId: string) {
  const qc = useQueryClient();
  const { socket } = useSocket();
  const q = useQuery<Task[]>({
    queryKey: ["tasks", channelId],
    queryFn: () => fetch(`/api/projects/${channelId}/tasks`).then((r) => (r.ok ? r.json() : [])),
  });
  useEffect(() => {
    if (!socket) return;
    const k = taskKey(channelId);
    const on = (e: { type: "upsert"; task: Task } | { type: "removed"; id: string }) =>
      qc.setQueryData<Task[]>(["tasks", channelId], (old = []) => {
        if (e.type === "removed") return old.filter((t) => t.id !== e.id);
        return old.some((t) => t.id === e.task.id) ? old.map((t) => (t.id === e.task.id ? e.task : t)) : [e.task, ...old];
      });
    socket.on(k, on);
    return () => { socket.off(k, on); };
  }, [socket, channelId, qc]);
  return q;
}

export const taskAction = async (channelId: string, body: Record<string, unknown>) => {
  const r = await fetch("/api/socket/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channelId, ...body }) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "That didn't work");
  return data;
};

export const STATUS: Record<TaskStatus, { label: string; dot: string }> = {
  TODO: { label: "To do", dot: "bg-muted-foreground/60" },
  IN_PROGRESS: { label: "In progress", dot: "bg-sky-400" },
  IN_REVIEW: { label: "In review", dot: "bg-violet-400" },
  DONE: { label: "Done", dot: "bg-brand" },
};
