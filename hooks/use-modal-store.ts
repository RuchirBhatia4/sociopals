import { Channel, ChannelType, Server } from "@prisma/client";
import { create } from "zustand";

export type ModalType =
  | "createServer" | "invite" | "editServer" | "members" | "createChannel" | "leaveServer" | "deleteServer"
  | "deleteChannel" | "editChannel" | "messageFile" | "deleteMessage"
  | "channelSettings" | "serverSettings" | "createGroupDm" | "settings";

interface ModalData {
  server?: Server;
  channel?: Channel;
  channelType?: ChannelType;
  apiUrl?: string;
  query?: Record<string, any>;
  channelId?: string;
  serverId?: string;
  channelName?: string;
  categoryId?: string | null;
  /** which tab a settings modal opens on */
  tab?: string;
}

interface ModalStore {
  type: ModalType | null;
  data: ModalData;
  isOpen: boolean;
  onOpen: (type: ModalType, data?: ModalData) => void;
  onClose: () => void;
}

export const useModal = create<ModalStore>((set) => ({
  type: null,
  data: {},
  isOpen: false,
  onOpen: (type, data = {}) => set({ isOpen: true, type, data }),
  onClose: () => set({ type: null, isOpen: false })
}));

// Handy for debugging in development: window.__modal.getState().onOpen("settings")
if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") (window as any).__modal = useModal;
