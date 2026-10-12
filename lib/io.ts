import type { Server as SocketIOServer } from "socket.io";

/*
  The Socket.io server lives on the Node HTTP server (pages/api/socket/io.ts).
  It is also kept here so code outside a request (the background ticker,
  App Router routes, webhooks) can broadcast. Same process, same instance.
*/
const g = globalThis as unknown as { __sociopalsIO?: SocketIOServer };

export const setIO = (io: SocketIOServer) => { g.__sociopalsIO = io; };
export const getIO = (): SocketIOServer | undefined => g.__sociopalsIO;
