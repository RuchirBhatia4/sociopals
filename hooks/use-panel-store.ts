import { create } from "zustand";

/** The right-hand panel next to a chat: a thread, pins & decisions, search, or catch-up. */
export type PanelKind = "thread" | "pins" | "search" | "catchup" | "tasks" | "task";

type PanelStore = {
  panel: PanelKind | null;
  threadId: string | null;
  taskId: string | null;
  searchQuery: string;
  /** catch-up starts from here (when you last read the chat, captured as it opened) */
  since: string | null;
  open: (panel: PanelKind, opts?: { threadId?: string; taskId?: string; searchQuery?: string; since?: string | null }) => void;
  toggle: (panel: PanelKind) => void;
  close: () => void;
};

export const usePanel = create<PanelStore>((set, get) => ({
  panel: null,
  threadId: null,
  taskId: null,
  searchQuery: "",
  since: null,
  open: (panel, opts = {}) =>
    set({
      panel,
      threadId: opts.threadId ?? (panel === "thread" ? get().threadId : null),
      taskId: opts.taskId ?? (panel === "task" ? get().taskId : null),
      searchQuery: opts.searchQuery ?? get().searchQuery,
      since: opts.since !== undefined ? opts.since : get().since,
    }),
  toggle: (panel) => set((s) => (s.panel === panel ? { panel: null } : { panel })),
  close: () => set({ panel: null }),
}));
