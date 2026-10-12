"use client";

import axios from "axios";
import { UserProfile } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { addDays, addHours, addMinutes, endOfDay, format, nextMonday, startOfDay } from "date-fns";
import { Bell, Bot, Download, Github, Hash, KeyRound, Moon, Palette, ShieldCheck, Smile, Trash2, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AiKeys } from "@/components/settings/ai-keys";
import { GithubConnect } from "@/components/project/github-connect";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { EmojiPicker } from "@/components/emoji-picker";
import { Field, Tabs, Toggle, inputClass } from "@/components/settings/settings-ui";
import { useModal } from "@/hooks/use-modal-store";
import { useMe } from "@/hooks/use-me";
import { toast } from "@/hooks/use-toast";
import { usePreferences } from "@/lib/preferences";
import { cn } from "@/lib/utils";

type Tab = "status" | "focus" | "notifications" | "ai" | "github" | "appearance" | "privacy" | "security";

const PRESETS = [
  { emoji: "📅", text: "In a meeting", minutes: 60 },
  { emoji: "🚌", text: "Commuting", minutes: 30 },
  { emoji: "🎧", text: "Heads down", minutes: 120 },
  { emoji: "🤒", text: "Out sick", minutes: -1 },
  { emoji: "🌴", text: "On vacation", minutes: -2 },
];

const CLEAR = [
  { label: "Don't clear", at: () => null },
  { label: "30 minutes", at: () => addMinutes(new Date(), 30) },
  { label: "1 hour", at: () => addHours(new Date(), 1) },
  { label: "4 hours", at: () => addHours(new Date(), 4) },
  { label: "Today", at: () => endOfDay(new Date()) },
  { label: "This week", at: () => startOfDay(nextMonday(new Date())) },
];

const toTime = (m: number | null) => (m == null ? "" : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
const fromTime = (v: string) => (v ? Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5)) : null);

