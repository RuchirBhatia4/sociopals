import { NextResponse } from "next/server";
import { ChannelType } from "@prisma/client";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";

/** Create a channel: POST ?serverId= { name, type, categoryId?, isPrivate?, isProject? } (Manage channels) */
export async function POST(
  req: Request
) {
  try {
    const profile = await currentProfile();
    const { name, type, categoryId, isPrivate, isProject } = await req.json();
    const { searchParams } = new URL(req.url);

    const serverId = searchParams.get("serverId");

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    const clean = String(name || "").trim().toLowerCase().replace(/\s+/g, "-").slice(0, 40);
    if (!clean) return new NextResponse("Name the channel", { status: 400 });
    if (clean === "general") {
      return new NextResponse("Name cannot be 'general'", { status: 400 });
    }
    if (!Object.values(ChannelType).includes(type)) return new NextResponse("Unknown channel type", { status: 400 });

    const member = await db.member.findFirst({
      where: { serverId, profileId: profile.id },
      include: { customRoles: { include: { role: true } } },
    });
    if (!member || !can(member, "MANAGE_CHANNELS")) return new NextResponse("Not allowed", { status: 403 });

    const category = categoryId ? await db.category.findFirst({ where: { id: String(categoryId), serverId } }) : null;
    const position = await db.channel.count({ where: { serverId, categoryId: category?.id ?? null } });

    const channel = await db.channel.create({
      data: {
        profileId: profile.id,
        serverId,
        name: clean,
        type,
        categoryId: category?.id ?? null,
        position,
        isPrivate: !!isPrivate,
        // project channels are text channels with a repo, tasks and AI
        isProject: !!isProject && type === ChannelType.TEXT,
        // the creator is always inside a private channel
        channelMembers: isPrivate ? { create: [{ memberId: member.id }] } : undefined,
      },
    });

    return NextResponse.json(channel);
  } catch (error) {
    console.log("CHANNELS_POST", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
