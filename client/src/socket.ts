import { io } from "socket.io-client";
import type { ServerToClientEvents, ClientToServerEvents } from "./types";
import type { Socket } from "socket.io-client";

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
  autoConnect: true,
});
