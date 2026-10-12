"use client";

import axios from "axios";
import { Check, Search, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UserAvatar } from "@/components/user-avatar";
import { useModal } from "@/hooks/use-modal-store";
import { cn } from "@/lib/utils";

type Person = { id: string; name: string; imageUrl: string };

/** Start a private group conversation with 2 to 9 other people. */
export const CreateGroupDmModal = () => {
  const { isOpen, type, data, onClose } = useModal();
  const open = isOpen && type === "createGroupDm";
  const serverId = data.serverId ?? data.server?.id ?? "";
  const router = useRouter();
  const [picked, setPicked] = useState<Person[]>([]);
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (open) { setPicked([]); setQ(""); setName(""); setError(null); } }, [open]);

  const { data: list } = useQuery<{ me: string; members: Person[] }>({
    queryKey: ["members", serverId],
    queryFn: () => fetch(`/api/members?serverId=${serverId}`).then((r) => r.json()),
    enabled: open && !!serverId,
  });
  const people = (list?.members ?? []).filter((m) => m.id !== list?.me && m.name.toLowerCase().includes(q.toLowerCase()));
  const toggle = (p: Person) =>
    setPicked((cur) => (cur.some((x) => x.id === p.id) ? cur.filter((x) => x.id !== p.id) : cur.length >= 9 ? cur : [...cur, p]));

  const create = async () => {
    try {
      setBusy(true);
      setError(null);
      const { data: channel } = await axios.post("/api/socket/structure", { serverId, type: "groupDm:create", memberIds: picked.map((p) => p.id), name: name.trim() || undefined });
      onClose();
      router.push(`/servers/${serverId}/channels/${channel.id}`);
      router.refresh();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? "Couldn't create the group");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-elevated border-border max-w-md p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5">
          <DialogTitle className="flex items-center gap-2 text-lg"><Users className="h-5 w-5 text-brand" /> New group message</DialogTitle>
          <p className="text-sm text-muted-foreground">Pick 2 to 9 people. Only the group can see it.</p>
        </DialogHeader>
        <div className="px-5">
          <div className="min-h-[42px] rounded-lg border border-border bg-background flex flex-wrap items-center gap-1.5 p-1.5 focus-within:border-brand">
            {picked.map((p) => (
              <span key={p.id} className="h-7 pl-1 pr-1.5 rounded-full bg-brand/[0.15] text-sm flex items-center gap-1.5">
                <UserAvatar src={p.imageUrl} className="h-5 w-5 md:h-5 md:w-5" />
                {p.name.split(" ")[0]}
                <button type="button" aria-label={`Remove ${p.name}`} onClick={() => toggle(p)} className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
              </span>
            ))}
            <div className="flex items-center gap-1.5 flex-1 min-w-[120px] px-1">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find people" className="flex-1 bg-transparent outline-none text-sm h-7" />
            </div>
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto scrollbar-thin px-3 py-2">
          {people.map((p) => {
            const on = picked.some((x) => x.id === p.id);
            return (
              <button key={p.id} type="button" onClick={() => toggle(p)} className={cn("w-full flex items-center gap-3 h-11 px-2 rounded-lg text-left hover:bg-foreground/[0.05]", on && "bg-foreground/[0.04]")}>
                <UserAvatar src={p.imageUrl} className="h-8 w-8 md:h-8 md:w-8" />
                <span className="text-sm flex-1 truncate">{p.name}</span>
                <span className={cn("h-5 w-5 rounded-md border flex items-center justify-center", on ? "bg-brand border-brand text-brand-foreground" : "border-muted-foreground/40")}>
                  {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                </span>
              </button>
            );
          })}
          {list && people.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">{list.members.length <= 1 ? "Invite some people to this server first." : "Nobody matches that."}</p>}
        </div>
        <div className="px-5 pb-5 space-y-3">
          {picked.length >= 2 && (
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder={`Group name (optional): ${picked.map((p) => p.name.split(" ")[0]).join(", ")}`} className="w-full h-10 rounded-lg bg-background border border-border px-3 text-sm outline-none focus:border-brand" />
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button type="button" onClick={create} disabled={picked.length < 2 || busy} className="w-full h-10 rounded-lg text-sm font-medium bg-brand text-brand-foreground disabled:opacity-40">
            {busy ? "Creating…" : picked.length < 2 ? `Pick ${2 - picked.length} more` : `Start group with ${picked.length + 1} people`}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
