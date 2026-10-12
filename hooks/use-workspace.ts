"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useSocket } from "@/components/providers/socket-provider";
import { workspaceKey } from "@/lib/socket-keys";

export type WsFile = {
  id: string; name: string; folderId: string | null; source: string; messageId: string | null;
  url: string; size: number; type: string; versions: number; createdAt: string; updatedAt: string;
  uploadedBy: { id: string; name: string; imageUrl: string } | null;
};
export type WsFolder = { id: string; name: string; parentId: string | null; files: number; createdById: string };
export type WsListing = {
  folders: WsFolder[]; files: WsFile[]; trail: { id: string; name: string }[]; usage: { bytes: number; versions: number };
  allFolders: { id: string; name: string; parentId: string | null }[];
};
export type WsDocSummary = { id: string; title: string; isOverview: boolean; updatedAt: string; updatedBy: string; preview: string };

/** Keep files, docs and task attachments fresh when anyone in the project changes them. */
export function useWorkspaceLive(channelId: string) {
  const { socket } = useSocket();
  const qc = useQueryClient();
  useEffect(() => {
    if (!socket) return;
    const k = workspaceKey(channelId);
    const on = (e: { type: "files" | "docs" | "attachments"; docId?: string; taskId?: string }) => {
      if (e.type === "files") qc.invalidateQueries(["ws-files", channelId]);
      if (e.type === "docs") { qc.invalidateQueries(["ws-docs", channelId]); if (e.docId) qc.invalidateQueries(["ws-doc-remote", e.docId]); }
      if (e.type === "attachments") qc.invalidateQueries(e.taskId ? ["task-attachments", e.taskId] : ["task-attachments"]);
    };
    socket.on(k, on);
    return () => { socket.off(k, on); };
  }, [socket, channelId, qc]);
}

export const workspaceAction = async (channelId: string, body: Record<string, unknown>) => {
  const r = await fetch("/api/socket/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channelId, ...body }) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || "That didn't work"), { status: r.status, data });
  return data;
};

export const fmtSize = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${Math.round(n / 1024)} KB` : n < 1024 ** 3 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${(n / 1024 ** 3).toFixed(2)} GB`;

export const fileKind = (name: string, type: string) => {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (type.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"].includes(ext)) return "image";
  if (type.startsWith("video/") || ["mp4", "webm", "mov"].includes(ext)) return "video";
  if (type.startsWith("audio/") || ["mp3", "wav", "ogg", "m4a"].includes(ext)) return "audio";
  if (type.includes("pdf") || ext === "pdf") return "pdf";
  if (type.startsWith("text/") || /json|xml|yaml|javascript|typescript/.test(type) ||
      ["txt", "md", "csv", "json", "yml", "yaml", "xml", "html", "css", "js", "jsx", "ts", "tsx", "py", "java", "c", "cpp", "h", "go", "rs", "rb", "php", "sh", "sql", "kt", "swift", "cs", "toml"].includes(ext)) return "text";
  return "other";
};
