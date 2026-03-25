import { io } from "socket.io-client";
import type { ServerToClientEvents, ClientToServerEvents } from "./types";
import type { Socket } from "socket.io-client";

function getToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)mapping_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : "";
}

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
  autoConnect: true,
  auth: { token: getToken() },
});
