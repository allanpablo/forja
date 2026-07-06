import { NavLink, Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useEvents } from '../lib/useEvents.js';
import ActivityLog from './ActivityLog.jsx';

const NAV = [
  { to: '/system', label: 'Sistema', icon: '∴' },
  { to: '/', label: 'Briefing', icon: 'B' },
  { to: '/specs', label: 'Specs', icon: 'S' },
  { to: '/handoffs', label: 'Handoffs', icon: 'H' },
  { to: '/commands', label: 'Comandos', icon: 'C' },
  { to: '/projects', label: 'Projetos', icon: 'P' },
  { to: '/workflow', label: 'Workflow', icon: '▦' },
  { to: '/stack', label: 'Stack', icon: '◫' },
  { to: '/agents', label: 'Agentes', icon: '◎' },
  { to: '/docs', label: 'Docs', icon: '§' },
  { to: '/memory', label: 'Memória', icon: '⌘' },
  { to: '/functions', label: 'Funções', icon: 'ƒ' },
  { to: '/tokens', label: 'Tokens', icon: '📊' },
];

export default function Layout() {
  const [health, setHealth] = useState(null);
  const { connected } = useEvents();

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth({ ok: false }));
  }, []);

  return (
    <div className="grid grid-cols-[232px_1fr] h-full">
      <aside className="border-r border-border bg-black/95 p-4 flex flex-col gap-4 overflow-auto">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-5 w-5 border border-white bg-white text-black text-[10px] font-semibold inline-flex items-center justify-center">A</span>
            <h1 className="text-base font-semibold tracking-normal">Agent Dashboard</h1>
          </div>
          <p className="text-xs text-slate-400">
            {health?.ok ? `v${health.version}` : 'conectando…'}
          </p>
          <div className="text-[10px] mt-1 flex items-center gap-1">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            <span className="text-slate-500">{connected ? 'realtime ligado' : 'reconectando…'}</span>
          </div>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                `px-3 py-2 rounded-md text-sm flex items-center gap-2 border ${isActive ? 'bg-white text-black border-white' : 'text-neutral-300 border-transparent hover:bg-neutral-950 hover:border-border'}`
              }
            >
              <span className="h-5 w-5 rounded-sm border border-current/20 inline-flex items-center justify-center text-[10px] font-mono">{n.icon}</span>
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto text-[10px] text-slate-500">
          bind 127.0.0.1 · CLI canônica
        </div>
      </aside>
      <main className="p-6 overflow-auto pb-16 bg-black">
        <Outlet />
      </main>
      <ActivityLog />
    </div>
  );
}
