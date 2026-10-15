import { create } from "zustand";

/** Text of AI answers while they stream in (messageId → text so far). */
type AiStreamStore = { text: Record<string, string>; set: (id: string, text: string) => void; clear: (id: string) => void };

export const useAiStream = create<AiStreamStore>((set) => ({
  text: {},
  set: (id, text) => set((s) => ({ text: { ...s.text, [id]: text } })),
  clear: (id) => set((s) => { const { [id]: _, ...rest } = s.text; return { text: rest }; }),
}));
