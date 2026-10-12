import { NextApiRequest } from "next";
import { ChannelType, MemberRole, Prisma } from "@prisma/client";

import { NextApiResponseServerIo } from "@/types";
import { currentProfilePages } from "@/lib/current-profile-pages";
import { db } from "@/lib/db";
import { getIO } from "@/lib/io";
import { can, PERMS } from "@/lib/permissions";
import { STRUCTURE_EVENT, serverRoom } from "@/lib/socket-keys";

/*
  Server structure, in one place. POST { serverId, type, ... }:

  category:create { name }                     category:rename { categoryId, name }
  category:delete { categoryId }               reorder { categories: [{ id|null, channelIds }] }
  channel:update  { channelId, name?, topic?, isPrivate?, readOnly?, slowModeSeconds?, categoryId?, memberIds? }
  groupDm:create  { memberIds, name? }         groupDm:leave { channelId }
  automod         { automodLinks?, automodSpam?, automodWords? }
  role:create     { name, color?, permissions? }   role:update { roleId, name?, color?, permissions? }
  role:delete     { roleId }                   role:assign / role:unassign { roleId, memberId }
  timeout         { memberId, minutes }        (0 lifts it)
  touch           {}                           (refresh everyone's sidebar)

  Everyone in the server gets a "structure" event so sidebars refresh.
*/
export default async function handler(req: NextApiRequest, res: NextApiResponseServerIo) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const profile = await currentProfilePages(req);
  if (!profile) return res.status(401).json({ error: "Unauthorized" });

  const b = req.body ?? {};
  const serverId = String(b.serverId || "");
  const me = await db.member.findFirst({
    where: { serverId, profileId: profile.id },
    include: { customRoles: { include: { role: true } } },
  });
  if (!me) return res.status(404).json({ error: "Server not found" });

  const deny = (msg = "You don't have permission to do that") => res.status(403).json({ error: msg });
  let result: unknown = { ok: true };

  try {
    switch (b.type) {
      case "category:create": {
        if (!can(me, "MANAGE_CHANNELS")) return deny();
        const name = String(b.name || "").trim().slice(0, 40);
        if (!name) return res.status(400).json({ error: "Name the category" });
        const count = await db.category.count({ where: { serverId } });
        result = await db.category.create({ data: { serverId, name, position: count } });
        break;
      }
      case "category:rename": {
        if (!can(me, "MANAGE_CHANNELS")) return deny();
        const name = String(b.name || "").trim().slice(0, 40);
        if (!name) return res.status(400).json({ error: "Name the category" });
        await db.category.updateMany({ where: { id: String(b.categoryId), serverId }, data: { name } });
        break;
      }
      case "category:delete": {
        if (!can(me, "MANAGE_CHANNELS")) return deny();
        await db.channel.updateMany({ where: { serverId, categoryId: String(b.categoryId) }, data: { categoryId: null } });
        await db.category.deleteMany({ where: { id: String(b.categoryId), serverId } });
        break;
      }
      case "reorder": {
        if (!can(me, "MANAGE_CHANNELS")) return deny();
        const groups: { id: string | null; channelIds: string[] }[] = Array.isArray(b.categories) ? b.categories : [];
        const valid = new Set((await db.category.findMany({ where: { serverId }, select: { id: true } })).map((c) => c.id));
        await db.$transaction([
          ...groups.filter((g) => g.id && valid.has(g.id)).map((g, i) => db.category.update({ where: { id: g.id! }, data: { position: i } })),
          ...groups.flatMap((g) =>
            (g.channelIds || []).map((cid, i) =>
              db.channel.updateMany({ where: { id: cid, serverId }, data: { position: i, categoryId: g.id && valid.has(g.id) ? g.id : null } })
            )
          ),
        ]);
        break;
      }
      case "channel:update": {
        if (!can(me, "MANAGE_CHANNELS")) return deny();
        const channel = await db.channel.findFirst({ where: { id: String(b.channelId), serverId } });
        if (!channel) return res.status(404).json({ error: "Channel not found" });
        const data: Prisma.ChannelUpdateInput = {};
        if (typeof b.name === "string" && b.name.trim()) {
          const name = b.name.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 40);
          if (channel.name === "general" && name !== "general") return res.status(400).json({ error: "#general can't be renamed" });
          data.name = name;
        }
        if ("topic" in b) data.topic = b.topic ? String(b.topic).slice(0, 300) : null;
        if (typeof b.isPrivate === "boolean" && channel.name !== "general") data.isPrivate = b.isPrivate;
        if (typeof b.readOnly === "boolean") data.readOnly = b.readOnly;
        if (b.slowModeSeconds !== undefined) data.slowModeSeconds = Math.max(0, Math.min(21600, Number(b.slowModeSeconds) || 0));
        if ("categoryId" in b) {
          data.category = b.categoryId
            ? { connect: { id: String(b.categoryId) } }
            : { disconnect: true };
        }
        result = await db.channel.update({ where: { id: channel.id }, data });
        if (Array.isArray(b.memberIds)) {
          const ids: string[] = Array.from(new Set([...b.memberIds.map(String), me.id]));
          const members = await db.member.findMany({ where: { id: { in: ids }, serverId }, select: { id: true } });
          await db.channelMember.deleteMany({ where: { channelId: channel.id, memberId: { notIn: members.map((m) => m.id) } } });
          for (const m of members) {
            await db.channelMember.upsert({
              where: { channelId_memberId: { channelId: channel.id, memberId: m.id } },
              create: { channelId: channel.id, memberId: m.id },
              update: {},
            });
          }
        }
        break;
      }
      case "groupDm:create": {
        const ids: string[] = Array.from(new Set([...(Array.isArray(b.memberIds) ? b.memberIds.map(String) : []), me.id]));
        const members = await db.member.findMany({ where: { id: { in: ids }, serverId }, include: { profile: true } });
        if (members.length < 3) return res.status(400).json({ error: "A group needs at least 3 people (you and two others)" });
        if (members.length > 10) return res.status(400).json({ error: "Groups can have up to 10 people" });
        const name = (typeof b.name === "string" && b.name.trim()
          ? b.name.trim()
          : members.filter((m) => m.id !== me.id).map((m) => m.profile.name.split(" ")[0]).join(", ")
        ).slice(0, 60);
        result = await db.channel.create({
          data: {
            name,
            type: ChannelType.TEXT,
            serverId,
            profileId: profile.id,
            isPrivate: true,
            isGroupDm: true,
            channelMembers: { create: members.map((m) => ({ memberId: m.id })) },
          },
        });
        break;
      }
      case "groupDm:leave": {
        const channel = await db.channel.findFirst({ where: { id: String(b.channelId), serverId, isGroupDm: true } });
        if (!channel) return res.status(404).json({ error: "Group not found" });
        await db.channelMember.deleteMany({ where: { channelId: channel.id, memberId: me.id } });
        const left = await db.channelMember.count({ where: { channelId: channel.id } });
        if (left === 0) await db.channel.delete({ where: { id: channel.id } });
        break;
      }
      case "automod": {
        if (me.role !== MemberRole.ADMIN) return deny("Only admins can change automod");
        const data: Prisma.ServerUpdateInput = {};
        if (typeof b.automodLinks === "boolean") data.automodLinks = b.automodLinks;
        if (typeof b.automodSpam === "boolean") data.automodSpam = b.automodSpam;
        if (Array.isArray(b.automodWords)) {
          data.automodWords = Array.from(new Set(b.automodWords.map((w: unknown) => String(w).trim().toLowerCase()).filter(Boolean))).slice(0, 200) as Prisma.InputJsonValue;
        }
        result = await db.server.update({ where: { id: serverId }, data, select: { automodLinks: true, automodSpam: true, automodWords: true } });
        break;
      }
      case "role:create": {
        if (!can(me, "MANAGE_ROLES")) return deny();
        const name = String(b.name || "").trim().slice(0, 32);
        if (!name) return res.status(400).json({ error: "Name the role" });
        const allBits = Object.values(PERMS).reduce((a, c) => a | c, 0);
        result = await db.role.create({
          data: {
            serverId,
            name,
            color: /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : "#99aab5",
            permissions: (Number(b.permissions) || 0) & allBits,
            position: await db.role.count({ where: { serverId } }),
          },
        });
        break;
      }
      case "role:update": {
        if (!can(me, "MANAGE_ROLES")) return deny();
        const allBits = Object.values(PERMS).reduce((a, c) => a | c, 0);
        const data: Prisma.RoleUpdateInput = {};
        if (typeof b.name === "string" && b.name.trim()) data.name = b.name.trim().slice(0, 32);
        if (/^#[0-9a-f]{6}$/i.test(b.color)) data.color = b.color;
        if (b.permissions !== undefined) data.permissions = (Number(b.permissions) || 0) & allBits;
        await db.role.updateMany({ where: { id: String(b.roleId), serverId }, data: data as any });
        break;
      }
      case "role:delete": {
        if (!can(me, "MANAGE_ROLES")) return deny();
        await db.memberCustomRole.deleteMany({ where: { roleId: String(b.roleId), role: { serverId } } });
        await db.role.deleteMany({ where: { id: String(b.roleId), serverId } });
        break;
      }
      case "role:assign":
      case "role:unassign": {
        if (!can(me, "MANAGE_ROLES")) return deny();
        const [role, target] = await Promise.all([
          db.role.findFirst({ where: { id: String(b.roleId), serverId } }),
          db.member.findFirst({ where: { id: String(b.memberId), serverId } }),
        ]);
        if (!role || !target) return res.status(404).json({ error: "Not found" });
        if (b.type === "role:assign") {
          await db.memberCustomRole.upsert({
            where: { memberId_roleId: { memberId: target.id, roleId: role.id } },
            create: { memberId: target.id, roleId: role.id },
            update: {},
          });
        } else {
          await db.memberCustomRole.deleteMany({ where: { memberId: target.id, roleId: role.id } });
        }
        break;
      }
      case "timeout": {
        if (!can(me, "MODERATE_MEMBERS")) return deny();
        const target = await db.member.findFirst({ where: { id: String(b.memberId), serverId } });
        if (!target) return res.status(404).json({ error: "Member not found" });
        if (target.role === MemberRole.ADMIN || target.id === me.id) return deny("You can't time out this person");
        const minutes = Math.max(0, Math.min(10080, Number(b.minutes) || 0));
        result = await db.member.update({
          where: { id: target.id },
          data: { timeoutUntil: minutes ? new Date(Date.now() + minutes * 60_000) : null },
        });
        break;
      }
      case "touch":
        break;
      default:
        return res.status(400).json({ error: "Unknown change" });
    }
  } catch (e) {
    console.log("[STRUCTURE]", e);
    return res.status(500).json({ error: "Internal Error" });
  }

  getIO()?.to(serverRoom(serverId)).emit(STRUCTURE_EVENT, { serverId, type: b.type });
  return res.status(200).json(result);
}
