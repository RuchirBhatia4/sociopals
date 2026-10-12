"use client";

import axios from "axios";
import { formatDistanceToNowStrict } from "date-fns";
import { Ban, Bot, Clock, Plus, Shield, ShieldAlert, Trash2, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { UserAvatar } from "@/components/user-avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, Tabs, Toggle, inputClass } from "@/components/settings/settings-ui";
import { useModal } from "@/hooks/use-modal-store";
import { toast } from "@/hooks/use-toast";
import { PERMS, PERM_LABELS, type PermKey } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type Role = { id: string; name: string; color: string; permissions: number; count: number };
type M = { id: string; name: string; imageUrl: string; role: string; roleIds: string[]; timeoutUntil: string | null };
type Data = {
  server: { id: string; name: string; automodLinks: boolean; automodSpam: boolean; automodWords: string[] | null };
  roles: Role[];
  members: M[];
  me: { id: string; isAdmin: boolean; perms: number };
};
type Tab = "roles" | "members" | "moderation";

const COLORS = ["#04E3AD", "#38bdf8", "#a78bfa", "#f472b6", "#fb923c", "#facc15", "#f87171", "#99aab5"];
const TIMEOUTS = [{ label: "5 minutes", m: 5 }, { label: "1 hour", m: 60 }, { label: "1 day", m: 1440 }, { label: "1 week", m: 10080 }];

export const ServerSettingsModal = () => {
  const { isOpen, type, data: modal, onClose } = useModal();
  const open = isOpen && type === "serverSettings";
  const serverId = modal.serverId ?? modal.server?.id ?? "";
  const [tab, setTab] = useState<Tab>("roles");
  useEffect(() => { if (open) setTab((modal.tab as Tab) ?? "roles"); }, [open, modal.tab]);

  const { data, refetch } = useQuery<Data>({
    queryKey: ["server-settings", serverId],
    queryFn: () => fetch(`/api/servers/${serverId}/settings`).then((r) => (r.ok ? r.json() : Promise.reject(r))),
    enabled: open && !!serverId,
  });

  const structure = async (body: object, ok?: string) => {
    try {
      await axios.post("/api/socket/structure", { serverId, ...body });
      await refetch();
      if (ok) toast({ title: ok });
      return true;
    } catch (e: any) {
      toast({ title: e?.response?.data?.error ?? "That didn't work", tone: "error" });
      return false;
    }
  };

  const canRoles = !!data && (data.me.perms & PERMS.MANAGE_ROLES) !== 0;
  const canModerate = !!data && (data.me.perms & PERMS.MODERATE_MEMBERS) !== 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-elevated border-border p-0 max-w-4xl w-[calc(100vw-1.5rem)] overflow-hidden grid-cols-[minmax(0,1fr)]">
        <div className="min-w-0 flex flex-col md:flex-row h-[min(680px,88vh)]">
          <div className="min-w-0 md:flex md:flex-col">
            <div className="px-4 pt-4 pb-2 hidden md:block">
              <DialogTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate">{data?.server.name ?? modal.server?.name}</DialogTitle>
            </div>
            <Tabs<Tab>
              value={tab}
              onChange={setTab}
              tabs={[
                { id: "roles", label: "Roles", icon: <Shield className="h-4 w-4" />, hidden: !canRoles },
                { id: "members", label: "Members", icon: <Users className="h-4 w-4" /> },
                { id: "moderation", label: "AutoMod", icon: <Bot className="h-4 w-4" />, hidden: !data?.me.isAdmin },
              ]}
            />
          </div>
          <div className="flex-1 min-w-0 overflow-y-auto scrollbar-thin px-6 py-5">
            {!data && <p className="text-sm text-muted-foreground py-10 text-center">Loading…</p>}
            {data && tab === "roles" && canRoles && <RolesTab data={data} structure={structure} />}
            {data && tab === "members" && <MembersTab data={data} structure={structure} canRoles={canRoles} canModerate={canModerate} />}
            {data && tab === "moderation" && data.me.isAdmin && <AutomodTab data={data} structure={structure} />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

type S = (body: object, ok?: string) => Promise<boolean>;

const RolesTab = ({ data, structure }: { data: Data; structure: S }) => {
  const [selected, setSelected] = useState<string | null>(data.roles[0]?.id ?? null);
  const role = data.roles.find((r) => r.id === selected) ?? null;
  const [draft, setDraft] = useState<Role | null>(role);
  useEffect(() => setDraft(role), [role?.id, role?.name, role?.color, role?.permissions]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async () => {
    const ok = await structure({ type: "role:create", name: "New role", color: COLORS[data.roles.length % COLORS.length] });
    if (ok) setSelected(null);
  };
  useEffect(() => { if (!selected && data.roles[0]) setSelected(data.roles[data.roles.length - 1]?.id ?? null); }, [data.roles, selected]);

  const dirty = !!draft && !!role && (draft.name !== role.name || draft.color !== role.color || draft.permissions !== role.permissions);

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <h3 className="text-lg font-semibold flex-1">Roles</h3>
        <button type="button" onClick={create} className="h-8 px-3 rounded-lg text-sm bg-brand text-brand-foreground font-medium flex items-center gap-1.5"><Plus className="h-4 w-4" /> Create role</button>
      </div>
      <p className="text-sm text-muted-foreground mb-4">Roles add permissions on top of Admin, Moderator and Guest. Give someone a role from the Members tab.</p>
      {data.roles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No custom roles yet. Create one for things like <span className="text-foreground">Designers</span> or <span className="text-foreground">Event hosts</span>.
        </div>
      ) : (
        <div className="grid md:grid-cols-[200px_1fr] gap-4">
          <div className="space-y-1">
            {data.roles.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelected(r.id)}
                className={cn("w-full h-9 px-3 rounded-lg flex items-center gap-2 text-sm text-left", selected === r.id ? "bg-foreground/[0.09]" : "hover:bg-foreground/[0.04]")}
              >
                <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ background: r.color }} />
                <span className="flex-1 truncate">{r.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{r.count}</span>
              </button>
            ))}
          </div>
          {draft && (
            <div className="rounded-xl border border-border p-4">
              <Field label="Name">
                <input className={inputClass} value={draft.name} maxLength={32} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </Field>
              <Field label="Color">
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map((c) => (
                    <button key={c} type="button" aria-label={`Color ${c}`} onClick={() => setDraft({ ...draft, color: c })} className={cn("h-8 w-8 rounded-full border-2 transition", draft.color === c ? "border-foreground scale-110" : "border-transparent")} style={{ background: c }} />
                  ))}
                </div>
              </Field>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-3">Permissions</p>
              <div className="divide-y divide-border">
                {(Object.keys(PERMS) as PermKey[]).map((k) => (
                  <Toggle
                    key={k}
                    label={PERM_LABELS[k]}
                    checked={(draft.permissions & PERMS[k]) !== 0}
                    onChange={(v) => setDraft({ ...draft, permissions: v ? draft.permissions | PERMS[k] : draft.permissions & ~PERMS[k] })}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => window.confirm(`Delete the ${draft.name} role?`) && structure({ type: "role:delete", roleId: draft.id }, "Role deleted").then(() => setSelected(null))}
                  className="h-9 px-3 rounded-lg text-sm text-destructive hover:bg-destructive/10 flex items-center gap-1.5"
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
                <div className="flex-1" />
                {dirty && <button type="button" onClick={() => setDraft(role)} className="h-9 px-3 rounded-lg text-sm hover:bg-foreground/[0.06]">Reset</button>}
                <button
                  type="button"
                  disabled={!dirty}
                  onClick={() => structure({ type: "role:update", roleId: draft.id, name: draft.name, color: draft.color, permissions: draft.permissions }, "Role saved")}
                  className="h-9 px-4 rounded-lg text-sm font-medium bg-brand text-brand-foreground disabled:opacity-40"
                >
                  Save role
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const MembersTab = ({ data, structure, canRoles, canModerate }: { data: Data; structure: S; canRoles: boolean; canModerate: boolean }) => {
  const [q, setQ] = useState("");
  const list = data.members.filter((m) => m.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <h3 className="text-lg font-semibold mb-1">Members</h3>
      <p className="text-sm text-muted-foreground mb-4">Give roles, or time someone out: they can still read but can&apos;t post or react until it ends.</p>
      <input className={cn(inputClass, "mb-3")} placeholder="Find a member" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="rounded-xl border border-border divide-y divide-border">
        {list.map((m) => {
          const self = m.id === data.me.id;
          return (
            <div key={m.id} className="flex items-center gap-3 px-3 py-2.5 flex-wrap">
              <UserAvatar src={m.imageUrl} className="h-8 w-8 md:h-8 md:w-8" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  {m.name}
                  {m.role === "ADMIN" && <ShieldAlert className="h-3.5 w-3.5 text-rose-500" />}
                  {m.role === "MODERATOR" && <Shield className="h-3.5 w-3.5 text-sky-500" />}
                </p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {m.roleIds.map((rid) => {
                    const r = data.roles.find((x) => x.id === rid);
                    if (!r) return null;
                    return (
                      <span key={rid} className="inline-flex items-center gap-1 h-5 pl-1.5 pr-1 rounded-full border border-border text-[11px]">
                        <span className="h-2 w-2 rounded-full" style={{ background: r.color }} /> {r.name}
                        {canRoles && (
                          <button type="button" aria-label={`Remove ${r.name}`} onClick={() => structure({ type: "role:unassign", roleId: rid, memberId: m.id })} className="text-muted-foreground hover:text-foreground">
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </span>
                    );
                  })}
                  {m.timeoutUntil && (
                    <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded-full bg-amber-500/[0.15] text-amber-300 text-[11px]">
                      <Clock className="h-3 w-3" /> Timed out, ends {formatDistanceToNowStrict(new Date(m.timeoutUntil), { addSuffix: true })}
                    </span>
                  )}
                </div>
              </div>
              {canRoles && data.roles.some((r) => !m.roleIds.includes(r.id)) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className="h-8 px-2.5 rounded-lg text-xs border border-border hover:bg-foreground/[0.06] flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> Role</button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {data.roles.filter((r) => !m.roleIds.includes(r.id)).map((r) => (
                      <DropdownMenuItem key={r.id} onClick={() => structure({ type: "role:assign", roleId: r.id, memberId: m.id })}>
                        <span className="h-2.5 w-2.5 rounded-full mr-2" style={{ background: r.color }} /> {r.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {canModerate && !self && m.role !== "ADMIN" && (
                m.timeoutUntil ? (
                  <button type="button" onClick={() => structure({ type: "timeout", memberId: m.id, minutes: 0 }, `${m.name}'s timeout lifted`)} className="h-8 px-2.5 rounded-lg text-xs border border-border hover:bg-foreground/[0.06]">
                    Lift timeout
                  </button>
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" className="h-8 px-2.5 rounded-lg text-xs border border-border hover:bg-foreground/[0.06] flex items-center gap-1"><Ban className="h-3.5 w-3.5" /> Timeout</button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Time out {m.name.split(" ")[0]} for</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {TIMEOUTS.map((t) => (
                        <DropdownMenuItem key={t.m} onClick={() => structure({ type: "timeout", memberId: m.id, minutes: t.m }, `${m.name} is timed out for ${t.label}`)}>{t.label}</DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const AutomodTab = ({ data, structure }: { data: Data; structure: S }) => {
  const [words, setWords] = useState((data.server.automodWords ?? []).join(", "));
  const saved = (data.server.automodWords ?? []).join(", ");
  return (
    <div>
      <h3 className="text-lg font-semibold mb-1">AutoMod</h3>
      <p className="text-sm text-muted-foreground mb-2">Stops trouble before anyone has to see it. Admins and moderators are never filtered.</p>
      <div className="divide-y divide-border">
        <Toggle
          label="Block spam floods"
          hint="Slows down anyone sending more than 6 messages in 10 seconds."
          checked={data.server.automodSpam}
          onChange={(v) => structure({ type: "automod", automodSpam: v })}
        />
        <Toggle
          label="Block links from guests"
          hint="Guests can't post links; members with a role or above can."
          checked={data.server.automodLinks}
          onChange={(v) => structure({ type: "automod", automodLinks: v })}
        />
      </div>
      <Field label="Blocked words" hint="Separate with commas. Messages containing these are refused with a polite note.">
        <textarea className={cn(inputClass, "h-24 py-2 resize-none")} value={words} onChange={(e) => setWords(e.target.value)} placeholder="word, another phrase" />
      </Field>
      {words !== saved && (
        <button
          type="button"
          onClick={() => structure({ type: "automod", automodWords: words.split(",").map((w) => w.trim()).filter(Boolean) }, "Blocked words saved")}
          className="h-9 px-4 rounded-lg text-sm font-medium bg-brand text-brand-foreground"
        >
          Save words
        </button>
      )}
    </div>
  );
};
