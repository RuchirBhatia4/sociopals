import { Channel, Conversation, Member, MemberRole, Prisma, Profile, Server } from "@prisma/client";

import { db } from "@/lib/db";
import { collectChatFiles } from "@/lib/workspace";
import { getIO } from "@/lib/io";
import { channelAudience } from "@/lib/access";
import { can, postBlockReason } from "@/lib/permissions";
import { channelMessageInclude, messageInclude } from "@/lib/message-include";
import { fetchLinkPreview, firstUrl } from "@/lib/link-preview";
import { notifyChannelMessage, notifyDirectMessage } from "@/lib/notify";
import {
  activityKey,
  addKey,
  chatRoom,
  directKey,
  mentionedIds,
  profileRoom,
  serverRoom,
  threadKey,
  updateKey,
  workspaceKey,
} from "@/lib/socket-keys";

export class PostError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type NewAttachment = { url: string; name: string; type: string; size?: number };
export type NewPoll = { question: string; options: string[]; multi?: boolean; closesAt?: Date | null };

type AuthorMember = Member & { profile: Profile; customRoles?: { role: { permissions: number } }[] };

const MAX_ATTACHMENTS = 10;
const MAX_CONTENT = 4000;
const SPAM_WINDOW_MS = 10_000;
const SPAM_LIMIT = 6;

