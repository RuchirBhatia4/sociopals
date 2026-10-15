import { Member, Profile } from "@prisma/client";

/**
 * What every message payload carries, for channel messages and direct messages
 * alike (both models have the same relation names): the author, a short view of
 * the message it replies to, and its reactions.
 */
export const messageInclude = {
  member: { include: { profile: true } },
  replyTo: {
    select: {
      id: true,
      content: true,
      fileUrl: true,
      deleted: true,
      member: { include: { profile: true } },
    },
  },
  reactions: { select: { emoji: true, profileId: true } },
  attachments: { select: { id: true, url: true, name: true, type: true, size: true } },
} as const;

/** Channel messages also carry polls (direct messages have none). */
export const channelMessageInclude = {
  ...messageInclude,
  poll: { include: { votes: { select: { option: true, profileId: true } } } },
} as const;

export type AttachmentPayload = { id: string; url: string; name: string; type: string; size: number };
export type PollPayload = {
  id: string;
  question: string;
  options: string[];
  multi: boolean;
  closesAt: string | Date | null;
  closedAt: string | Date | null;
  votes: { option: number; profileId: string }[];
};
export type LinkPreviewPayload = {
  url: string;
  title: string;
  description?: string;
  image?: string;
  siteName?: string;
  embed?: { kind: "youtube"; id: string } | { kind: "spotify"; path: string };
};

export type MessagePayload = {
  id: string;
  content: string;
  fileUrl: string | null;
  deleted: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
  memberId: string;
  replyToId: string | null;
  member: Member & { profile: Profile };
  replyTo: null | {
    id: string;
    content: string;
    fileUrl: string | null;
    deleted: boolean;
    member: Member & { profile: Profile };
  };
  reactions: { emoji: string; profileId: string }[];
  attachments?: AttachmentPayload[];
  linkPreview?: LinkPreviewPayload | null;
  pinnedAt?: string | Date | null;
  editedAt?: string | Date | null;
  // channel messages only
  isDecision?: boolean;
  threadId?: string | null;
  threadCount?: number;
  threadLastAt?: string | Date | null;
  system?: boolean;
  webhookName?: string | null;
  webhookAvatar?: string | null;
  poll?: PollPayload | null;
  aiMeta?: AiMeta | null;
};

export type AiMeta = {
  kind: "prompt" | "answer";
  label: string;
  provider?: "ANTHROPIC" | "OPENAI";
  model?: string;
  askedBy?: string;
  status?: "streaming" | "done" | "error";
};

/** How many messages one page of history holds. */
export const MESSAGES_BATCH = 30;
