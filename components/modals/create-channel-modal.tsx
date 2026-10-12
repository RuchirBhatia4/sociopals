"use client";

import axios from "axios";
import qs from "query-string";
import { ChannelType } from "@prisma/client";
import { FolderGit2, Hash, Lock, Mic, Video } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useModal } from "@/hooks/use-modal-store";
import { cn } from "@/lib/utils";

const TYPES = [
  { type: ChannelType.TEXT, project: false, label: "Text", hint: "Messages, files, polls, threads", icon: Hash },
  { type: ChannelType.TEXT, project: true, label: "Project", hint: "GitHub repo, tasks, branches, AI", icon: FolderGit2 },
  { type: ChannelType.AUDIO, project: false, label: "Voice", hint: "Hang out and talk", icon: Mic },
  { type: ChannelType.VIDEO, project: false, label: "Video", hint: "Face to face, share your screen", icon: Video },
];

export const CreateChannelModal = () => {
  const { isOpen, onClose, type, data } = useModal();
  const router = useRouter();
  const params = useParams();
  const isModalOpen = isOpen && type === "createChannel";

  const [name, setName] = useState("");
  const [kind, setKind] = useState<ChannelType>(ChannelType.TEXT);
  const [isPrivate, setIsPrivate] = useState(false);
  const [isProject, setIsProject] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isModalOpen) {
      setName(""); setIsPrivate(false); setIsProject(false); setError(null);
      setKind(data.channelType ?? ChannelType.TEXT);
    }
  }, [isModalOpen, data.channelType]);

  const slug = name.trim().toLowerCase().replace(/\s+/g, "-");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug) return;
    try {
      setBusy(true);
      setError(null);
      const serverId = params?.serverId as string;
      const { data: channel } = await axios.post(qs.stringifyUrl({ url: "/api/channels", query: { serverId } }), {
        name: slug, type: kind, isPrivate, isProject, categoryId: data.categoryId ?? null,
      });
      await axios.post("/api/socket/structure", { serverId, type: "touch" }).catch(() => {});
      onClose();
      router.push(`/servers/${serverId}/channels/${channel.id}`);
      router.refresh();
    } catch (e: any) {
      setError(typeof e?.response?.data === "string" ? e.response.data : "Couldn't create the channel");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={isModalOpen} onOpenChange={onClose}>
      <DialogContent className="bg-elevated text-foreground border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">Create channel</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid grid-cols-2 gap-2">
            {TYPES.map((t) => {
              const on = kind === t.type && isProject === t.project;
              return (
              <button
                key={t.label}
                type="button"
                onClick={() => { setKind(t.type); setIsProject(t.project); }}
                aria-pressed={on}
                className={cn(
                  "rounded-xl border p-3 text-left transition",
                  on ? "border-brand bg-brand/[0.08]" : "border-border hover:border-foreground/30"
                )}
              >
                <t.icon className={cn("h-5 w-5 mb-2", on ? "text-brand" : "text-muted-foreground")} />
                <p className="text-sm font-medium">{t.label}</p>
                <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{t.hint}</p>
              </button>
              );
            })}
          </div>
          {isProject && (
            <p className="text-xs text-muted-foreground -mt-2">After creating it you&apos;ll connect GitHub and pick the repository. Everyone who joins connects their GitHub (and, if they like, their AI) on the way in.</p>
          )}
          <div>
            <label htmlFor="ch-name" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Name</label>
            <div className="mt-1.5 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{isPrivate ? <Lock className="h-4 w-4" /> : <Hash className="h-4 w-4" />}</span>
              <input
                id="ch-name"
                autoFocus
                value={name}
                maxLength={40}
                onChange={(e) => setName(e.target.value)}
                placeholder="new-channel"
                className="w-full h-10 rounded-lg bg-background border border-border pl-9 pr-3 text-sm outline-none focus:border-brand"
              />
            </div>
          </div>
          <label className="flex items-start gap-3 rounded-xl border border-border p-3 cursor-pointer hover:border-foreground/30">
            <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} className="mt-1 h-4 w-4 accent-[hsl(var(--brand))]" />
            <span>
              <span className="text-sm font-medium flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> Private channel</span>
              <span className="block text-xs text-muted-foreground mt-0.5">Only people you add can see it. You can add them in channel settings.</span>
            </span>
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg text-sm hover:bg-foreground/[0.06]">Cancel</button>
            <button type="submit" disabled={!slug || busy} className="h-9 px-4 rounded-lg text-sm font-medium bg-brand text-brand-foreground disabled:opacity-40">
              {busy ? "Creating…" : "Create channel"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
