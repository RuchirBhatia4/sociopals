"use client";

import axios from "axios";
import { Check, Copy, Hash, Lock, Megaphone, Plug, Trash2, Users, Webhook } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { UserAvatar } from "@/components/user-avatar";
import { Field, SaveBar, Tabs, Toggle, inputClass } from "@/components/settings/settings-ui";
import { useModal } from "@/hooks/use-modal-store";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Data = {
  channel: { id: string; name: string; topic: string | null; type: string; categoryId: string | null; isPrivate: boolean; readOnly: boolean; slowModeSeconds: number; serverId: string };
  memberIds: string[];
  categories: { id: string; name: string }[];
  members: { id: string; name: string; imageUrl: string; role: string }[];
  me: string;
  canManageWebhooks: boolean;
};

const SLOW = [0, 5, 10, 30, 60, 300, 900, 3600];
const slowLabel = (s: number) => (s === 0 ? "Off" : s < 60 ? `${s}s` : s < 3600 ? `${s / 60}m` : `${s / 3600}h`);

type Tab = "overview" | "access" | "posting" | "integrations" | "danger";

export const ChannelSettingsModal = () => {
  const { isOpen, type, data: modal, onClose } = useModal();
  const open = isOpen && type === "channelSettings";
  const router = useRouter();
  const params = useParams();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");
  const channelId = modal.channelId ?? "";

  const { data, refetch } = useQuery<Data>({
    queryKey: ["channel-settings", channelId],
    queryFn: () => fetch(`/api/channels/${channelId}`).then((r) => (r.ok ? r.json() : Promise.reject(r))),
    enabled: open && !!channelId,
  });

  const [form, setForm] = useState<Data["channel"] | null>(null);
  const [members, setMembers] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("");
  useEffect(() => { if (data) { setForm(data.channel); setMembers(data.memberIds); } }, [data]);
  useEffect(() => { if (open) setTab((modal.tab as Tab) ?? "overview"); }, [open, modal.tab]);

  const dirty = useMemo(() => {
    if (!data || !form) return false;
    const c = data.channel;
    return c.name !== form.name || (c.topic ?? "") !== (form.topic ?? "") || c.categoryId !== form.categoryId || c.isPrivate !== form.isPrivate ||
      c.readOnly !== form.readOnly || c.slowModeSeconds !== form.slowModeSeconds ||
      (form.isPrivate && [...members].sort().join() !== [...data.memberIds].sort().join());
  }, [data, form, members]);

  const save = async () => {
    if (!form || !data) return;
    setSaving(true);
    try {
      await axios.post("/api/socket/structure", {
        serverId: form.serverId,
        type: "channel:update",
        channelId,
        name: form.name,
        topic: form.topic,
        categoryId: form.categoryId,
        isPrivate: form.isPrivate,
        readOnly: form.readOnly,
        slowModeSeconds: form.slowModeSeconds,
        ...(form.isPrivate ? { memberIds: members } : {}),
      });
      await refetch();
      router.refresh();
      toast({ title: "Channel updated" });
    } catch (e: any) {
      toast({ title: e?.response?.data?.error ?? "Couldn't save", tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!form) return;
    if (!window.confirm(`Delete #${form.name}? Its messages are deleted too. This can't be undone.`)) return;
    try {
      await axios.delete(`/api/channels/${channelId}?serverId=${form.serverId}`);
      await axios.post("/api/socket/structure", { serverId: form.serverId, type: "touch" }).catch(() => {});
      onClose();
      if (params?.channelId === channelId) router.push(`/servers/${form.serverId}`);
      router.refresh();
    } catch (e: any) {
      toast({ title: typeof e?.response?.data === "string" ? e.response.data : "Couldn't delete", tone: "error" });
    }
  };

  const isText = form?.type === "TEXT";
  const general = form?.name === "general" && data?.channel.name === "general";
  const people = (data?.members ?? []).filter((m) => m.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); qc.removeQueries(["channel-settings", channelId]); } }}>
      <DialogContent className="bg-elevated border-border p-0 max-w-3xl w-[calc(100vw-1.5rem)] overflow-hidden grid-cols-[minmax(0,1fr)]">
        <div className="min-w-0 flex flex-col md:flex-row h-[min(640px,85vh)]">
          <div className="min-w-0 md:flex md:flex-col">
            <div className="px-4 pt-4 pb-2 hidden md:block">
              <DialogTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                {form?.isPrivate ? <Lock className="h-3 w-3" /> : <Hash className="h-3 w-3" />} {form?.name ?? modal.channelName}
              </DialogTitle>
            </div>
            <Tabs<Tab>
              value={tab}
              onChange={setTab}
              tabs={[
                { id: "overview", label: "Overview", icon: <Hash className="h-4 w-4" /> },
                { id: "access", label: "Privacy & members", icon: <Users className="h-4 w-4" />, hidden: general },
                { id: "posting", label: "Posting", icon: <Megaphone className="h-4 w-4" />, hidden: !isText },
                { id: "integrations", label: "Webhooks", icon: <Plug className="h-4 w-4" />, hidden: !isText || !data?.canManageWebhooks },
                { id: "danger", label: "Delete channel", icon: <Trash2 className="h-4 w-4" />, hidden: general },
              ]}
            />
          </div>
          <div className="flex-1 min-w-0 overflow-y-auto scrollbar-thin px-6 pt-5 pb-0">
            {!form && <p className="text-sm text-muted-foreground py-10 text-center">Loading…</p>}
            {form && tab === "overview" && (
              <div className="space-y-2 pb-6">
                <h3 className="text-lg font-semibold mb-2">Overview</h3>
                <Field label="Channel name">
                  <input className={inputClass} value={form.name} disabled={general} maxLength={40} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </Field>
                <Field label="Topic" hint="Shown in the channel header. Tell people what this channel is for.">
                  <textarea className={cn(inputClass, "h-20 py-2 resize-none")} value={form.topic ?? ""} maxLength={300} onChange={(e) => setForm({ ...form, topic: e.target.value })} placeholder="Weekly planning, links, and decisions" />
                </Field>
                <Field label="Category">
                  <select className={inputClass} value={form.categoryId ?? ""} onChange={(e) => setForm({ ...form, categoryId: e.target.value || null })}>
                    <option value="">No category (top of the list)</option>
                    {data!.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
              </div>
            )}
            {form && tab === "access" && (
              <div className="pb-6">
                <h3 className="text-lg font-semibold mb-1">Privacy & members</h3>
                <Toggle
                  checked={form.isPrivate}
                  onChange={(v) => setForm({ ...form, isPrivate: v })}
                  label="Private channel"
                  hint="Only the people below can see it, read its history, or get its notifications."
                />
                {form.isPrivate && (
                  <div className="mt-2">
                    <div className="flex items-center gap-2 mb-2">
                      <input className={cn(inputClass, "h-9")} placeholder="Find people" value={filter} onChange={(e) => setFilter(e.target.value)} />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{members.length} inside</span>
                    </div>
                    <div className="rounded-xl border border-border divide-y divide-border max-h-72 overflow-y-auto scrollbar-thin">
                      {people.map((m) => {
                        const inside = members.includes(m.id);
                        const self = m.id === data!.me;
                        return (
                          <label key={m.id} className={cn("flex items-center gap-3 px-3 h-12 cursor-pointer hover:bg-foreground/[0.03]", self && "cursor-default")}>
                            <UserAvatar src={m.imageUrl} className="h-7 w-7 md:h-7 md:w-7" />
                            <span className="text-sm flex-1 truncate">{m.name}{self && <span className="text-muted-foreground"> (you)</span>}</span>
                            <input
                              type="checkbox"
                              checked={inside || self}
                              disabled={self}
                              onChange={() => setMembers(inside ? members.filter((x) => x !== m.id) : [...members, m.id])}
                              className="h-4 w-4 accent-[hsl(var(--brand))]"
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
            {form && tab === "posting" && (
              <div className="pb-6">
                <h3 className="text-lg font-semibold mb-1">Posting</h3>
                <Toggle
                  checked={form.readOnly}
                  onChange={(v) => setForm({ ...form, readOnly: v })}
                  label="Announcement channel (read only)"
                  hint="Everyone can read and react, but only admins, moderators and roles with “Post in read-only channels” can post."
                />
                <div className="py-3">
                  <p className="text-sm font-medium">Slow mode</p>
                  <p className="text-xs text-muted-foreground mt-0.5 mb-3">How long each person waits between messages. Moderators are never slowed down.</p>
                  <div className="flex flex-wrap gap-1.5">
                    {SLOW.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setForm({ ...form, slowModeSeconds: s })}
                        className={cn("h-8 px-3 rounded-lg text-sm border transition", form.slowModeSeconds === s ? "border-brand bg-brand/[0.12]" : "border-border hover:border-foreground/30")}
                      >
                        {slowLabel(s)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {form && tab === "integrations" && <WebhooksTab channelId={channelId} />}
            {form && tab === "danger" && (
              <div className="pb-6">
                <h3 className="text-lg font-semibold mb-1">Delete channel</h3>
                <p className="text-sm text-muted-foreground mb-4">Deleting #{form.name} removes it and all of its messages for everyone. This can&apos;t be undone.</p>
                <button type="button" onClick={remove} className="h-9 px-4 rounded-lg text-sm font-medium bg-destructive text-white hover:bg-destructive/90">Delete #{form.name}</button>
              </div>
            )}
            <SaveBar dirty={dirty && tab !== "integrations" && tab !== "danger"} saving={saving} onSave={save} onReset={() => { setForm(data!.channel); setMembers(data!.memberIds); }} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

type Hook = { id: string; name: string; url: string; createdAt: string };

const WebhooksTab = ({ channelId }: { channelId: string }) => {
  const { data, refetch } = useQuery<Hook[]>({
    queryKey: ["webhooks", channelId],
    queryFn: () => fetch(`/api/webhooks?channelId=${channelId}`).then((r) => (r.ok ? r.json() : [])),
  });
  const [name, setName] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const create = async () => {
    if (!name.trim()) return;
    try {
      await axios.post("/api/webhooks", { channelId, name });
      setName("");
      refetch();
    } catch { toast({ title: "Couldn't create the webhook", tone: "error" }); }
  };
  const remove = async (id: string) => {
    if (!window.confirm("Delete this webhook? Anything using its URL will stop posting.")) return;
    await axios.delete(`/api/webhooks?id=${id}`).catch(() => {});
    refetch();
  };
  const copy = (h: Hook) => { navigator.clipboard?.writeText(h.url); setCopied(h.id); setTimeout(() => setCopied(null), 1500); };

  return (
    <div className="pb-6">
      <h3 className="text-lg font-semibold mb-1">Webhooks</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Let other apps (GitHub, CI, forms, scripts) post into this channel. Send a POST with JSON <code className="text-brand">{`{"content": "Hello"}`}</code> to the URL. Keep it secret: anyone with the URL can post.
      </p>
      <div className="flex gap-2 mb-4">
        <input className={inputClass} placeholder="Name, e.g. GitHub" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
        <button type="button" onClick={create} disabled={!name.trim()} className="h-10 px-4 rounded-lg text-sm font-medium bg-brand text-brand-foreground disabled:opacity-40 whitespace-nowrap">Create webhook</button>
      </div>
      <div className="space-y-2">
        {(data ?? []).map((h) => (
          <div key={h.id} className="rounded-xl border border-border p-3 flex items-center gap-3">
            <span className="h-9 w-9 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center flex-shrink-0"><Webhook className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{h.name}</p>
              <p className="text-xs text-muted-foreground font-mono truncate">{h.url.replace(/[^/]+$/, "••••••••")}</p>
            </div>
            <button type="button" onClick={() => copy(h)} className="h-8 px-3 rounded-lg text-xs border border-border hover:bg-foreground/[0.06] flex items-center gap-1.5">
              {copied === h.id ? <><Check className="h-3.5 w-3.5 text-brand" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy URL</>}
            </button>
            <button type="button" aria-label={`Delete ${h.name}`} onClick={() => remove(h.id)} className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {data && data.length === 0 && <p className="text-sm text-muted-foreground">No webhooks yet.</p>}
      </div>
    </div>
  );
};
