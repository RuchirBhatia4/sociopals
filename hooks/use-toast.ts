import { create } from "zustand";

export type Toast = { id: number; title: string; body?: string; tone?: "default" | "error"; action?: { label: string; onClick: () => void } };

type ToastStore = {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">) => void;
  dismiss: (id: number) => void;
};

let next = 1;
export const useToast = create<ToastStore>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = next++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
    setTimeout(() => get().dismiss(id), t.action ? 7000 : 4000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Fire a toast from anywhere (outside React too). */
export const toast = (t: Omit<Toast, "id">) => useToast.getState().push(t);
