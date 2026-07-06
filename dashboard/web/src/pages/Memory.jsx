import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { usePolling } from '../lib/usePolling.js';

const LIMITS = [10, 25, 50, 100];

export default function Memory() {
  const { data: stats, error, loading, refetch } = usePolling(api.memoryStats);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('');
  const [limit, setLimit] = useState(25);
  const [results, setResults] = useState(null);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);

  const kinds = useMemo(() => (stats?.kinds || []).map(k => k.kind), [stats]);

  useEffect(() => {
    search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, limit]);

  async function search(event) {
    event?.preventDefault();
    setBusy(true);
    try {
      setResults(await api.memorySearch({ q: query, kind, limit: String(limit) }));
    } catch (err) {
      setResults({ error: err.message, results: [] });
    } finally {
      setBusy(false);
    }
  }

  async function openNode(id) {
    setSelected({ id, loading: true });
    try { setSelected(await api.memoryNode(id)); }
    catch (err) { setSelected({ id, error: err.message }); }
  }

  if (loading && !stats) return <p className="text-slate-400 text-sm">Carregando...</p>;
  if (error) return <p className="text-rose-300">Erro: {error.message}</p>;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-4 h-[calc(100vh-6rem)]">
      <section className="space-y-4 min-h-0">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Memória SQLite</h2>
          <button type="button" className="btn" onClick={refetch}>Atualizar</button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Stat label="Projetos" value={stats?.projects || 0} />
          <Stat label="Nós" value={stats?.nodes || 0} />
          <Stat label="Handoffs" value={stats?.handoffs || 0} />
        </div>

        <form className="space-y-2" onSubmit={search}>
          <input
            className="w-full bg-bg border border-border rounded px-3 py-2 text-sm outline-none focus:border-accent"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar no universal.db"
          />
          <div className="grid grid-cols-[1fr_96px_96px] gap-2">
            <select className="bg-bg border border-border rounded px-2 py-2 text-sm" value={kind} onChange={(event) => setKind(event.target.value)}>
              <option value="">Todos os tipos</option>
              {kinds.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
            <select className="bg-bg border border-border rounded px-2 py-2 text-sm" value={limit} onChange={(event) => setLimit(Number(event.target.value))}>
              {LIMITS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? '...' : 'Buscar'}</button>
          </div>
        </form>

        <div className="card p-0 overflow-auto h-[calc(100%-13rem)]">
          {(results?.results || stats?.recent || []).map(node => (
            <button
              key={node.id || node.path}
              type="button"
              className={`w-full text-left px-4 py-3 border-b border-border hover:bg-slate-900/50 ${selected?.id === node.id ? 'bg-slate-900/70' : ''}`}
              disabled={!node.id}
              onClick={() => openNode(node.id)}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm">{node.title || node.path}</span>
                <span className="badge badge-unknown">{node.kind}</span>
              </div>
              <div className="font-mono text-[11px] text-slate-500 mt-1 truncate">{node.path}</div>
              {node.snippet && (
                <p className="text-xs text-slate-400 mt-2 line-clamp-2" dangerouslySetInnerHTML={{ __html: sanitizeSnippet(node.snippet) }} />
              )}
            </button>
          ))}
          {results?.error && <p className="p-4 text-rose-300 text-sm">Erro: {results.error}</p>}
        </div>
      </section>

      <section className="min-h-0">
        {!selected && (
          <div className="card h-full flex items-center justify-center text-slate-500 text-sm">
            Selecione um nó da memória.
          </div>
        )}
        {selected?.loading && <div className="card h-full text-slate-400 text-sm">Carregando...</div>}
        {selected?.error && <div className="card border-rose-700 text-rose-300">Erro: {selected.error}</div>}
        {selected?.content && (
          <article className="card h-full overflow-auto">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="text-lg font-semibold">{selected.title}</h3>
                <code className="text-[11px] text-slate-500">{selected.path}</code>
              </div>
              <span className="badge badge-unknown">{selected.kind}</span>
            </div>
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-200">{selected.content}</pre>
          </article>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-bg/60 border border-border rounded p-2">
      <div className="text-slate-500 text-[10px] uppercase">{label}</div>
      <div className="text-sm font-semibold text-slate-100">{value}</div>
    </div>
  );
}

function sanitizeSnippet(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/&lt;mark&gt;/g, '<mark>')
    .replace(/&lt;\/mark&gt;/g, '</mark>');
}
