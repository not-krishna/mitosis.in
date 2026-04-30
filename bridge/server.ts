// @ts-nocheck
import http from "node:http";
import { WebSocketServer } from "ws";
import { getSession, send } from "./utils";
import { handleMessage, handleClose } from "./handlers";

const port = Number(process.env.PORT || 8787);
const sessions = new Map();

const server = http.createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, sessions: sessions.size }));
    return;
  }

  response.writeHead(200, { "content-type": "text/plain" });
  response.end("Mitosis.in bridge is running.");
});

const wss = new WebSocketServer({ server });

wss.on("connection", (socket) => {
  let role = "unknown";
  let sessionId = "";

  socket.on("message", (raw) => {
    let packet = null;
    try {
      packet = JSON.parse(String(raw));
    } catch (_error) {
      send(socket, { kind: "error", message: "Invalid JSON packet." });
      return;
    }

    sessionId = packet.sessionId || sessionId;
    if (!sessionId) {
      send(socket, { kind: "error", message: "Missing sessionId." });
      return;
    }

    const newRole = handleMessage(packet, socket, sessionId, sessions);
    if (newRole) role = newRole;
  });

  socket.on("close", () => {
    handleClose(sessionId, socket, sessions, role);
  });
});

server.listen(port, () => {
  console.log(`Mitosis.in bridge listening on ${port}`);
});
