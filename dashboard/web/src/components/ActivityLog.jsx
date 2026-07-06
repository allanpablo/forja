import { useEffect, useRef, useState } from 'react';
import { onActivity } from '../lib/useEvents.js';

const MAX_ENTRIES = 200;

export default function ActivityLog() {
  const [entries, setEntries] = useState([]);
  const [open, setOpen] = useState(false);
  const [autoOpen, setAutoOpen] = useState(true);
  const bottomRef = useRef(null);
  const runningCmds = useRef(new Map()); // source → name

  useEffect(() => {
    return onActivity((msg) => {
      if (msg.kind !== 'event') return;
      const { type, payload } = msg;
      const entry = formatEntry(type, payload, runningCmds.current);
      if (!entry) return;
      setEntries((prev) => {
        const next = [...prev, entry];
        return next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next;
      });
      // Auto-abre quando começa um comando
      if (autoOpen && type === 'command.started') setOpen(true);
    });
  }, [autoOpen]);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [entries.length, open]);

  const lastRunning = entries.findLast?.((e) => e.kind === 'cmd_start');
  const inFlight = runningCmds.current.size;

  return (
    <div className={`fixed bottom-0 left-[220px] right-0 z-30 ${open ? 'h-72' : 'h-10'} bg-surface border-t border-border transition-all`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full h-10 px-4 flex items-center justify-between text-xs hover:bg-slate-800/50"
      >
        <span className="flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full ${inFlight > 0 ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500'}`} />
          <span className="font-semibold">Atividade</span>
          {inFlight > 0 && <span className="text-amber-400">{inFlight} comando(s) rodando</span>}
          {entries.length > 0 && <span className="text-slate-500">· {entries.length} eventos</span>}
        </span>
        <span className="text-slate-500">{open ? '▼ fechar' : '▲ abrir'}</span>
      </button>
      {open && (
        <div className="h-[calc(100%-2.5rem)] overflow-auto font-mono text-[11px] px-4 py-2 bg-bg/80">
          {entries.length === 0 ? (
            <p className="text-slate-500">Aguardando atividade…</p>
          ) : (
            entries.map((e, i) => (
              <div key={i} className={lineClass(e.kind)}>
                <span className="text-slate-600 mr-2">{e.time}</span>
                {e.prefix && <span className="text-slate-500 mr-2">{e.prefix}</span>}
                <span>{e.text}</span>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}

function formatEntry(type, payload, running) {
  const time = new Date(payload.ts || Date.now()).toLocaleTimeString('pt-BR');
  const src = payload.source ? `[${payload.source.slice(0, 6)}]` : '';

  switch (type) {
    case 'command.started':
      if (payload.source) running.set(payload.source, payload.name);
      return {
        kind: 'cmd_start', time, prefix: src,
        text: `▶ ${payload.name}  (${payload.cmd} ${(payload.args || []).join(' ')})`,
      };
    case 'command.stdout':
      return { kind: 'stdout', time, prefix: src, text: payload.line };
    case 'command.stderr':
      return { kind: 'stderr', time, prefix: src, text: `! ${payload.line}` };
    case 'command.exit':
      if (payload.source) running.delete(payload.source);
      return {
        kind: payload.code === 0 ? 'cmd_ok' : 'cmd_fail',
        time, prefix: src,
        text: `■ exit code=${payload.code}${payload.signal ? ` signal=${payload.signal}` : ''}`,
      };
    case 'handoff.transitioned':
      return { kind: 'event', time, prefix: src, text: `↪ handoff #${payload.id} → ${payload.status}` };
    case 'spec.created':
      return { kind: 'event', time, prefix: src, text: `✚ spec criada: ${payload.slug}` };
    case 'spec.status_changed':
      return { kind: 'event', time, prefix: src, text: `↪ spec ${payload.slug}/${payload.stage}: ${payload.from} → ${payload.to}` };
    default:
      return null;
  }
}

function lineClass(kind) {
  switch (kind) {
    case 'stderr':   return 'text-rose-400';
    case 'cmd_fail': return 'text-rose-300';
    case 'cmd_ok':   return 'text-emerald-400';
    case 'cmd_start':return 'text-blue-300';
    case 'event':    return 'text-violet-300';
    default:         return 'text-slate-200';
  }
}
