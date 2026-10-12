"use client";

import axios from "axios";
import { Bell, BellDot, BellOff, Check, ClipboardList, Github, LogOut, Pin, Search, Settings, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { ActionTooltip } from "@/components/action-tooltip";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { usePanel, type PanelKind } from "@/hooks/use-panel-store";
import { useModal } from "@/hooks/use-modal-store";
import { toast } from "@/hooks/use-toast";

type Pref = { level: "ALL" | "MENTIONS" | "NONE"; muted: boolean };

const LEVELS: { level: Pref["level"]; label: string; hint: string }[] = [
  { level: "ALL", label: "All messages", hint: "Every new message pings you" },
  { level: "MENTIONS", label: "Mentions & replies", hint: "Only when it's about you (default)" },
  { level: "NONE", label: "Nothing", hint: "Never notify, still counts unread" },
];

export const ChatHeaderActions = ({
  chatId, serverId, isChannel, isGroupDm, canManage, channelName, repoUrl,
}: { chatId: string; serverId: string; isChannel: boolean; isGroupDm: boolean; canManage: boolean; channelName: string; isProject?: boolean; repoUrl?: string | null }) => {
  const { panel, toggle, open } = usePanel();
  const { onOpen } = useModal();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: pref } = useQuery<Pref>({
    queryKey: ["chat-pref", chatId],
    queryFn: () => fetch(`/api/chat-prefs?chatId=${chatId}`).then((r) => r.json()),
  });

  const setPref = async (patch: Partial<Pref>) => {
    const next = { ...(pref ?? { level: "MENTIONS", muted: false }), ...patch } as Pref;
    qc.setQueryData(["chat-pref", chatId], next);
    try {
      await axios.put("/api/chat-prefs", { chatId, ...patch });
    } catch {
      toast({ title: "Couldn't change notifications", tone: "error" });
      qc.invalidateQueries(["chat-pref", chatId]);
    }
  };

  const leaveGroup = async () => {
    try {
      await axios.post("/api/socket/structure", { serverId, type: "groupDm:leave", channelId: chatId });
      router.push(`/servers/${serverId}`);
      router.refresh();
    } catch {
      toast({ title: "Couldn't leave the group", tone: "error" });
    }
  };

  const BellIcon = pref?.muted || pref?.level === "NONE" ? BellOff : pref?.level === "ALL" ? BellDot : Bell;

  const Btn = ({ kind, label, children }: { kind: PanelKind; label: string; children: React.ReactNode }) => (
    <ActionTooltip side="bottom" label={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={panel === kind}
        onClick={() => toggle(kind)}
        className={cn(
          "h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] transition",
          panel === kind && "bg-foreground/[0.09] text-foreground"
        )}
      >
        {children}
      </button>
    </ActionTooltip>
  );

  return (
    <>
      {repoUrl && (
        <ActionTooltip side="bottom" label="Open the repo on GitHub">
          <a href={repoUrl} target="_blank" rel="noopener noreferrer" aria-label="Open the repo on GitHub" className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06]">
            <Github className="h-[18px] w-[18px]" />
          </a>
        </ActionTooltip>
      )}
      {repoUrl !== undefined && <Btn kind="tasks" label="Tasks"><ClipboardList className="h-[18px] w-[18px]" /></Btn>}
      {isChannel && <Btn kind="catchup" label="Catch up"><Sparkles className="h-[18px] w-[18px]" /></Btn>}
      <Btn kind="pins" label={isChannel ? "Pins & decisions" : "Pinned messages"}><Pin className="h-[18px] w-[18px]" /></Btn>
      <Btn kind="search" label="Search"><Search className="h-[18px] w-[18px]" /></Btn>
      <DropdownMenu>
        <ActionTooltip side="bottom" label="Notifications">
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Notification settings" className={cn("h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06]", pref?.muted && "text-muted-foreground/60")}>
              <BellIcon className="h-[18px] w-[18px]" />
            </button>
          </DropdownMenuTrigger>
        </ActionTooltip>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>Notify me about</DropdownMenuLabel>
          {LEVELS.map((l) => (
            <DropdownMenuItem key={l.level} onClick={() => setPref({ level: l.level })} className="items-start py-2">
              <span className="w-5 mt-0.5">{pref?.level === l.level && <Check className="h-4 w-4 text-brand" />}</span>
              <span>
                <span className="block text-sm">{l.label}</span>
                <span className="block text-xs text-muted-foreground">{l.hint}</span>
              </span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setPref({ muted: !pref?.muted })} className="py-2">
            <span className="w-5">{pref?.muted && <Check className="h-4 w-4 text-brand" />}</span>
            <span>
              <span className="block text-sm">Mute this {isChannel ? "channel" : "conversation"}</span>
              <span className="block text-xs text-muted-foreground">Hides its unread dot too</span>
            </span>
          </DropdownMenuItem>
          {isGroupDm && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={leaveGroup} className="text-destructive focus:text-destructive">
                <LogOut className="h-4 w-4 mr-2" /> Leave group
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {isChannel && canManage && !isGroupDm && (
        <ActionTooltip side="bottom" label="Channel settings">
          <button
            type="button"
            aria-label="Channel settings"
            onClick={() => onOpen("channelSettings", { channelId: chatId, serverId, channelName })}
            className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06]"
          >
            <Settings className="h-[18px] w-[18px]" />
          </button>
        </ActionTooltip>
      )}
    </>
  );
};