/** Your status, focus mode, notifications, appearance, privacy and security in one place. */
export const SettingsModal = () => {
  const { isOpen, type, data, onClose } = useModal();
  const open = isOpen && type === "settings";
  const [tab, setTab] = useState<Tab>("status");
  useEffect(() => { if (open) setTab((data.tab as Tab) ?? "status"); }, [open, data.tab]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-elevated border-border p-0 max-w-4xl w-[calc(100vw-1.5rem)] overflow-hidden grid-cols-[minmax(0,1fr)]">
        <div className="min-w-0 flex flex-col md:flex-row h-[min(700px,90vh)]">
          <div className="min-w-0 md:flex md:flex-col">
            <div className="px-4 pt-4 pb-2 hidden md:block">
              <DialogTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your settings</DialogTitle>
            </div>
            <Tabs<Tab>
              value={tab}
              onChange={setTab}
              tabs={[
                { id: "status", label: "Status", icon: <Smile className="h-4 w-4" /> },
                { id: "focus", label: "Focus & quiet hours", icon: <Moon className="h-4 w-4" /> },
                { id: "notifications", label: "Notifications", icon: <Bell className="h-4 w-4" /> },
                { id: "ai", label: "AI keys", icon: <Bot className="h-4 w-4" /> },
                { id: "github", label: "GitHub", icon: <Github className="h-4 w-4" /> },
                { id: "appearance", label: "Appearance", icon: <Palette className="h-4 w-4" /> },
                { id: "privacy", label: "Privacy & data", icon: <ShieldCheck className="h-4 w-4" /> },
                { id: "security", label: "Sign-in & security", icon: <KeyRound className="h-4 w-4" /> },
              ]}
            />
          </div>
          <div className={cn("flex-1 min-w-0 overflow-y-auto scrollbar-thin", tab === "security" ? "p-0" : "px-6 py-5")}>
            {tab === "status" && <StatusTab />}
            {tab === "focus" && <FocusTab />}
            {tab === "notifications" && <NotificationsTab />}
            {tab === "ai" && (
              <div>
                <h3 className="text-lg font-semibold mb-1">AI keys</h3>
                <p className="text-sm text-muted-foreground mb-4">Bring your own Claude or ChatGPT for help with project tasks. It&apos;s billed to your own account, and only you can use it.</p>
                <AiKeys />
              </div>
            )}
            {tab === "github" && <GithubTab />}
            {tab === "appearance" && <AppearanceTab />}
            {tab === "privacy" && <PrivacyTab />}
            {tab === "security" && <SecurityTab />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const StatusTab = () => {
  const { me, update } = useMe();
  const [emoji, setEmoji] = useState("");
  const [text, setText] = useState("");
  const [clear, setClear] = useState(0);
  useEffect(() => { if (me) { setEmoji(me.statusEmoji ?? ""); setText(me.statusText ?? ""); } }, [me]);

  const save = async (e = emoji, t = text, at: Date | null = CLEAR[clear].at()) => {
    await update({ statusEmoji: e || null, statusText: t.trim() || null, statusExpiresAt: at ? at.toISOString() : null } as any);
    toast({ title: t.trim() || e ? "Status set" : "Status cleared" });
  };
  const preset = (p: (typeof PRESETS)[number]) => {
    const at = p.minutes > 0 ? addMinutes(new Date(), p.minutes) : p.minutes === -1 ? endOfDay(new Date()) : null;
    setEmoji(p.emoji); setText(p.text);
    save(p.emoji, p.text, at);
  };

  return (
    <div>
      <h3 className="text-lg font-semibold mb-1">Status</h3>
      <p className="text-sm text-muted-foreground mb-4">Let people know what you&apos;re up to. It shows next to your name everywhere.</p>
      <div className="flex gap-2">
        <div className="h-10 w-12 rounded-lg border border-border bg-background flex items-center justify-center text-lg relative">
          {emoji ? <button type="button" aria-label="Remove emoji" onClick={() => setEmoji("")}>{emoji}</button> : <EmojiPicker onChange={setEmoji} label="Pick a status emoji" side="bottom" align="start" />}
        </div>
        <input className={inputClass} placeholder="What's your status?" maxLength={80} value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <Field label="Clear after">
        <div className="flex flex-wrap gap-1.5">
          {CLEAR.map((c, i) => (
            <button key={c.label} type="button" onClick={() => setClear(i)} className={cn("h-8 px-3 rounded-lg text-sm border", clear === i ? "border-brand bg-brand/[0.12]" : "border-border hover:border-foreground/30")}>{c.label}</button>
          ))}
        </div>
      </Field>
      <div className="flex gap-2 mt-3">
        <button type="button" onClick={() => save()} className="h-9 px-4 rounded-lg text-sm font-medium bg-brand text-brand-foreground">Save status</button>
        {(me?.statusText || me?.statusEmoji) && (
          <button type="button" onClick={() => { setEmoji(""); setText(""); save("", "", null); }} className="h-9 px-4 rounded-lg text-sm hover:bg-foreground/[0.06]">Clear status</button>
        )}
      </div>
      {me?.statusExpiresAt && <p className="text-xs text-muted-foreground mt-2">Clears {format(new Date(me.statusExpiresAt), "EEE d MMM 'at' HH:mm")}</p>}
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-6 mb-2">Quick picks</p>
      <div className="grid sm:grid-cols-2 gap-2">
        {PRESETS.map((p) => (
          <button key={p.text} type="button" onClick={() => preset(p)} className="h-11 px-3 rounded-xl border border-border hover:border-foreground/30 flex items-center gap-3 text-sm text-left">
            <span className="text-lg">{p.emoji}</span>
            <span className="flex-1">{p.text}</span>
            <span className="text-xs text-muted-foreground">{p.minutes > 0 ? (p.minutes >= 60 ? `${p.minutes / 60} h` : `${p.minutes} min`) : p.minutes === -1 ? "Today" : "Until cleared"}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

const FocusTab = () => {
  const { me, update, focusOn } = useMe();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  useEffect(() => { if (me) { setStart(toTime(me.quietStart)); setEnd(toTime(me.quietEnd)); } }, [me]);
  const tz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";

  const focus = (until: Date | null) => update({ focusUntil: until ? until.toISOString() : null } as any).then(() =>
    toast({ title: until ? `Focus mode on until ${format(until, "HH:mm")}` : "Focus mode off" })
  );

  return (
    <div>
      <h3 className="text-lg font-semibold mb-1">Focus mode</h3>
      <p className="text-sm text-muted-foreground mb-4">Pause every notification for a while. Everything still lands in your inbox, so nothing is lost.</p>
      {focusOn ? (
        <div className="rounded-2xl border border-violet-500/40 bg-violet-500/10 p-4 flex items-center gap-3">
          <Moon className="h-5 w-5 text-violet-300" />
          <p className="text-sm flex-1">Focusing until <span className="font-semibold">{format(new Date(me!.focusUntil!), "HH:mm")}</span></p>
          <button type="button" onClick={() => focus(null)} className="h-8 px-3 rounded-lg text-sm bg-foreground/10 hover:bg-foreground/15">End now</button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {[
            { label: "30 minutes", at: () => addMinutes(new Date(), 30) },
            { label: "1 hour", at: () => addHours(new Date(), 1) },
            { label: "2 hours", at: () => addHours(new Date(), 2) },
            { label: "Until tomorrow", at: () => startOfDay(addDays(new Date(), 1)) },
          ].map((o) => (
            <button key={o.label} type="button" onClick={() => focus(o.at())} className="h-9 px-4 rounded-lg text-sm border border-border hover:border-violet-400/60 hover:bg-violet-500/10">{o.label}</button>
          ))}
        </div>
      )}

      <h3 className="text-lg font-semibold mt-8 mb-1">Quiet hours</h3>
      <p className="text-sm text-muted-foreground mb-3">Every day between these times, no desktop alerts. Uses your time zone ({tz}).</p>
      <div className="flex items-center gap-3 flex-wrap">
        <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={cn(inputClass, "w-36 [color-scheme:dark]")} aria-label="Quiet hours start" />
        <span className="text-sm text-muted-foreground">to</span>
        <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={cn(inputClass, "w-36 [color-scheme:dark]")} aria-label="Quiet hours end" />
        <button
          type="button"
          onClick={() => update({ quietStart: fromTime(start), quietEnd: fromTime(end), timeZone: tz } as any).then(() => toast({ title: start && end ? `Quiet from ${start} to ${end}` : "Quiet hours off" }))}
          className="h-10 px-4 rounded-lg text-sm font-medium bg-brand text-brand-foreground"
        >
          Save
        </button>
        {me?.quietStart != null && (
          <button type="button" onClick={() => { setStart(""); setEnd(""); update({ quietStart: null, quietEnd: null } as any); }} className="h-10 px-3 rounded-lg text-sm hover:bg-foreground/[0.06]">Turn off</button>
        )}
      </div>
      {!start && !end && (
        <button type="button" onClick={() => { setStart("22:00"); setEnd("08:00"); }} className="text-xs text-brand hover:underline mt-2">Suggest 22:00 to 08:00</button>
      )}
    </div>
  );
};

const NotificationsTab = () => {
  const { me, update } = useMe();
  const [perm, setPerm] = useState<string>("default");
  const [kw, setKw] = useState("");
  useEffect(() => { if (typeof Notification !== "undefined") setPerm(Notification.permission); }, []);

  const ask = async () => {
    if (typeof Notification === "undefined") return;
    const p = await Notification.requestPermission();
    setPerm(p);
    if (p === "granted") new Notification("Sociopals", { body: "Desktop notifications are on.", icon: "/favicon.ico" });
  };
  const addKw = () => {
    const k = kw.trim().toLowerCase();
    if (k.length < 2 || !me) return;
    update({ keywords: Array.from(new Set([...me.keywords, k])) } as any);
    setKw("");
  };

  return (
    <div>
      <h3 className="text-lg font-semibold mb-1">Notifications</h3>
      <p className="text-sm text-muted-foreground mb-2">By default you&apos;re only notified about mentions, replies and DMs. Change any channel from its bell icon.</p>
      <div className="divide-y divide-border">
        <Toggle
          label="Desktop notifications"
          hint="Pop-ups when the app is in the background. Your tab title always shows the unread count."
          checked={!!me?.desktopNotify}
          onChange={(v) => update({ desktopNotify: v } as any)}
        />
      </div>
      {me?.desktopNotify && perm !== "granted" && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 flex items-center gap-3 mt-1">
          <Bell className="h-4 w-4 text-amber-300" />
          <p className="text-sm flex-1">{perm === "denied" ? "Your browser is blocking notifications for this site. Allow them in the address bar's site settings." : "Your browser needs permission first."}</p>
          {perm !== "denied" && <button type="button" onClick={ask} className="h-8 px-3 rounded-lg text-sm bg-amber-500/20 hover:bg-amber-500/30">Allow</button>}
        </div>
      )}

      <h3 className="text-lg font-semibold mt-8 mb-1">Keyword alerts</h3>
      <p className="text-sm text-muted-foreground mb-3">Get notified when anyone, in any channel you can see, says one of these words. Great for your project name or &ldquo;deploy&rdquo;.</p>
      <div className="flex gap-2">
        <input className={inputClass} placeholder="Add a word or phrase" value={kw} maxLength={40} onChange={(e) => setKw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addKw()} />
        <button type="button" onClick={addKw} disabled={kw.trim().length < 2} className="h-10 px-4 rounded-lg text-sm font-medium bg-brand text-brand-foreground disabled:opacity-40">Add</button>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-3">
        {(me?.keywords ?? []).map((k) => (
          <span key={k} className="h-7 pl-3 pr-1.5 rounded-full bg-mention/[0.15] text-sm flex items-center gap-1.5">
            <Hash className="h-3 w-3 opacity-60" /> {k}
            <button type="button" aria-label={`Remove ${k}`} onClick={() => update({ keywords: me!.keywords.filter((x) => x !== k) } as any)} className="h-5 w-5 rounded-full flex items-center justify-center hover:bg-foreground/10"><X className="h-3 w-3" /></button>
          </span>
        ))}
        {me && me.keywords.length === 0 && <p className="text-xs text-muted-foreground">No keywords yet.</p>}
      </div>
    </div>
  );
};

const AppearanceTab = () => {
  const { theme, setTheme } = useTheme();
  const { prefs, update } = usePreferences();
  const Choice = ({ on, onClick, title, hint }: { on: boolean; onClick: () => void; title: string; hint: string }) => (
    <button type="button" onClick={onClick} className={cn("flex-1 rounded-xl border p-3 text-left transition", on ? "border-brand bg-brand/[0.08]" : "border-border hover:border-foreground/30")}>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
    </button>
  );
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-3">Theme</h3>
        <div className="flex gap-2">
          <Choice on={theme === "dark"} onClick={() => setTheme("dark")} title="Dark" hint="Easy on the eyes at night" />
          <Choice on={theme === "light"} onClick={() => setTheme("light")} title="Light" hint="Crisp in bright rooms" />
        </div>
      </div>
      <div>
        <h3 className="text-lg font-semibold mb-3">Message density</h3>
        <div className="flex gap-2">
          <Choice on={prefs.density === "cozy"} onClick={() => update({ density: "cozy" })} title="Cozy" hint="Room to breathe" />
          <Choice on={prefs.density === "compact"} onClick={() => update({ density: "compact" })} title="Compact" hint="More messages on screen" />
        </div>
      </div>
      <div>
        <h3 className="text-lg font-semibold mb-3">Avatars</h3>
        <div className="flex gap-2">
          <Choice on={prefs.avatar === "round"} onClick={() => update({ avatar: "round" })} title="Round" hint="Classic circles" />
          <Choice on={prefs.avatar === "square"} onClick={() => update({ avatar: "square" })} title="Rounded square" hint="A little more modern" />
        </div>
      </div>
    </div>
  );
};

const PrivacyTab = () => {
  const { me } = useMe();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    try {
      setBusy(true);
      await axios.delete("/api/me", { data: { confirm } });
      window.location.href = "/";
    } catch (e: any) {
      toast({ title: typeof e?.response?.data === "string" ? e.response.data : "Couldn't delete your account", tone: "error" });
      setBusy(false);
    }
  };
  return (
    <div>
      <h3 className="text-lg font-semibold mb-1">Privacy</h3>
      <ul className="text-sm text-muted-foreground space-y-1.5 mb-6">
        <li className="flex gap-2"><ShieldCheck className="h-4 w-4 text-brand flex-shrink-0 mt-0.5" /> We never ask for ID, a face scan or a phone number to use Sociopals.</li>
        <li className="flex gap-2"><ShieldCheck className="h-4 w-4 text-brand flex-shrink-0 mt-0.5" /> Messages are only sent to people who can see the chat; private channels stay private, including in search and notifications.</li>
        <li className="flex gap-2"><ShieldCheck className="h-4 w-4 text-brand flex-shrink-0 mt-0.5" /> No ads, and your messages are never sold. AI summaries only run when you press the button.</li>
      </ul>

      <h3 className="text-lg font-semibold mb-1">Download your data</h3>
      <p className="text-sm text-muted-foreground mb-3">A JSON file with your profile, servers, every message you&apos;ve sent, reactions, saved items and settings.</p>
      <a href="/api/me" download className="inline-flex h-9 px-4 rounded-lg text-sm font-medium border border-border hover:bg-foreground/[0.06] items-center gap-2">
        <Download className="h-4 w-4" /> Download my data
      </a>

      <div className="mt-10 rounded-2xl border border-destructive/40 p-4">
        <h3 className="text-base font-semibold text-destructive flex items-center gap-2"><Trash2 className="h-4 w-4" /> Delete account</h3>
        <p className="text-sm text-muted-foreground mt-1 mb-3">
          Permanently deletes your account, your messages and any servers you own. Download your data first if you want a copy. This can&apos;t be undone.
        </p>
        <Field label={`Type your name (${me?.name ?? ""}) to confirm`}>
          <input className={inputClass} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <button type="button" onClick={remove} disabled={!me || confirm.trim() !== me.name.trim() || busy} className="h-9 px-4 rounded-lg text-sm font-medium bg-destructive text-white disabled:opacity-40">
          {busy ? "Deleting…" : "Delete my account forever"}
        </button>
      </div>
    </div>
  );
};

const SecurityTab = () => {
  const { resolvedTheme } = useTheme();
  return (
    <div className="h-full">
      <div className="px-6 pt-5">
        <h3 className="text-lg font-semibold mb-1">Sign-in & security</h3>
        <p className="text-sm text-muted-foreground mb-3">Turn on two-step verification, see every device that&apos;s signed in and sign out the ones you don&apos;t recognise.</p>
      </div>
      <div className="px-2 [&_.cl-rootBox]:w-full [&_.cl-card]:shadow-none [&_.cl-card]:bg-transparent [&_.cl-card]:w-full [&_.cl-card]:max-w-none">
        <UserProfile
          routing="hash"
          appearance={{
            baseTheme: resolvedTheme === "dark" ? dark : undefined,
            variables: { colorPrimary: "#04E3AD" },
          }}
        />
      </div>
    </div>
  );
};

const GithubTab = () => {
  const qc = useQueryClient();
  const { data } = useQuery<{ configured: boolean; connected: boolean; login: string | null }>({
    queryKey: ["github"],
    queryFn: () => fetch("/api/github").then((r) => r.json()),
  });
  return (
    <div>
      <h3 className="text-lg font-semibold mb-1">GitHub</h3>
      <p className="text-sm text-muted-foreground mb-4">Used in project channels to open branches for your tasks, catch up with main and open pull requests, under your own name.</p>
      {data && <GithubConnect {...data} />}
      {data?.connected && (
        <button
          type="button"
          onClick={async () => { await fetch("/api/github", { method: "DELETE" }); qc.invalidateQueries(["github"]); qc.invalidateQueries(["project"]); }}
          className="mt-3 text-sm text-destructive hover:underline"
        >
          Disconnect GitHub
        </button>
      )}
    </div>
  );
};
