"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useSocket } from "@/components/providers/socket-provider";
import { NOTIFY_EVENT } from "@/lib/socket-keys";
import { toast } from "@/hooks/use-toast";

type NotifyPayload = {
  notification: { id: string; type: string; chatId: string; preview: string; actorName: string | null; chatName: string | null } | null;
  push: boolean;
  title: string;
  body: string;
  url: string;
};

/** Inbox count shared by the rail badge and the tab title. */
export const useInboxCount = () =>
  useQuery<number>({
    queryKey: ["inbox-count"],
    queryFn: () => fetch("/api/inbox?count=1").then((r) => (r.ok ? r.json() : { unread: 0 })).then((d) => d.unread ?? 0),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

/**
 * Listens for notifications for the signed-in person:
 * desktop pop-ups while the tab is in the background (unless focus mode / quiet hours),
 * a small toast while you're elsewhere in the app, and "(3) Sociopals" in the tab title.
 */
export const NotificationProvider = () => {
  const { socket } = useSocket();
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const path = useRef(pathname);
  path.current = pathname;
  const { data: count = 0 } = useInboxCount();

  // Next resets the title on navigation, so set it again after every route change.
  useEffect(() => {
    const apply = () => {
      const base = document.title.replace(/^\(\d+\+?\) /, "") || "Sociopals";
      const next = count > 0 ? `(${count > 99 ? "99+" : count}) ${base}` : base;
      if (document.title !== next) document.title = next;
    };
    apply();
    const t = setTimeout(apply, 300);
    return () => clearTimeout(t);
  }, [count, pathname]);

  useEffect(() => {
    if (!socket) return;
    const onNotify = (n: NotifyPayload) => {
      if (n.notification) {
        qc.setQueryData<number>(["inbox-count"], (c) => (c ?? 0) + 1);
        qc.invalidateQueries(["inbox"]);
      }
      const target = n.url.split("?")[0];
      const lookingAtIt = document.visibilityState === "visible" && path.current === target;
      if (lookingAtIt) return;

      if (document.visibilityState !== "visible") {
        if (n.push && typeof Notification !== "undefined" && Notification.permission === "granted") {
          const note = new Notification(n.title, { body: n.body, icon: "/favicon.ico", tag: n.notification?.id ?? n.url });
          note.onclick = () => { window.focus(); router.push(n.url); note.close(); };
        }
      } else if (n.notification || n.push) {
        toast({ title: n.title, body: n.body, action: { label: "Open", onClick: () => router.push(n.url) } });
      }
    };
    socket.on(NOTIFY_EVENT, onNotify);
    return () => { socket.off(NOTIFY_EVENT, onNotify); };
  }, [socket, qc, router]);

  return null;
};
