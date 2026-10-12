"use client";

import axios from "axios";
import { Channel, Server } from "@prisma/client";
import { ChevronDown, FolderPlus, GripVertical, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ActionTooltip } from "@/components/action-tooltip";
import { useModal } from "@/hooks/use-modal-store";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

import { ServerChannel } from "./server-channel";

export type ChannelGroup = { id: string | null; name: string; channels: Channel[] };

type Drag = { kind: "channel"; id: string } | { kind: "category"; id: string } | null;

/** Channels in collapsible categories. People with Manage channels can drag to reorder. */
export const ChannelTree = ({
  groups: initial, server, canManage, memberId, unreads, muted,
}: {
  groups: ChannelGroup[];
  server: Server;
  canManage: boolean;
  memberId?: string;
  unreads: Record<string, { unread: number; mentions: number }>;
  muted: string[];
}) => {
  const { onOpen } = useModal();
  const [groups, setGroups] = useState(initial);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [drag, setDrag] = useState<Drag>(null);
  const [over, setOver] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => setGroups(initial), [initial]);
  useEffect(() => {
    try { setCollapsed(JSON.parse(localStorage.getItem(`collapsed:${server.id}`) || "{}")); } catch {}
  }, [server.id]);
  const toggle = (id: string) => {
    const next = { ...collapsed, [id]: !collapsed[id] };
    setCollapsed(next);
    try { localStorage.setItem(`collapsed:${server.id}`, JSON.stringify(next)); } catch {}
  };

  const structure = (body: object) => axios.post("/api/socket/structure", { serverId: server.id, ...body });

  const persist = async (next: ChannelGroup[]) => {
    setGroups(next);
    try {
      await structure({ type: "reorder", categories: next.map((g) => ({ id: g.id, channelIds: g.channels.map((c) => c.id) })) });
    } catch {
      toast({ title: "Couldn't save the new order", tone: "error" });
      setGroups(initial);
    }
  };

  /** Drop the dragged channel before `beforeId` (or at the end) of group `groupId`. */
  const dropChannel = (groupId: string | null, beforeId: string | null) => {
    if (drag?.kind !== "channel") return;
    const moving = groups.flatMap((g) => g.channels).find((c) => c.id === drag.id);
    if (!moving || moving.id === beforeId) return;
    const next = groups.map((g) => ({ ...g, channels: g.channels.filter((c) => c.id !== moving.id) }));
    const target = next.find((g) => g.id === groupId);
    if (!target) return;
    const at = beforeId ? target.channels.findIndex((c) => c.id === beforeId) : -1;
    target.channels.splice(at < 0 ? target.channels.length : at, 0, { ...moving, categoryId: groupId });
    persist(next);
  };

  const dropCategory = (beforeId: string | null) => {
    if (drag?.kind !== "category" || drag.id === beforeId) return;
    const moving = groups.find((g) => g.id === drag.id);
    if (!moving) return;
    const rest = groups.filter((g) => g.id !== drag.id);
    const at = beforeId ? rest.findIndex((g) => g.id === beforeId) : rest.length;
    rest.splice(at < 0 ? rest.length : at, 0, moving);
    // the uncategorized group always stays on top
    persist([...rest.filter((g) => g.id === null), ...rest.filter((g) => g.id !== null)]);
  };

  const endDrag = () => { setDrag(null); setOver(null); };

  const channelDrag = (c: Channel, groupId: string | null) =>
    canManage
      ? {
          draggable: true,
          onDragStart: (e: React.DragEvent) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", c.id); setDrag({ kind: "channel", id: c.id }); },
          onDragEnd: endDrag,
          onDragOver: (e: React.DragEvent) => { if (drag?.kind === "channel") { e.preventDefault(); setOver(`c:${c.id}`); } },
          onDrop: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dropChannel(groupId, c.id); endDrag(); },
          className: cn(over === `c:${c.id}` && drag?.id !== c.id && "shadow-[inset_0_2px_0_0_hsl(var(--brand))]", drag?.id === c.id && "opacity-40"),
        }
      : undefined;

  const createCategory = async (name: string) => {
    setAdding(false);
    if (!name.trim()) return;
    try { await structure({ type: "category:create", name }); } catch { toast({ title: "Couldn't create the category", tone: "error" }); }
  };
  const renameCategory = async (id: string, name: string) => {
    setRenaming(null);
    if (!name.trim()) return;
    setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, name } : g)));
    try { await structure({ type: "category:rename", categoryId: id, name }); } catch { toast({ title: "Couldn't rename", tone: "error" }); }
  };
  const deleteCategory = async (id: string) => {
    try {
      await structure({ type: "category:delete", categoryId: id });
      toast({ title: "Category removed. Its channels moved to the top." });
    } catch { toast({ title: "Couldn't delete the category", tone: "error" }); }
  };

  return (
    <div className="space-y-3">
      {groups.map((g) => {
        if (g.id === null && !g.channels.length && !canManage) return null;
        const isCollapsed = g.id ? collapsed[g.id] : false;
        const activeOrUnread = g.channels.filter((c) => (unreads[c.id]?.unread ?? 0) > 0 && !muted.includes(c.id));
        const shown = isCollapsed ? activeOrUnread : g.channels;
        return (
          <div
            key={g.id ?? "top"}
            onDragOver={(e) => {
              if (drag?.kind === "channel") { e.preventDefault(); setOver(`g:${g.id}`); }
              if (drag?.kind === "category" && g.id) { e.preventDefault(); setOver(`k:${g.id}`); }
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (drag?.kind === "channel") dropChannel(g.id, null);
              if (drag?.kind === "category" && g.id) dropCategory(g.id);
              endDrag();
            }}
            className={cn(
              "rounded-lg transition",
              over === `g:${g.id}` && drag?.kind === "channel" && "bg-brand/[0.06]",
              over === `k:${g.id}` && "shadow-[inset_0_2px_0_0_hsl(var(--brand))]"
            )}
          >
            {g.id && (
              <div
                className="group/cat flex items-center gap-0.5 px-1 h-7"
                draggable={canManage && renaming !== g.id}
                onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", g.id!); setDrag({ kind: "category", id: g.id! }); }}
                onDragEnd={endDrag}
              >
                {canManage && <GripVertical className="h-3 w-3 text-muted-foreground/40 -ml-1 opacity-0 group-hover/cat:opacity-100 cursor-grab" />}
                {renaming === g.id ? (
                  <input
                    autoFocus
                    defaultValue={g.name}
                    maxLength={40}
                    onBlur={(e) => renameCategory(g.id!, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      if (e.key === "Escape") setRenaming(null);
                    }}
                    className="flex-1 h-6 rounded bg-background border border-brand px-1.5 text-[11px] uppercase tracking-wider font-semibold outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => toggle(g.id!)}
                    aria-expanded={!isCollapsed}
                    className="flex-1 flex items-center gap-1 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground hover:text-foreground min-w-0"
                  >
                    <ChevronDown className={cn("h-3 w-3 transition-transform flex-shrink-0", isCollapsed && "-rotate-90")} />
                    <span className="truncate">{g.name}</span>
                  </button>
                )}
                {canManage && renaming !== g.id && (
                  <>
                    <ActionTooltip label="Create channel here">
                      <button type="button" aria-label={`Create channel in ${g.name}`} onClick={() => onOpen("createChannel", { categoryId: g.id })} className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground opacity-0 group-hover/cat:opacity-100 focus:opacity-100">
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </ActionTooltip>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button type="button" aria-label={`${g.name} options`} className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground opacity-0 group-hover/cat:opacity-100 focus:opacity-100 data-[state=open]:opacity-100">
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => setRenaming(g.id)}><Pencil className="h-4 w-4 mr-2" /> Rename</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => deleteCategory(g.id!)} className="text-destructive focus:text-destructive"><Trash2 className="h-4 w-4 mr-2" /> Delete category</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
              </div>
            )}
            <div className="space-y-px">
              {shown.map((c) => (
                <ServerChannel
                  key={c.id}
                  channel={c}
                  server={server}
                  canManage={canManage}
                  memberId={memberId}
                  initialUnread={unreads[c.id]?.unread ?? 0}
                  initialMentions={unreads[c.id]?.mentions ?? 0}
                  muted={muted.includes(c.id)}
                  dragProps={channelDrag(c, g.id)}
                />
              ))}
              {!g.channels.length && g.id && !isCollapsed && (
                <p className="px-2 h-7 flex items-center text-xs text-muted-foreground/70 italic">{canManage ? "Drag channels here" : "No channels"}</p>
              )}
            </div>
          </div>
        );
      })}
      {canManage && (
        adding ? (
          <input
            autoFocus
            placeholder="Category name"
            maxLength={40}
            onBlur={(e) => createCategory(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setAdding(false);
            }}
            className="w-full h-8 rounded-md bg-background border border-brand px-2 text-sm outline-none"
          />
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="w-full h-7 px-2 rounded-md flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]">
            <FolderPlus className="h-3.5 w-3.5" /> New category
          </button>
        )
      )}
    </div>
  );
};
