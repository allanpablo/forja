import { useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { usePolling } from '../lib/usePolling.js';

const ROOTS = [
  { key: '', label: 'Tudo' },
  { key: 'docs', label: 'Docs' },
  { key: 'memory', label: 'Memória' },
  { key: 'prompts', label: 'Prompts' },
];

export default function Docs() {
  const [root, setRoot] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const fetcher = useMemo(() => () => api.docs(root ? { root } : {}), [root]);
  const { data, error, loading, refetch } = usePolling(fetcher);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data || [];
    return (data || []).filter(doc =>
      doc.path.toLowerCase().includes(q) || doc.title.toLowerCase().includes(q) || doc.section.toLowerCase().includes(q)
    );
  }, [data, query]);

  async function openDoc(path) {
    setSelected({ path, loading: true });
    try { setSelected(await api.doc(path)); }
    catch (err) { setSelected({ path, error: err.message }); }
  }

  if (loading && !data) return <p className="text-slate-400 text-sm">Carregando...</p>;
  if (error) return <p className="text-rose-300">Erro: {error.message}</p>;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-4 h-[calc(100vh-6rem)]">
      <section className="space-y-4 min-h-0">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Documentação ({filtered.length})</h2>
          <button type="button" className="btn" onClick={refetch}>Atualizar</button>
        </div>

        <div className="flex flex-wrap gap-2">
          {ROOTS.map(item => (
            <button
              key={item.key || 'all'}
              type="button"
              className={`btn ${root === item.key ? 'btn-primary' : ''}`}
              onClick={() => setRoot(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <input
          className="w-full bg-bg border border-border rounded px-3 py-2 text-sm outline-none focus:border-accent"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filtrar por título, caminho ou seção"
        />

        <div className="card p-0 overflow-auto h-[calc(100%-9rem)]">
          {filtered.map(doc => (
            <button
              key={doc.path}
              type="button"
              className={`w-full text-left px-4 py-3 border-b border-border hover:bg-slate-900/50 ${selected?.path === doc.path ? 'bg-slate-900/70' : ''}`}
              onClick={() => openDoc(doc.path)}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm">{doc.title}</span>
                <span className="text-[10px] text-slate-500 uppercase">{doc.root}</span>
              </div>
              <div className="font-mono text-[11px] text-slate-500 mt-1 truncate">{doc.path}</div>
            </button>
          ))}
          {filtered.length === 0 && <p className="p-6 text-center text-slate-500 text-sm">Nenhum documento encontrado.</p>}
        </div>
      </section>

      <section className="min-h-0">
        {!selected && (
          <div className="card h-full flex items-center justify-center text-slate-500 text-sm">
            Selecione um documento.
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
              <span className="text-[10px] text-slate-500 whitespace-nowrap">{new Date(selected.updatedAt).toLocaleString('pt-BR')}</span>
            </div>
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-200">{selected.content}</pre>
          </article>
        )}
      </section>
    </div>
  );
}
