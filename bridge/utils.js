export function getSession(sessionId, sessions) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      app: null,
      plugin: null,
      state: {},
      events: [],
      updatedAt: Date.now(),
    });
  }
  return sessions.get(sessionId);
}

export function send(socket, payload) {
  if (socket && socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

export function peer(session, role) {
  return role === "app" ? session.plugin : session.app;
}
