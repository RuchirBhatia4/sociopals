import { Server as NetServer } from "http";
import { NextApiRequest } from "next";
import { Server as ServerIO } from "socket.io";

import { NextApiResponseServerIo } from "@/types";
import { db } from "@/lib/db";
import { setIO } from "@/lib/io";
import { chatAccess } from "@/lib/access";
import { profileFromHandshake } from "@/lib/socket-auth";
import { startTicker } from "@/lib/ticker";
import { onlineCounts as online } from "@/lib/presence";
import {
  chatRoom,
  PRESENCE_EVENT,
  profileRoom,
  serverRoom,
  typingKey,
  type Presence,
  type Typing,
} from "@/lib/socket-keys";

export const config = {
  api: {
    bodyParser: false,
  },
};

const ioHandler = (req: NextApiRequest, res: NextApiResponseServerIo) => {
  if (!res.socket.server.io) {
    const path = "/api/socket/io";
    const httpServer: NetServer = res.socket.server as any;
    const io = new ServerIO(httpServer, {
      path: path,
      // @ts-ignore
      addTrailingSlash: false,
    });

    // Only signed-in people get a live connection.
    io.use(async (socket, next) => {
      const profile = await profileFromHandshake(socket.handshake.headers.cookie);
      if (!profile) return next(new Error("unauthorized"));
      socket.data.profileId = profile.id;
      socket.data.name = profile.name;
      next();
    });

    io.on("connection", async (socket) => {
      const profileId: string = socket.data.profileId;
      socket.join(profileRoom(profileId));

      // Server rooms: sidebar activity and presence for every server you are in.
      const memberships = await db.member.findMany({ where: { profileId }, select: { serverId: true } });
      const serverIds = memberships.map((m) => m.serverId);
      serverIds.forEach((id) => socket.join(serverRoom(id)));

      const profile = await db.profile.findUnique({ where: { id: profileId } });
      const announce = (isOn: boolean) => {
        const p: Presence = { profileId, online: isOn, statusText: profile?.statusText, statusEmoji: profile?.statusEmoji };
        serverIds.forEach((id) => socket.to(serverRoom(id)).emit(PRESENCE_EVENT, p));
      };
      online.set(profileId, (online.get(profileId) ?? 0) + 1);
      if (online.get(profileId) === 1) announce(true);

      // A server you just joined or created.
      socket.on("join:server", async (serverId: string) => {
        if (typeof serverId !== "string") return;
        const m = await db.member.findFirst({ where: { serverId, profileId }, select: { id: true } });
        if (m) socket.join(serverRoom(serverId));
      });

      // Open a chat: only if you are allowed to see it.
      socket.on("join:chat", async (chatId: string) => {
        if (typeof chatId !== "string") return;
        if (await chatAccess(profileId, chatId)) socket.join(chatRoom(chatId));
      });
      socket.on("leave:chat", (chatId: string) => {
        if (typeof chatId === "string") socket.leave(chatRoom(chatId));
      });

      // "X is typing…": identity comes from the session, not the client.
      socket.on("typing", (t: Partial<Typing>) => {
        if (!t || typeof t.chatId !== "string" || typeof t.memberId !== "string") return;
        if (!socket.rooms.has(chatRoom(t.chatId))) return;
        socket.to(chatRoom(t.chatId)).emit(typingKey(t.chatId), {
          chatId: t.chatId,
          memberId: t.memberId,
          name: String(socket.data.name || "Someone").slice(0, 60),
          typing: !!t.typing,
        } satisfies Typing);
      });

      socket.on("disconnect", async () => {
        const left = (online.get(profileId) ?? 1) - 1;
        if (left <= 0) {
          online.delete(profileId);
          announce(false);
          await db.profile.update({ where: { id: profileId }, data: { lastSeenAt: new Date() } }).catch(() => {});
        } else {
          online.set(profileId, left);
        }
      });
    });

    res.socket.server.io = io;
    setIO(io);
    startTicker();
  }

  res.end();
}

export default ioHandler;
