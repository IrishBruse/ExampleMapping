import { io } from "socket.io-client";
import type { ServerToClientEvents, ClientToServerEvents } from "./types";
import type { Socket } from "socket.io-client";

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
  autoConnect: true,
});

/** Close the socket as soon as the tab is closed or navigated away (not bfcache restore). */
function disconnectOnPageLeave(event: PageTransitionEvent) {
  if (event.persisted) return;
  socket.disconnect();
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", disconnectOnPageLeave);
}
