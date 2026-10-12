import { Channel, Member, MemberRole } from "@prisma/client";

/*
  Custom-role permissions, stored as a bitmask on Role.permissions.
  Built-in roles: ADMIN can do everything; MODERATOR gets the moderation set;
  GUEST gets nothing extra. Custom roles add on top of the built-in role.
*/
export const PERMS = {
  MANAGE_CHANNELS: 1 << 0, // create / edit / delete channels and categories
  MANAGE_MESSAGES: 1 << 1, // delete others' messages, pin, mark decisions
  MODERATE_MEMBERS: 1 << 2, // time people out
  MENTION_EVERYONE: 1 << 3, // @everyone / @here
  MANAGE_WEBHOOKS: 1 << 4,
  POST_IN_READ_ONLY: 1 << 5, // speak in announcement channels
  MANAGE_ROLES: 1 << 6,
} as const;

export type PermKey = keyof typeof PERMS;

export const PERM_LABELS: Record<PermKey, string> = {
  MANAGE_CHANNELS: "Manage channels and categories",
  MANAGE_MESSAGES: "Pin, mark decisions, delete others' messages",
  MODERATE_MEMBERS: "Time out members",
  MENTION_EVERYONE: "Mention @everyone and @here",
  MANAGE_WEBHOOKS: "Manage webhooks",
  POST_IN_READ_ONLY: "Post in read-only channels",
  MANAGE_ROLES: "Manage roles",
};

const ALL = Object.values(PERMS).reduce((a, b) => a | b, 0);
const MODERATOR =
  PERMS.MANAGE_CHANNELS | PERMS.MANAGE_MESSAGES | PERMS.MODERATE_MEMBERS |
  PERMS.MENTION_EVERYONE | PERMS.MANAGE_WEBHOOKS | PERMS.POST_IN_READ_ONLY;

type MemberWithRoles = Member & { customRoles?: { role: { permissions: number } }[] };

/** Effective permission bits for a member. */
export function permsOf(member: MemberWithRoles): number {
  if (member.role === MemberRole.ADMIN) return ALL;
  let bits = member.role === MemberRole.MODERATOR ? MODERATOR : 0;
  for (const r of member.customRoles ?? []) bits |= r.role.permissions;
  return bits;
}

export const can = (member: MemberWithRoles, perm: PermKey) => (permsOf(member) & PERMS[perm]) !== 0;

export const isTimedOut = (member: Pick<Member, "timeoutUntil">) =>
  !!member.timeoutUntil && member.timeoutUntil.getTime() > Date.now();

/** Why this member may not post in this channel right now (null = allowed). */
export function postBlockReason(member: MemberWithRoles, channel: Channel): string | null {
  if (isTimedOut(member)) {
    return `You're in a timeout until ${member.timeoutUntil!.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`;
  }
  if (channel.readOnly && !can(member, "POST_IN_READ_ONLY")) {
    return "Only admins and moderators can post in this channel.";
  }
  return null;
}
