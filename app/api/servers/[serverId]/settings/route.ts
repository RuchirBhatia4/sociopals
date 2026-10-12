import { NextResponse } from "next/server";
import { MemberRole } from "@prisma/client";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { can, permsOf } from "@/lib/permissions";

/** Roles, members and automod for the server settings screen: GET */
export async function GET(_req: Request, { params }: { params: { serverId: string } }) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const me = await db.member.findFirst({
    where: { serverId: params.serverId, profileId: profile.id },
    include: { customRoles: { include: { role: true } } },
  });
  if (!me || (me.role !== MemberRole.ADMIN && !can(me, "MANAGE_ROLES") && !can(me, "MODERATE_MEMBERS"))) {
    return new NextResponse("Not allowed", { status: 403 });
  }
  const [server, roles, members] = await Promise.all([
    db.server.findUnique({ where: { id: params.serverId }, select: { id: true, name: true, automodLinks: true, automodSpam: true, automodWords: true } }),
    db.role.findMany({ where: { serverId: params.serverId }, orderBy: { position: "desc" }, include: { _count: { select: { members: true } } } }),
    db.member.findMany({
      where: { serverId: params.serverId },
      include: { profile: { select: { name: true, imageUrl: true } }, customRoles: { select: { roleId: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return NextResponse.json({
    server,
    roles: roles.map((r) => ({ id: r.id, name: r.name, color: r.color, permissions: r.permissions, count: r._count.members })),
    members: members.map((m) => ({
      id: m.id, name: m.profile.name, imageUrl: m.profile.imageUrl, role: m.role,
      roleIds: m.customRoles.map((r) => r.roleId),
      timeoutUntil: m.timeoutUntil && m.timeoutUntil.getTime() > Date.now() ? m.timeoutUntil : null,
    })),
    me: { id: me.id, isAdmin: me.role === MemberRole.ADMIN, perms: permsOf(me) },
  });
}
