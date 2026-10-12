// One place for every Socket.io event and room name, shared by server and clients.

/* ---------- rooms (server side only joins them) ---------- */
/** Everyone currently viewing a chat (channel or conversation). */
export const chatRoom = (chatId: string) => `room:chat:${chatId}`;
/** Everyone in a server: sidebar activity, presence. */
export const serverRoom = (serverId: string) => `room:server:${serverId}`;
/** All of one person's open tabs: notifications, DM signals. */
export const profileRoom = (profileId: string) => `room:profile:${profileId}`;

/* ---------- events ---------- */
/** New messages in a chat (channel or conversation). */
export const addKey = (chatId: string) => `chat:${chatId}:messages`;
/** An existing message changed (edit, delete, reaction, pin, thread count, poll). */
export const updateKey = (chatId: string) => `chat:${chatId}:messages:update`;
/** A new reply inside a thread (root message id). */
export const threadKey = (rootId: string) => `thread:${rootId}:messages`;
/** Someone is typing in a chat. */
export const typingKey = (chatId: string) => `chat:${chatId}:typing`;
/** Lightweight "something happened" signal for a server's sidebar badges. */
export const activityKey = (serverId: string) => `server:${serverId}:activity`;
/** A direct message arrived for this member (drives DM unread counts). */
export const directKey = (memberId: string) => `member:${memberId}:direct`;
/** Project tasks changed in a channel (created, assigned, branch, PR, status). */
export const taskKey = (channelId: string) => `project:${channelId}:tasks`;
/** A new inbox notification for the signed-in person. */
export const NOTIFY_EVENT = "notify";
/** Someone came online / went offline / changed status, in a server. */
export const PRESENCE_EVENT = "presence";
/** Server structure changed (channels, categories, roles): refresh the sidebar. */
export const STRUCTURE_EVENT = "structure";

export type Activity = {
  chatId: string;
  memberId: string;
  /** member ids mentioned in the message */
  mentions: string[];
};

export type Typing = {
  chatId: string;
  memberId: string;
  name: string;
  /** false when they stop (sent, cleared the box, or left) */
  typing: boolean;
};

export type Presence = {
  profileId: string;
  online: boolean;
  statusText?: string | null;
  statusEmoji?: string | null;
};

/** Pull the member ids out of @[Name](memberId) mention tokens. */
export function mentionedIds(content: string): string[] {
  const ids = new Set<string>();
  for (const m of content.matchAll(/@\[[^\]]{1,80}\]\(([0-9a-f-]{36})\)/g)) ids.add(m[1]);
  return Array.from(ids);
}

/** @everyone / @here written as plain words. */
export const mentionsEveryone = (content: string) => /(^|\s)@(everyone|here)\b/.test(content);
