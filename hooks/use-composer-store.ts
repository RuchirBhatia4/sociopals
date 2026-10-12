import { create } from "zustand";

import type { MessagePayload } from "@/lib/message-include";

/**
 * Shared state between a message (hover toolbar) and the composer:
 * which message you are replying to, per chat.
 */
type ComposerStore = {
  replyTo: Record<string, MessagePayload | null>;
  setReplyTo: (chatId: string, message: MessagePayload | null) => void;
};

export const useComposerStore = create<ComposerStore>((set) => ({
  replyTo: {},
  setReplyTo: (chatId, message) =>
    set((s) => ({ replyTo: { ...s.replyTo, [chatId]: message } })),
}));
