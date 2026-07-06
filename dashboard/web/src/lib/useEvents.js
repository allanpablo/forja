import { useEffect, useState } from 'react';

/**
 * Hook singleton-ish para EventSource no /api/events.
 * Mantém 1 conexão por instância montada (Layout monta uma só).
 *
 * Uso:
 *   const { connected, subscribe } = useEvents();
 *   useEffect(() => subscribe(['handoff.transitioned'], (e) => refetch()), []);
 */
let activeSource = null;
const listeners = new Set();

function ensureSource() {
  if (activeSource) return activeSource;
  const es = new EventSource('/api/events');
  activeSource = es;
  es.onerror = () => {
    for (const cb of listeners) cb({ kind: 'connection', connected: false });
  };
  es.onopen = () => {
    for (const cb of listeners) cb({ kind: 'connection', connected: true });
  };
  // Captura todos os eventos nomeados via onmessage? Não — SSE com event names só dispara pelo addEventListener.
  // Estratégia: ouvinte genérico que adiciona handlers dinamicamente quando novo type aparecer.
  const known = new Set(['hello']);
  function bindType(type) {
    if (known.has(type)) return;
    known.add(type);
    es.addEventListener(type, (e) => {
      let payload = {};
      try { payload = JSON.parse(e.data); } catch {}
      for (const cb of listeners) cb({ kind: 'event', type, payload });
    });
  }
  // Sabemos os tipos esperados ahead-of-time.
  const knownTypes = [
    'hello', 'command.started', 'command.stdout', 'command.stderr', 'command.exit',
    'handoff.transitioned', 'spec.created', 'spec.status_changed', 'llm.routing_updated',
    'memory.synced', 'workflow.updated', 'stack.updated',
  ];
  for (const t of knownTypes) bindType(t);
  return es;
}

export function useEvents() {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    ensureSource();
    const cb = (msg) => {
      if (msg.kind === 'connection') setConnected(msg.connected);
    };
    listeners.add(cb);
    return () => { listeners.delete(cb); };
  }, []);

  return { connected, subscribe };
}

/**
 * subscribe(types, onEvent) → unsubscribe
 * Chama onEvent({ type, payload }) só para os tipos solicitados.
 */
export function subscribe(types, onEvent) {
  ensureSource();
  const cb = (msg) => {
    if (msg.kind !== 'event') return;
    if (!types.includes(msg.type)) return;
    onEvent({ type: msg.type, payload: msg.payload });
  };
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * onActivity(cb) → unsubscribe. Recebe TODOS os eventos (para ActivityLog).
 */
export function onActivity(cb) {
  ensureSource();
  listeners.add(cb);
  return () => listeners.delete(cb);
}
