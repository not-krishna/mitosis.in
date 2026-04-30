import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

function randomSession() {
  return `mitosis-${Math.random().toString(36).slice(2, 8)}`;
}

function readStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (_error) {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (_error) {
    // Storage can be blocked in embedded contexts.
  }
}

export function useBridge() {
  const params = new URLSearchParams(window.location.search);
  const initialSession = params.get('session') || readStorage('mitosis.sessionId') || randomSession();
  const initialBridge = params.get('bridge') || readStorage('mitosis.bridgeUrl') || 'ws://localhost:8787';
  const [sessionId, setSessionId] = useState(initialSession);
  const [bridgeUrl, setBridgeUrl] = useState(initialBridge);
  const [status, setStatus] = useState('disconnected');
  const [events, setEvents] = useState([]);
  const [templates, setTemplates] = useState([]);
  const socketRef = useRef(null);

  const connect = useCallback(() => {
    if (socketRef.current && socketRef.current.readyState < WebSocket.CLOSING) {
      socketRef.current.close();
    }
    writeStorage('mitosis.sessionId', sessionId);
    writeStorage('mitosis.bridgeUrl', bridgeUrl);
    let socket = null;
    try {
      socket = new WebSocket(bridgeUrl);
    } catch (_error) {
      setStatus('disconnected');
      return;
    }
    socketRef.current = socket;
    setStatus('connecting');
    socket.onopen = () => {
      setStatus('connected');
      socket.send(JSON.stringify({ kind: 'register', role: 'app', sessionId }));
    };
    socket.onclose = () => {
      if (socketRef.current === socket) setStatus('disconnected');
    };
    socket.onerror = () => setStatus('disconnected');
    socket.onmessage = (message) => {
      let packet = null;
      try {
        packet = JSON.parse(message.data);
      } catch (_error) {
        return;
      }
      if (packet.kind === 'plugin-event') {
        setEvents((items) => [packet.event, ...items].slice(0, 100));
        if (packet.event?.type === 'template-metadata') setTemplates(packet.event.templates || []);
        if (packet.event?.type === 'executor-ready') setTemplates(packet.event.templates || []);
      }
      if (packet.kind === 'registered' && packet.events) {
        const pluginEvents = packet.events.filter(Boolean).reverse();
        setEvents(pluginEvents);
        const metadata = pluginEvents.find((event) => event.type === 'template-metadata' || event.type === 'executor-ready');
        if (metadata) setTemplates(metadata.templates || []);
      }
    };
  }, [bridgeUrl, sessionId]);

  useEffect(() => {
    connect();
    return () => {
      if (socketRef.current && socketRef.current.readyState < WebSocket.CLOSING) {
        socketRef.current.close();
      }
    };
  }, []);

  const sendCommand = useCallback((command) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify({ kind: 'app-command', sessionId, command }));
    return true;
  }, [sessionId]);

  const disconnect = useCallback(() => {
    if (socketRef.current && socketRef.current.readyState < WebSocket.CLOSING) {
      socketRef.current.close();
    }
    socketRef.current = null;
    setStatus('disconnected');
  }, []);

  const value = useMemo(() => ({
    sessionId,
    setSessionId,
    bridgeUrl,
    setBridgeUrl,
    status,
    events,
    templates,
    connect,
    disconnect,
    sendCommand,
  }), [bridgeUrl, connect, disconnect, events, sendCommand, sessionId, status, templates]);

  return value;
}
