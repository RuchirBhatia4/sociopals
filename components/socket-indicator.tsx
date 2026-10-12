"use client";

import { useSocket } from "@/components/providers/socket-provider";
import { cn } from "@/lib/utils";

/** Quiet when all is well; only draws attention when live updates drop. */
export const SocketIndicator = () => {
  const { isConnected } = useSocket();

  return (
    <span
      role="status"
      title={isConnected ? "Connected: messages arrive instantly" : "Reconnecting: checking for new messages every second"}
      className={cn(
        "flex items-center gap-1.5 text-xs rounded-full px-2 h-6",
        isConnected ? "text-muted-foreground" : "text-amber-500 bg-amber-500/10"
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", isConnected ? "bg-emerald-500" : "bg-amber-500 animate-pulse")} />
      <span className={cn(isConnected && "hidden lg:inline")}>{isConnected ? "Live" : "Reconnecting…"}</span>
    </span>
  )
}
