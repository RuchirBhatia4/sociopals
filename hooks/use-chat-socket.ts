import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useSocket } from "@/components/providers/socket-provider";
import type { MessagePayload } from "@/lib/message-include";

type ChatSocketProps = {
  /** the chat room to join (channel or conversation id) */
  chatId: string;
  addKey: string;
  updateKey: string;
  queryKey: string;
}

/** Join the chat's private room (and rejoin after reconnects); merge live changes into the cache. */
export const useChatSocket = ({
  chatId,
  addKey,
  updateKey,
  queryKey
}: ChatSocketProps) => {
  const { socket } = useSocket();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!socket) {
      return;
    }

    const join = () => socket.emit("join:chat", chatId);
    join();
    socket.on("connect", join);

    const onUpdate = (message: MessagePayload) => {
      queryClient.setQueryData([queryKey], (oldData: any) => {
        if (!oldData || !oldData.pages || oldData.pages.length === 0) {
          return oldData;
        }
        return {
          ...oldData,
          pages: oldData.pages.map((page: any) => ({
            ...page,
            items: page.items.map((item: MessagePayload) => (item.id === message.id ? message : item)),
          })),
        };
      });
    };

    const onAdd = (message: MessagePayload) => {
      queryClient.setQueryData([queryKey], (oldData: any) => {
        if (!oldData || !oldData.pages || oldData.pages.length === 0) {
          return { pages: [{ items: [message] }], pageParams: [undefined] };
        }
        // ignore duplicates (e.g. our own send echoed back after a reconnect)
        if (oldData.pages.some((p: any) => p.items.some((m: MessagePayload) => m.id === message.id))) return oldData;
        const pages = [...oldData.pages];
        pages[0] = { ...pages[0], items: [message, ...pages[0].items] };
        return { ...oldData, pages };
      });
    };

    socket.on(updateKey, onUpdate);
    socket.on(addKey, onAdd);

    return () => {
      socket.off("connect", join);
      socket.off(addKey, onAdd);
      socket.off(updateKey, onUpdate);
      socket.emit("leave:chat", chatId);
    }
  }, [queryClient, chatId, addKey, queryKey, socket, updateKey]);
}
