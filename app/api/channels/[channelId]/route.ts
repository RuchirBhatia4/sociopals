import { NextResponse } from "next/server";
import { MemberRole } from "@prisma/client";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";

/** Everything the channel settings screen needs: GET (Manage channels) */
export async function GET(
  _req: Request,
  { params }: { params: { channelId: string } }
) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const channel = await db.channel.findUnique({
    where: { id: params.channelId },
    include: { channelMembers: { select: { memberId: true } } },
  });
  if (!channel) return new NextResponse("Not found", { status: 404 });
  const me = await db.member.findFirst({
    where: { serverId: channel.serverId, profileId: profile.id },
    include: { customRoles: { include: { role: true } } },
  });
  if (!me || !can(me, "MANAGE_CHANNELS")) return new NextResponse("Not allowed", { status: 403 });

  const [categories, members] = await Promise.all([
    db.category.findMany({ where: { serverId: channel.serverId }, orderBy: { position: "asc" } }),
    db.member.findMany({ where: { serverId: channel.serverId }, include: { profile: { select: { name: true, imageUrl: true } } } }),
  ]);
  const { channelMembers, ...rest } = channel;
  return NextResponse.json({
    channel: rest,
    memberIds: channelMembers.map((m) => m.memberId),
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    members: members.map((m) => ({ id: m.id, name: m.profile.name, imageUrl: m.profile.imageUrl, role: m.role })),
    me: me.id,
    canManageWebhooks: can(me, "MANAGE_WEBHOOKS"),
  });
}

/** Delete a channel: DELETE ?serverId= (Manage channels; #general stays) */
export async function DELETE(
  req: Request,
  { params }: { params: { channelId: string } }
) {
  try {
    const profile = await currentProfile();
    if (!profile) return new NextResponse("Unauthorized", { status: 401 });
    const serverId = new URL(req.url).searchParams.get("serverId");
    if (!serverId) return new NextResponse("Server ID missing", { status: 400 });

    const me = await db.member.findFirst({
      where: { serverId, profileId: profile.id },
      include: { customRoles: { include: { role: true } } },
    });
    if (!me || !can(me, "MANAGE_CHANNELS")) return new NextResponse("Not allowed", { status: 403 });

    const channel = await db.channel.findFirst({ where: { id: params.channelId, serverId } });
    if (!channel) return new NextResponse("Not found", { status: 404 });
    if (channel.name === "general") return new NextResponse("#general can't be deleted", { status: 400 });

    await db.channel.delete({ where: { id: channel.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.log("[CHANNEL_ID_DELETE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { channelId: string } }
) {
  try {
    const profile = await currentProfile();
    const { name, type } = await req.json();
    const { searchParams } = new URL(req.url);

    const serverId = searchParams.get("serverId");

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    if (!params.channelId) {
      return new NextResponse("Channel ID missing", { status: 400 });
    }

    if (name === "general") {
      return new NextResponse("Name cannot be 'general'", { status: 400 });
    }

    const server = await db.server.update({
      where: {
        id: serverId,
        members: {
          some: {
            profileId: profile.id,
            role: {
              in: [MemberRole.ADMIN, MemberRole.MODERATOR],
            }
          }
        }
      },
      data: {
        channels: {
          update: {
            where: {
              id: params.channelId,
              NOT: {
                name: "general",
              },
            },
            data: {
              name,
              type,
            }
          }
        }
      }
    });

    return NextResponse.json(server);
  } catch (error) {
    console.log("[CHANNEL_ID_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}