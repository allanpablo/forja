import { useState } from 'react';
import { api } from '../lib/api.js';
import { usePolling } from '../lib/usePolling.js';

const COLUMNS = [
  { key: 'open', label: 'Aguardando leitura' },
  { key: 'in_progress', label: 'IA trabalhando' },
  { key: 'done', label: 'Finalizados' },
];

export default function Handoffs() {
  const { data, error, loading, refetch } = usePolling(
    () => api.handoffs({ limit: 200 }),
    30000,
    ['handoff.created', 'handoff.transitioned'],
  );
  const [pending, setPending] = useState(null);
  const [filter, setFilter] = useState({ project: '', showArchived: false });

  async function transition(id, to) {
    setPending(id);
    try {
      await api.transitionHandoff(id, to);
      await refetch();
    } catch (err) {
      alert(`Falhou: ${err.detail?.error || err.message}`);
    } finally {
      setPending(null);
    }
  }

  if (loading && !data) return <p className="text-slate-400 text-sm">Carregando…</p>;
  if (error) {
    return (
      <div className="card border-rose-700">
        <p className="text-rose-300">Erro: {error.message}</p>
      </div>
    );
  }

  const projects = [...new Set((data || []).map(h => h.spec_slug).filter(Boolean))].sort();
  const visible = (data || []).filter(h => {
    if (filter.project && h.spec_slug !== filter.project) return false;
    return h.status !== 'archived';
  });
  const archived = (data || []).filter(h => {
    if (filter.project && h.spec_slug !== filter.project) return false;
    return h.status === 'archived';
  });
  const byStatus = { open: [], in_progress: [], done: [], cancelled: [], archived: [] };
  for (const h of visible) {
    if (byStatus[h.status]) byStatus[h.status].push(h);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Handoffs ({activeCount(byStatus)})</h2>
          <p className="text-sm text-slate-400">Caixa de entregas da IA: leia o retorno, finalize quando aceito e arquive para limpar o histórico ativo.</p>
        </div>
        <button type="button" className="btn" onClick={refetch}>Atualizar</button>
      </div>

      <div className="card flex flex-col lg:flex-row lg:items-end gap-3">
        <label className="block min-w-72">
          <span className="block text-xs uppercase text-slate-400 mb-1">Projeto/spec</span>
          <select className="input" value={filter.project} onChange={event => setFilter(prev => ({ ...prev, project: event.target.value }))}>
            <option value="">Todos</option>
            {projects.map(project => <option key={project} value={project}>{project}</option>)}
          </select>
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={filter.showArchived}
            onChange={event => setFilter(prev => ({ ...prev, showArchived: event.target.checked }))}
          />
          Expandir arquivo
        </label>
        <button type="button" className="btn" onClick={() => setFilter({ project: '', showArchived: false })}>Limpar filtros</button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {COLUMNS.map((col) => (
          <div key={col.key} className="card space-y-3">
            <h3 className="text-sm font-semibold text-slate-300 flex justify-between">
              <span>{col.label}</span>
              <span className="text-slate-500">{byStatus[col.key].length}</span>
            </h3>
            <div className="space-y-2">
              {byStatus[col.key].map((h) => (
                <HandoffCard
                  key={h.id}
                  handoff={h}
                  pending={pending === h.id}
                  onTransition={transition}
                />
              ))}
              {byStatus[col.key].length === 0 && (
                <p className="text-slate-500 text-xs italic">vazio</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {byStatus.cancelled.length > 0 && (
        <details className="card">
          <summary className="cursor-pointer text-sm text-slate-400">
            Cancelados ({byStatus.cancelled.length})
          </summary>
          <div className="space-y-2 mt-2">
            {byStatus.cancelled.map(h => (
              <HandoffCard key={h.id} handoff={h} next={null} />
            ))}
          </div>
        </details>
      )}

      <details className="card">
        <summary className="cursor-pointer text-sm text-slate-400 flex items-center justify-between">
          <span>Arquivo de handoffs</span>
          <span className="text-slate-500">{byStatus.archived.length}</span>
        </summary>
        <div className="mt-3 space-y-2">
          {archived.length === 0 && (
            <p className="text-slate-500 text-xs italic">Nenhum handoff arquivado no filtro atual.</p>
          )}
          {archived.map(h => (
            <HandoffCard key={h.id} handoff={h} pending={false} />
          ))}
        </div>
      </details>
    </div>
  );
}

function HandoffCard({ handoff, pending, onTransition }) {
  const canFinish = handoff.status === 'open' || handoff.status === 'in_progress';
  const canArchive = handoff.status === 'done';
  const canCancel = handoff.status === 'open';

  return (
    <div className="border border-border rounded p-3 bg-bg/60 text-xs space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="font-mono text-accent">#{handoff.id}</span>
        <span className="text-slate-500 text-[10px]">
          {new Date(handoff.created_at).toLocaleString('pt-BR')}
        </span>
      </div>
      <div className="flex items-center gap-1 text-slate-300">
        <span>{handoff.from_agent}</span>
        <span className="text-slate-500">→</span>
        <span>{handoff.to_agent}</span>
      </div>
      <div className="text-slate-400">
        <span className="text-slate-500">intent:</span> {handoff.intent}
      </div>
      <div className="text-slate-400">
        <span className="text-slate-500">status:</span> <span className="font-mono">{handoff.status}</span>
      </div>
      {handoff.spec_slug && (
        <div className="text-slate-400">
          <span className="text-slate-500">spec:</span>{' '}
          <span className="font-mono">{handoff.spec_slug}</span>
        </div>
      )}
      <details className="border border-border rounded p-2 bg-bg/50">
        <summary className="cursor-pointer text-slate-300">Ler entrega e aceite</summary>
        <div className="mt-2 space-y-2">
          <Block label="Contexto" value={handoff.context} />
          <Block label="Aceite" value={handoff.acceptance} />
          <Block label="Restrições" value={handoff.constraints} />
          <Block label="Retorno esperado" value={handoff.return_to} />
        </div>
      </details>
      {onTransition && (
        <div className="flex flex-wrap gap-1 pt-1">
          {canFinish && (
            <button
              type="button"
              className="btn btn-primary flex-1"
              disabled={pending}
              onClick={() => onTransition(handoff.id, 'done')}
            >
              {pending ? '...' : 'Finalizar'}
            </button>
          )}
          {canArchive && (
            <button
              type="button"
              className="btn flex-1"
              disabled={pending}
              onClick={() => onTransition(handoff.id, 'archived')}
            >
              {pending ? '...' : 'Arquivar'}
            </button>
          )}
          {canCancel && (
            <button
              type="button"
              className="btn"
              disabled={pending}
              onClick={() => onTransition(handoff.id, 'cancelled')}
              title="cancelar"
            >
              Cancelar
            </button>
          )}
          {handoff.status === 'archived' && (
            <span className="text-slate-500 px-2 py-1">arquivado</span>
          )}
        </div>
      )}
    </div>
  );
}

function Block({ label, value }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-slate-500 mb-1">{label}</div>
      <pre className="whitespace-pre-wrap font-sans text-xs text-slate-300">{value || '-'}</pre>
    </div>
  );
}

function activeCount(byStatus) {
  return byStatus.open.length + byStatus.in_progress.length + byStatus.done.length;
}
