import { send, peer, getSession } from "./utils.js";

export function handleMessage(packet, socket, sessionId, sessions) {
  const session = getSession(sessionId, sessions);
  session.updatedAt = Date.now();

  if (packet.kind === "register") {
    const role = packet.role === "plugin" ? "plugin" : "app";
    session[role] = socket;
    send(socket, {
      kind: "registered",
      sessionId,
      role,
      state: session.state,
      events: session.events.slice(-20),
    });
    send(peer(session, role), { kind: "peer-status", role, connected: true });
    // Notify app when plugin connects or is already connected
    if (role === "plugin" && session.app) {
      send(session.app, { kind: "plugin-connected" });
    }
    // Notify app if plugin is already connected when app registers
    if (role === "app" && session.plugin) {
      send(session.app, { kind: "plugin-connected" });
    }
    return role;
  }

  if (packet.kind === "state-update") {
    session.state = { ...session.state, ...(packet.state || {}) };
    send(peer(session, "app"), { kind: "state-update", state: session.state });
    return;
  }

  if (packet.kind === "plugin-event") {
    session.events.push(packet.event);
    session.events = session.events.slice(-100);
    send(peer(session, "plugin"), {
      kind: "plugin-event",
      event: packet.event,
    });
    return;
  }

  if (packet.kind === "app-command") {
    send(peer(session, "app"), {
      kind: "app-command",
      command: packet.command,
    });
    return;
  }

  if (packet.kind === "ping") {
    send(socket, { kind: "pong" });
  }
}

export function handleClose(sessionId, socket, sessions, role) {
  const session = sessions.get(sessionId);
  if (!session) return;
  const wasPlugin = session.plugin === socket;
  if (session.app === socket) session.app = null;
  if (session.plugin === socket) session.plugin = null;

  // If plugin closes, notify app that plugin is disconnected and close app connection
  if (wasPlugin) {
    send(session.app, { kind: "plugin-closed" });
    if (session.app) {
      session.app.close();
      session.app = null;
    }
  }
  send(peer(session, role), { kind: "peer-status", role, connected: false });
}