function cleanAttachments(list?: NewAttachment[]) {
  return (list ?? [])
    // only files that went through our uploader
    .filter((a) => a && typeof a.url === "string" && /^https:\/\/(utfs\.io|uploadthing\.com|[a-z0-9-]+\.ufs\.sh)\//.test(a.url))
    .slice(0, MAX_ATTACHMENTS)
    .map((a) => ({ url: a.url, name: String(a.name || "file").slice(0, 200), type: String(a.type || "application/octet-stream").slice(0, 100), size: Number(a.size) || 0 }));
}

/** Automod for regular members: floods, blocked words, links from guests. */
async function automod(server: Server, member: AuthorMember, content: string) {
  if (member.role !== MemberRole.GUEST || can(member, "MANAGE_MESSAGES")) return;
  const words = Array.isArray(server.automodWords) ? (server.automodWords as string[]) : [];
  const lower = content.toLowerCase();
  if (words.some((w) => w && lower.includes(String(w).toLowerCase()))) {
    throw new PostError(400, "That message contains a word this server has blocked.");
  }
  if (server.automodLinks && firstUrl(content)) {
    throw new PostError(400, "Links from guests are turned off in this server.");
  }
  if (server.automodSpam) {
    const recent = await db.message.count({
      where: { memberId: member.id, createdAt: { gt: new Date(Date.now() - SPAM_WINDOW_MS) } },
    });
    if (recent >= SPAM_LIMIT) throw new PostError(429, "Whoa, that's a lot of messages. Give it a few seconds.");
  }
}

/** Look up links after the message is out, then update everyone's view. */
function attachLinkPreview(kind: "channel" | "direct", id: string, chatId: string, content: string) {
  const url = firstUrl(content);
  if (!url) return;
  fetchLinkPreview(url)
    .then(async (preview) => {
      if (!preview) return;
      const updated =
        kind === "channel"
          ? await db.message.update({ where: { id }, data: { linkPreview: preview as unknown as Prisma.InputJsonValue }, include: channelMessageInclude })
          : await db.directMessage.update({ where: { id }, data: { linkPreview: preview as unknown as Prisma.InputJsonValue }, include: messageInclude });
      const io = getIO();
      if (kind === "channel" && updated && (updated as any).threadId) {
        io?.to(chatRoom(chatId)).emit(threadKey((updated as any).threadId), updated);
      } else {
        io?.to(chatRoom(chatId)).emit(updateKey(chatId), updated);
      }
    })
    .catch(() => {});
}

/**
 * Post into a channel. Every way of posting goes through here: typing,
 * scheduled sends, webhooks, polls and call recaps.
 */
export async function postChannelMessage(args: {
  member: AuthorMember;
  channel: Channel & { server: Server };
  content: string;
  fileUrl?: string | null;
  attachments?: NewAttachment[];
  replyToId?: string | null;
  threadId?: string | null;
  poll?: NewPoll | null;
  webhook?: { id: string; name: string; avatarUrl?: string | null } | null;
  system?: boolean;
}) {
  const { member, channel } = args;
  const server = channel.server;
  const content = String(args.content ?? "").slice(0, MAX_CONTENT);
  const attachments = cleanAttachments(args.attachments);
  const trusted = !!args.webhook || !!args.system;

  if (!content.trim() && !args.fileUrl && !attachments.length && !args.poll) {
    throw new PostError(400, "Message is empty.");
  }

  if (!trusted) {
    const blocked = postBlockReason(member, channel);
    if (blocked) throw new PostError(403, blocked);
    if (channel.slowModeSeconds > 0 && !can(member, "MANAGE_MESSAGES")) {
      const last = await db.message.findFirst({
        where: { channelId: channel.id, memberId: member.id, system: false },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      const wait = last ? Math.ceil((last.createdAt.getTime() + channel.slowModeSeconds * 1000 - Date.now()) / 1000) : 0;
      if (wait > 0) throw new PostError(429, `Slow mode is on. You can post again in ${wait}s.`);
    }
    await automod(server, member, content);
  }

  // A reply / thread reply must stay inside this channel; threads are one level deep.
  const replyTo = args.replyToId
    ? await db.message.findFirst({ where: { id: String(args.replyToId), channelId: channel.id }, select: { id: true } })
    : null;
  const root = args.threadId
    ? await db.message.findFirst({ where: { id: String(args.threadId), channelId: channel.id, threadId: null, deleted: false } })
    : null;
  if (args.threadId && !root) throw new PostError(404, "That thread no longer exists.");

  const poll = args.poll
    ? {
        question: String(args.poll.question).slice(0, 300),
        options: args.poll.options.map((o) => String(o).slice(0, 100)).filter(Boolean).slice(0, 10),
        multi: !!args.poll.multi,
        closesAt: args.poll.closesAt ?? null,
      }
    : null;
  if (poll && (poll.options.length < 2 || !poll.question.trim())) throw new PostError(400, "A poll needs a question and at least two options.");

  const message = await db.message.create({
    data: {
      content,
      fileUrl: args.fileUrl ?? null,
      channelId: channel.id,
      memberId: member.id,
      replyToId: replyTo?.id ?? null,
      threadId: root?.id ?? null,
      system: !!args.system,
      webhookId: args.webhook?.id ?? null,
      webhookName: args.webhook?.name ?? null,
      webhookAvatar: args.webhook?.avatarUrl ?? null,
      attachments: attachments.length ? { create: attachments } : undefined,
      poll: poll ? { create: { ...poll, options: poll.options as unknown as Prisma.InputJsonValue } } : undefined,
    },
    include: channelMessageInclude,
  });

  const io = getIO();
  if (root) {
    const updatedRoot = await db.message.update({
      where: { id: root.id },
      data: { threadCount: { increment: 1 }, threadLastAt: message.createdAt },
      include: channelMessageInclude,
    });
    io?.to(chatRoom(channel.id)).emit(threadKey(root.id), message);
    io?.to(chatRoom(channel.id)).emit(updateKey(channel.id), updatedRoot);
  } else {
    io?.to(chatRoom(channel.id)).emit(addKey(channel.id), message);
    const activity = {
      chatId: channel.id,
      memberId: member.id,
      mentions: mentionedIds(content),
    };
    if (channel.isPrivate || channel.isGroupDm) {
      const audience = await channelAudience(channel);
      audience.forEach((a) => io?.to(profileRoom(a.profileId)).emit(activityKey(server.id), activity));
    } else {
      io?.to(serverRoom(server.id)).emit(activityKey(server.id), activity);
    }
  }

  attachLinkPreview("channel", message.id, channel.id, content);
  if (channel.isProject && attachments.length) {
    collectChatFiles({ channelId: channel.id, messageId: message.id, memberId: member.id, attachments })
      .then(() => io?.to(chatRoom(channel.id)).emit(workspaceKey(channel.id), { type: "files" }))
      .catch((e) => console.log("[WORKSPACE_COLLECT]", e));
  }
  if (!args.system) {
    notifyChannelMessage({
      message: { ...message, webhookName: args.webhook?.name },
      channel,
      server,
      author: member,
      everyoneAllowed: trusted || can(member, "MENTION_EVERYONE"),
    }).catch((e) => console.log("[NOTIFY]", e));
  }
  return message;
}

/** Post a direct message between two members. */
export async function postDirectMessage(args: {
  member: AuthorMember;
  conversation: Conversation & { memberOne: Member; memberTwo: Member };
  content: string;
  fileUrl?: string | null;
  attachments?: NewAttachment[];
  replyToId?: string | null;
}) {
  const { member, conversation } = args;
  const content = String(args.content ?? "").slice(0, MAX_CONTENT);
  const attachments = cleanAttachments(args.attachments);
  if (!content.trim() && !args.fileUrl && !attachments.length) throw new PostError(400, "Message is empty.");

  const replyTo = args.replyToId
    ? await db.directMessage.findFirst({ where: { id: String(args.replyToId), conversationId: conversation.id }, select: { id: true } })
    : null;

  const message = await db.directMessage.create({
    data: {
      content,
      fileUrl: args.fileUrl ?? null,
      conversationId: conversation.id,
      memberId: member.id,
      replyToId: replyTo?.id ?? null,
      attachments: attachments.length ? { create: attachments } : undefined,
    },
    include: messageInclude,
  });

  const other = member.id === conversation.memberOneId ? conversation.memberTwo : conversation.memberOne;
  const io = getIO();
  io?.to(chatRoom(conversation.id)).emit(addKey(conversation.id), message);
  io?.to(profileRoom(other.profileId)).emit(directKey(other.id), { conversationId: conversation.id, fromMemberId: member.id });

  attachLinkPreview("direct", message.id, conversation.id, content);
  notifyDirectMessage({
    message,
    conversationId: conversation.id,
    serverId: member.serverId,
    author: member,
    recipient: other,
  }).catch((e) => console.log("[NOTIFY_DM]", e));
  return message;
}
