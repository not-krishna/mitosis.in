import http from 'node:http';
import { WebSocketServer } from 'ws';

const port = Number(process.env.PORT || 8787);
const sessions = new Map();

function getSession(sessionId) {
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

function send(socket, payload) {
  if (socket && socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function peer(session, role) {
  return role === 'app' ? session.plugin : session.app;
}

const server = http.createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true, sessions: sessions.size }));
    return;
  }

  response.writeHead(200, { 'content-type': 'text/plain' });
  response.end('Mitosis.in bridge is running.');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (socket) => {
  let role = 'unknown';
  let sessionId = '';

  socket.on('message', (raw) => {
    let packet = null;
    try {
      packet = JSON.parse(String(raw));
    } catch (_error) {
      send(socket, { kind: 'error', message: 'Invalid JSON packet.' });
      return;
    }

    sessionId = packet.sessionId || sessionId;
    if (!sessionId) {
      send(socket, { kind: 'error', message: 'Missing sessionId.' });
      return;
    }

    const session = getSession(sessionId);
    session.updatedAt = Date.now();

    if (packet.kind === 'register') {
      role = packet.role === 'plugin' ? 'plugin' : 'app';
      session[role] = socket;
      send(socket, { kind: 'registered', sessionId, role, state: session.state, events: session.events.slice(-20) });
      send(peer(session, role), { kind: 'peer-status', role, connected: true });
      return;
    }

    if (packet.kind === 'state-update') {
      session.state = { ...session.state, ...(packet.state || {}) };
      send(peer(session, role), { kind: 'state-update', state: session.state });
      return;
    }

    if (packet.kind === 'plugin-event') {
      session.events.push(packet.event);
      session.events = session.events.slice(-100);
      send(peer(session, role), { kind: 'plugin-event', event: packet.event });
      return;
    }

    if (packet.kind === 'app-command') {
      send(peer(session, role), { kind: 'app-command', command: packet.command });
      return;
    }

    if (packet.kind === 'ping') {
      send(socket, { kind: 'pong', role });
    }
  });

  socket.on('close', () => {
    if (!sessionId) return;
    const session = sessions.get(sessionId);
    if (!session) return;
    if (session.app === socket) session.app = null;
    if (session.plugin === socket) session.plugin = null;
    send(peer(session, role), { kind: 'peer-status', role, connected: false });
  });
});

server.listen(port, () => {
  console.log(`Mitosis.in bridge listening on ${port}`);
});
