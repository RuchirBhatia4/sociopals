"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { useSocket } from "@/components/providers/socket-provider";
import { STRUCTURE_EVENT } from "@/lib/socket-keys";
import { usePresenceFeed } from "@/hooks/use-presence";

/** Keeps the sidebar live: presence, and a refresh when channels, categories or roles change. */
export const ServerLive = ({ serverId }: { serverId: string }) => {
  const { socket } = useSocket();
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout>>();
  usePresenceFeed(serverId);

  useEffect(() => {
    if (!socket) return;
    socket.emit("join:server", serverId);
    const onStructure = (e: { serverId: string }) => {
      if (e.serverId !== serverId) return;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 150);
    };
    socket.on(STRUCTURE_EVENT, onStructure);
    return () => { socket.off(STRUCTURE_EVENT, onStructure); };
  }, [socket, serverId, router]);

  return null;
};
