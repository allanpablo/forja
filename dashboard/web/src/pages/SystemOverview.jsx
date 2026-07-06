import { api } from '../lib/api.js';
import { usePolling } from '../lib/usePolling.js';
import Badge from '../components/Badge.jsx';

export default function SystemOverview() {
  const { data, error, loading, refetch } = usePolling(
    api.systemOverview,
    30000,
    ['handoff.transitioned', 'stack.updated', 'workflow.updated'],
  );

  if (loading && !data) return <p className="text-slate-400 text-sm">Carregando...</p>;
  if (error) return <p className="text-rose-300">Erro: {error.message}</p>;

  return (
    <div className="space-y-4">
      <header className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Visão do sistema</h2>
          <p className="text-sm text-slate-400 max-w-3xl">
            Estado geral dos projetos, steps atuais, gates de execução, handoffs e memória universal.
          </p>
        </div>
        <button type="button" className="btn" onClick={refetch}>Atualizar</button>
      </header>

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        <Metric label="Projetos" value={data.counts.projects} />
        <Metric label="Handoffs ativos" value={data.counts.handoffsOpen} />
        <Metric label="Finalizados" value={data.counts.handoffsDone} />
        <Metric label="Arquivados" value={data.counts.handoffsArchived} />
        <Metric label="Memória" value={data.counts.memoryNodes} />
      </div>

      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Projetos em execução</h3>
          <span className="text-xs text-slate-500">{new Date(data.generatedAt).toLocaleString('pt-BR')}</span>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {(data.projects || []).map(project => <ProjectCard key={project.project} project={project} />)}
          {(data.projects || []).length === 0 && <p className="text-sm text-slate-500">Nenhum projeto detectado em projects/.</p>}
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-4">
        <div className="card space-y-3">
          <h3 className="font-semibold">Últimos handoffs</h3>
          <div className="space-y-2">
            {(data.latestHandoffs || []).map(h => (
              <div key={h.id} className="border border-border rounded-md p-3 bg-bg/50 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <code className="text-accent">#{h.id} {h.intent}</code>
                  <Badge status={h.status}>{h.status}</Badge>
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {h.from_agent} → {h.to_agent}{h.spec_slug ? ` · ${h.spec_slug}` : ''}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card space-y-3">
          <h3 className="font-semibold">Gates globais</h3>
          <GateCount label="open" value={data.handoffs.open || 0} />
          <GateCount label="in_progress" value={data.handoffs.in_progress || 0} />
          <GateCount label="done" value={data.handoffs.done || 0} />
          <GateCount label="archived" value={data.handoffs.archived || 0} />
        </div>
      </section>
    </div>
  );
}

function ProjectCard({ project }) {
  const step = project.workflow?.currentStep;
  return (
    <article className="border border-border rounded-md p-3 bg-bg/50 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold">{project.project}</h4>
          <p className="text-xs text-slate-500">gates {project.gatesOk}/{project.gatesTotal}</p>
        </div>
        <span className="badge badge-approved">{project.workflow?.progress ?? 0}%</span>
      </div>
      <div className="h-1 bg-neutral-900 border border-border rounded-full overflow-hidden">
        <div className="h-full bg-white" style={{ width: `${project.workflow?.progress ?? 0}%` }} />
      </div>
      {step ? (
        <div className="text-sm">
          <div className="text-slate-500 text-[10px] uppercase">Step atual</div>
          <div className="flex items-center justify-between gap-2 mt-1">
            <span>{step.order}. {step.title}</span>
            <Badge status={step.status}>{step.status}</Badge>
          </div>
          <code className="text-xs text-slate-500">{step.role}</code>
        </div>
      ) : (
        <p className="text-sm text-slate-500">Workflow ainda não inicializado.</p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {project.gates.map(gate => (
          <div key={gate.label} className={`border rounded-md p-2 text-xs ${gate.ok ? 'border-neutral-700 text-slate-200' : 'border-red-950 text-red-300'}`}>
            <div className="font-medium">{gate.label}</div>
            <code className="text-[10px] text-slate-500 break-all">{gate.path}</code>
          </div>
        ))}
      </div>
    </article>
  );
}

function Metric({ label, value }) {
  return (
    <div className="card">
      <div className="text-slate-500 text-[10px] uppercase">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}

function GateCount({ label, value }) {
  return (
    <div className="flex items-center justify-between border border-border rounded-md p-2 bg-bg/50">
      <span className="font-mono text-sm">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
