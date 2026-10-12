import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { parseSearch } from "@/lib/search-query";
import { channelMessageInclude, messageInclude } from "@/lib/message-include";

const LIMIT = 50;

/**
 * Search a server you are in: every channel you can see, plus your own direct
 * messages in that server. GET ?serverId=&q=  (see lib/search-query.ts)
 * History has no limit, so search reaches back to the first message.
 */
export async function GET(req: Request) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });

  const params = new URL(req.url).searchParams;
  const serverId = params.get("serverId");
  const q = (params.get("q") || "").trim();
  if (!serverId) return new NextResponse("serverId missing", { status: 400 });
  if (!q) return NextResponse.json({ channel: [], direct: [] });

  const me = await db.member.findFirst({ where: { serverId, profileId: profile.id } });
  if (!me) return new NextResponse("Not found", { status: 404 });

  const s = parseSearch(q);

  // Channels you can see (public ones, plus private ones you are listed in).
  const channels = await db.channel.findMany({
    where: {
      serverId,
      OR: [{ isPrivate: false, isGroupDm: false }, { channelMembers: { some: { memberId: me.id } } }],
      ...(s.in ? { name: { contains: s.in } } : {}),
    },
    select: { id: true, name: true, isGroupDm: true },
  });
  const channelName = new Map(channels.map((c) => [c.id, c.name]));

  const authors = s.from
    ? await db.member.findMany({
        where: { serverId, profile: { name: { contains: s.from } } },
        select: { id: true },
      })
    : null;

  const textFilters: Prisma.MessageWhereInput[] = s.terms.map((t) => ({ content: { contains: t } }));
  const common = {
    deleted: false,
    ...(authors ? { memberId: { in: authors.map((a) => a.id) } } : {}),
    ...(s.before || s.after ? { createdAt: { ...(s.before ? { lt: s.before } : {}), ...(s.after ? { gte: s.after } : {}) } } : {}),
  };
  const hasFilters: Prisma.MessageWhereInput[] = [];
  if (s.has.has("file")) hasFilters.push({ OR: [{ fileUrl: { not: null } }, { attachments: { some: {} } }] });
  if (s.has.has("image")) hasFilters.push({ attachments: { some: { type: { startsWith: "image/" } } } });
  if (s.has.has("link")) hasFilters.push({ content: { contains: "http" } });

  const channelResults = channels.length
    ? await db.message.findMany({
        where: {
          ...common,
          channelId: { in: channels.map((c) => c.id) },
          AND: [...textFilters, ...hasFilters],
          ...(s.is.has("pinned") ? { pinnedAt: { not: null } } : {}),
          ...(s.is.has("decision") ? { isDecision: true } : {}),
          ...(s.is.has("thread") ? { OR: [{ threadId: { not: null } }, { threadCount: { gt: 0 } }] } : {}),
        },
        include: channelMessageInclude,
        orderBy: { createdAt: "desc" },
        take: LIMIT,
      })
    : [];

  // Your own DMs in this server (only when no channel filter / channel-only flags).
  const directResults =
    !s.in && !s.is.size
      ? await db.directMessage.findMany({
          where: {
            ...common,
            conversation: { OR: [{ memberOneId: me.id }, { memberTwoId: me.id }] },
            AND: [
              ...s.terms.map((t) => ({ content: { contains: t } })),
              ...(s.has.has("file") ? [{ OR: [{ fileUrl: { not: null } }, { attachments: { some: {} } }] }] : []),
              ...(s.has.has("link") ? [{ content: { contains: "http" } }] : []),
            ],
          },
          include: { ...messageInclude, conversation: { include: { memberOne: { include: { profile: true } }, memberTwo: { include: { profile: true } } } } },
          orderBy: { createdAt: "desc" },
          take: LIMIT,
        })
      : [];

  return NextResponse.json({
    channel: channelResults.map((m) => ({ ...m, chatName: channelName.get(m.channelId) ?? "channel" })),
    direct: directResults.map((m) => {
      const other = m.conversation.memberOneId === me.id ? m.conversation.memberTwo : m.conversation.memberOne;
      return { ...m, conversation: undefined, chatName: other.profile.name, otherMemberId: other.id };
    }),
  });
}
