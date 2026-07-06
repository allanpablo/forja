import { useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { usePolling } from '../lib/usePolling.js';

const SURFACES = ['Todas', 'Workflow', 'Harness', 'Stack', 'Agentes', 'Handoffs', 'Governance', 'Funções'];

export default function Functions() {
  const { data, error, loading, refetch } = usePolling(api.functions);
  const [surface, setSurface] = useState('Todas');
  const [selected, setSelected] = useState(null);

  const filtered = useMemo(() => {
    const list = data || [];
    if (surface === 'Todas') return list;
    return list.filter(fn => (fn.visibleIn || []).includes(surface));
  }, [data, surface]);

  const harnessFns = (data || []).filter(fn => (fn.visibleIn || []).includes('Harness'));

  if (loading && !data) return <p className="text-slate-400 text-sm">Carregando...</p>;
  if (error) return <p className="text-rose-300">Erro: {error.message}</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Funções operacionais</h2>
          <p className="text-sm text-slate-400 max-w-3xl">
            Catálogo das ações que o frontend chama, das rotas de backend e dos harnesses GSD/Hermes/design-md que entram no fluxo.
          </p>
        </div>
        <button type="button" className="btn" onClick={refetch}>Atualizar</button>
      </div>

      <section className="card space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-2">
          <div>
            <h3 className="font-semibold">Execução GSD, Hermes e design-md</h3>
            <p className="text-xs text-slate-500">
              O Workflow executa LLMs no terminal do browser. GSD/Hermes entram como harness de controle: runbook, handoff e gates.
            </p>
          </div>
          <span className="badge badge-approved">{harnessFns.length} funções de harness</span>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
          {harnessFns.map(fn => <FunctionCard key={fn.name} fn={fn} compact onSelect={() => setSelected(fn)} />)}
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {SURFACES.map(item => (
          <button
            key={item}
            type="button"
            className={`btn ${surface === item ? 'btn-primary' : ''}`}
            onClick={() => setSurface(item)}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-4">
        <section className="grid grid-cols-1 xl:grid-cols-2 gap-4 content-start">
          {filtered.map(fn => (
            <FunctionCard key={fn.name} fn={fn} onSelect={() => setSelected(fn)} />
          ))}
        </section>

        <aside className="card space-y-3 h-fit xl:sticky xl:top-4">
          {!selected && <p className="text-sm text-slate-500">Selecione uma função para ver contrato, input e quando executar.</p>}
          {selected && <FunctionDetail fn={selected} />}
        </aside>
      </div>
    </div>
  );
}

function FunctionCard({ fn, onSelect, compact = false }) {
  return (
    <button type="button" className="card text-left space-y-3 hover:bg-slate-900/40" onClick={onSelect}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{fn.label}</h3>
          <code className="text-[11px] text-accent">{fn.name}</code>
        </div>
        <span className="badge badge-unknown">{fn.method}</span>
      </div>
      <p className={`text-sm text-slate-400 ${compact ? 'line-clamp-2' : ''}`}>{fn.description}</p>
      <div className="font-mono text-xs bg-bg/70 border border-border rounded p-2 break-all">{fn.endpoint}</div>
      <div className="flex flex-wrap gap-1">
        {(fn.visibleIn || []).map(item => (
          <span key={item} className="badge badge-approved">{item}</span>
        ))}
      </div>
    </button>
  );
}

function FunctionDetail({ fn }) {
  return (
    <>
      <div>
        <div className="text-[10px] uppercase text-slate-500">{fn.method}</div>
        <h3 className="font-semibold text-lg">{fn.label}</h3>
        <code className="text-xs text-accent">{fn.name}</code>
      </div>
      <p className="text-sm text-slate-400">{fn.description}</p>
      <Block title="Endpoint ou comando" text={fn.endpoint} mono />
      <Block title="Input" text={JSON.stringify(fn.input, null, 2)} mono />
      <Block title="Onde aparece" text={(fn.visibleIn || []).join(', ')} />
      <Block title="Quando executar" text={executionMoment(fn)} />
    </>
  );
}

function executionMoment(fn) {
  if (fn.name.startsWith('gsd.plan')) return 'Depois do Briefing/slug aprovado, antes de começar specs e handoffs.';
  if (fn.name.startsWith('gsd.handoff')) return 'Na troca entre Product, SDD Architect, Worker e Governance.';
  if (fn.name.startsWith('gsd.check')) return 'Antes de Governance aprovar review ou release.';
  if (fn.name.startsWith('design.')) return 'Na etapa Stack/Design, antes do front implementar a UI.';
  if (fn.name.startsWith('workflow.run_llm')) return 'Dentro do terminal do Workflow, com o step e prompt já selecionados.';
  if (fn.name.startsWith('handoff.')) return 'Quando a IA entregou algo para leitura, finalização ou arquivamento.';
  return 'Quando a tela listada em "Onde aparece" precisar executar essa operação.';
}

function Block({ title, text, mono = false }) {
  return (
    <section>
      <h4 className="text-xs uppercase text-slate-500 mb-1">{title}</h4>
      <pre className={`bg-bg/70 border border-border rounded p-2 whitespace-pre-wrap text-xs ${mono ? 'font-mono' : 'font-sans'} text-slate-300`}>{text}</pre>
    </section>
  );
}
