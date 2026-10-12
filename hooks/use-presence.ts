"use client";

import { useEffect } from "react";
import { create } from "zustand";

import { useSocket } from "@/components/providers/socket-provider";
import { PRESENCE_EVENT, type Presence } from "@/lib/socket-keys";

type Entry = { online: boolean; statusText: string | null; statusEmoji: string | null };
type PresenceStore = { byProfile: Record<string, Entry>; set: (p: Presence | (Presence & Entry)) => void; load: (list: (Presence & Entry)[]) => void };

export const usePresenceStore = create<PresenceStore>((set) => ({
  byProfile: {},
  set: (p) =>
    set((s) => ({
      byProfile: {
        ...s.byProfile,
        [p.profileId]: {
          online: p.online,
          statusText: p.statusText !== undefined ? p.statusText ?? null : s.byProfile[p.profileId]?.statusText ?? null,
          statusEmoji: p.statusEmoji !== undefined ? p.statusEmoji ?? null : s.byProfile[p.profileId]?.statusEmoji ?? null,
        },
      },
    })),
  load: (list) =>
    set((s) => ({ byProfile: { ...s.byProfile, ...Object.fromEntries(list.map((p) => [p.profileId, { online: p.online, statusText: p.statusText ?? null, statusEmoji: p.statusEmoji ?? null }])) } })),
}));

/** Load who's online in a server and keep it live. Mount once per server view. */
export function usePresenceFeed(serverId: string) {
  const { socket, isConnected } = useSocket();
  const { set, load } = usePresenceStore();
  useEffect(() => {
    if (!isConnected) return;
    fetch(`/api/socket/presence?serverId=${serverId}`).then((r) => (r.ok ? r.json() : [])).then(load).catch(() => {});
  }, [serverId, isConnected, load]);
  useEffect(() => {
    if (!socket) return;
    socket.on(PRESENCE_EVENT, set);
    return () => { socket.off(PRESENCE_EVENT, set); };
  }, [socket, set]);
}

export const usePresence = (profileId: string) => usePresenceStore((s) => s.byProfile[profileId]);
