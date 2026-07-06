import { useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { usePolling } from '../lib/usePolling.js';
import Drawer from '../components/Drawer.jsx';

const STATUSES = ['open', 'in_progress', 'done', 'archived'];
const CORE_ORDER = ['orchestrator', 'product', 'context-engineer', 'sdd-architect', 'marketing', 'governance'];

const ROLE_CATALOG = {
  orchestrator: {
    stage: 'Roteamento',
    owns: ['workflow', 'handoffs', 'memoria de sprint'],
    input: 'Briefing aprovado ou demanda atravessando varios papeis.',
    output: 'Handoffs ADR-0005, ordem de execucao e consolidacao final.',
    next: 'Product, Context Engineer ou SDD Architect',
  },
  product: {
    stage: 'Briefing e Specs',
    owns: ['spec.md', 'backlog.md', 'metrica 30d'],
    input: 'Demanda nova, ambiguidade de produto ou objetivo de sprint.',
    output: 'Problema, escopo, criterios de aceite e prioridade editavel.',
    next: 'SDD Architect',
  },
  'context-engineer': {
    stage: 'Contexto',
    owns: ['.context/pack.md', 'tokens', 'compressao'],
    input: 'Tarefa pesada, analise multi-arquivo ou duvida sobre consumo.',
    output: 'Pacote de contexto com modo global/domain/task e estimativa de tokens.',
    next: 'Product, SDD Architect ou Worker',
  },
  'sdd-architect': {
    stage: 'Plano',
    owns: ['plan.md', 'tasks.md', 'ADRs'],
    input: 'Spec aprovada ou decisao estrutural pendente.',
    output: 'Plano tecnico, tarefas executaveis, riscos e ADRs necessarias.',
    next: 'Worker',
  },
  marketing: {
    stage: 'Positioning',
    owns: ['copy', 'eventos AARRR', 'funil'],
    input: 'Preparacao de release, landing/copy ou leitura pos-launch.',
    output: 'Mensagem, eventos a instrumentar e relatorio de funil.',
    next: 'Product ou Governance',
  },
  governance: {
    stage: 'Validacao',
    owns: ['project:check', 'LGPD', 'seguranca', 'release gate'],
    input: 'Antes de merge/release ou handoff de review.',
    output: 'Veredito verificavel, bloqueios e pendencias de conformidade.',
    next: 'Orchestrator',
  },
};

const PROCESS_STEPS = [
  { step: 'Briefing', roles: ['product'], note: 'entrada, slug e objetivo' },
  { step: 'Estrutura', roles: ['orchestrator'], note: 'repos, memoria e agentes' },
  { step: 'Sprints', roles: ['product'], note: 'sugestao editavel' },
  { step: 'Contexto', roles: ['context-engineer'], note: 'pack e tokens' },
  { step: 'Specs', roles: ['product'], note: 'AC e metrica' },
  { step: 'Plano', roles: ['sdd-architect'], note: 'plan, tasks e ADRs' },
  { step: 'Implementacao', roles: ['worker'], note: 'execucao por harness/IA' },
  { step: 'Review', roles: ['governance'], note: 'checks e handoff final' },
  { step: 'Done', roles: ['orchestrator'], note: 'memoria e arquivo' },
];

export default function Agents() {
  const { data, error, loading, refetch } = usePolling(
    api.agents,
    30000,
    ['handoff.transitioned', 'llm.routing_updated'],
  );
  const { data: routing, refetch: refetchRouting } = usePolling(
    api.llmRouting,
    30000,
    ['llm.routing_updated'],
  );
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState('papel');

  const agents = useMemo(() => {
    const list = data || [];
    return [...list].sort((a, b) => {
      const ai = CORE_ORDER.indexOf(a.slug);
      const bi = CORE_ORDER.indexOf(b.slug);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      return a.slug.localeCompare(b.slug);
    });
  }, [data]);
  const agentSlugs = useMemo(() => new Set(agents.map(agent => agent.slug)), [agents]);
  const customRoles = Object.entries(routing?.assignments || {})
    .filter(([role]) => !agentSlugs.has(role))
    .sort(([a], [b]) => a.localeCompare(b));
  const totals = useMemo(() => {
    return agents.reduce((acc, agent) => {
      acc.active += agent.handoffs?.active || (agent.handoffs?.open || 0) + (agent.handoffs?.in_progress || 0);
      acc.done += agent.handoffs?.done || 0;
      acc.archived += agent.handoffs?.archived || 0;
      return acc;
    }, { active: 0, done: 0, archived: 0 });
  }, [agents]);

  async function openAgent(name) {
    setDetail(null);
    setTab('papel');
    try { setDetail(await api.agent(name)); }
    catch (err) { setDetail({ error: err.message }); }
  }

  async function saveRouting(role, assignment) {
    await api.setLlmRouting(role, assignment);
    await Promise.all([refetch(), refetchRouting()]);
    if (detail?.slug === role) {
      setDetail(await api.agent(role));
    }
  }

  if (loading && !data) return <p className="text-slate-400 text-sm">Carregando...</p>;
  if (error) return <p className="text-rose-300">Erro: {error.message}</p>;

  return (
    <div className="space-y-5">
      <header className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Agentes e papéis</h2>
          <p className="text-sm text-slate-400 mt-1 max-w-3xl">
            Catálogo operacional dos papéis do framework: quando cada agente entra, o que recebe, o que entrega e qual LLM executa aquele papel.
          </p>
        </div>
        <button type="button" className="btn" onClick={refetch}>Atualizar</button>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Metric label="Papéis canonicos" value={agents.length} />
        <Metric label="Papéis customizados" value={customRoles.length} />
        <Metric label="Handoffs ativos" value={totals.active} />
        <Metric label="Arquivados" value={totals.archived} />
      </div>

      <ProcessMap agents={agentSlugs} />

      <section className="space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-2">
          <div>
            <h3 className="font-semibold">Papéis do framework</h3>
            <p className="text-xs text-slate-500">Clique em um papel para ler prompt, regras, saida esperada e roteamento de LLM.</p>
          </div>
          <span className="text-xs text-slate-500">Fonte: .claude/agents + prompts + SQLite handoffs</span>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {agents.map(agent => (
            <AgentCard key={agent.slug} agent={agent} onOpen={() => openAgent(agent.slug)} />
          ))}
        </div>
      </section>

      <section className="card space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
          <div>
            <h3 className="font-semibold">Papéis customizados</h3>
            <p className="text-xs text-slate-500 max-w-2xl">
              Use para rotas que ainda nao viraram sub-agent, como ceo, cto, qa-lead ou designer. Esses papéis entram no roteamento de LLM, mas ainda nao possuem prompt canônico em .claude/agents.
            </p>
          </div>
          <code className="text-[10px] text-slate-500 break-all">{routing?.path || '.memory/agent-llm-routing.json'}</code>
        </div>
        <RoutingForm
          key="new-custom-role"
          role=""
          providers={routing?.providers || []}
          onSave={saveRouting}
          allowRoleEdit
        />
        {customRoles.length > 0 && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 pt-2">
            {customRoles.map(([role, assignment]) => (
              <div key={role} className="border border-border rounded p-3 space-y-2 bg-bg/40">
                <div className="flex justify-between gap-2">
                  <span className="font-mono text-accent">{role}</span>
                  <LlmBadge assignment={assignment} />
                </div>
                <RoutingForm
                  key={role}
                  role={role}
                  assignment={assignment}
                  providers={routing?.providers || []}
                  onSave={saveRouting}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <Drawer open={!!detail} onClose={() => setDetail(null)} title={detail?.name || 'Agente'}>
        {!detail && <p className="text-slate-400 text-sm">Carregando...</p>}
        {detail?.error && <p className="text-rose-400">{detail.error}</p>}
        {detail && !detail.error && (
          <AgentDrawer
            detail={detail}
            tab={tab}
            setTab={setTab}
            routing={routing}
            saveRouting={saveRouting}
          />
        )}
      </Drawer>
    </div>
  );
}

function ProcessMap({ agents }) {
  return (
    <section className="card space-y-3">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-2">
        <div>
          <h3 className="font-semibold">Ordem operacional no frontend</h3>
          <p className="text-xs text-slate-500">Tokens ficam fora do processo; aqui aparecem só os passos que movimentam projeto e handoff.</p>
        </div>
        <span className="badge badge-approved">SDD + Hermes + GSD</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-9 gap-2">
        {PROCESS_STEPS.map((item, index) => {
          const missing = item.roles.filter(role => role !== 'worker' && !agents.has(role));
          return (
            <div key={item.step} className="border border-border rounded p-2 bg-bg/50 min-h-28">
              <div className="text-[10px] text-slate-500 uppercase">Step {index + 1}</div>
              <div className="font-semibold text-sm mt-1">{item.step}</div>
              <div className="text-[11px] text-slate-400 mt-1">{item.note}</div>
              <div className="flex flex-wrap gap-1 mt-2">
                {item.roles.map(role => (
                  <span key={role} className={`badge ${role === 'worker' ? 'badge-unknown' : 'badge-approved'}`}>{role}</span>
                ))}
              </div>
              {missing.length > 0 && <div className="text-[10px] text-amber-300 mt-2">Prompt ausente: {missing.join(', ')}</div>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AgentCard({ agent, onOpen }) {
  const profile = ROLE_CATALOG[agent.slug] || {};
  const active = agent.handoffs?.active || (agent.handoffs?.open || 0) + (agent.handoffs?.in_progress || 0);
  return (
    <button
      type="button"
      className="card text-left space-y-3 hover:bg-slate-900/40"
      onClick={onOpen}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase text-slate-500">{profile.stage || 'Papel'}</div>
          <h3 className="font-semibold text-base mt-0.5">{agent.name}</h3>
          <p className="text-xs text-slate-400 mt-1 line-clamp-2">{agent.description}</p>
        </div>
        <LlmBadge assignment={agent.llm} />
      </div>

      <div className="grid grid-cols-4 gap-2">
        <Stat label="ativos" value={active} />
        <Stat label="done" value={agent.handoffs?.done || 0} />
        <Stat label="arquivados" value={agent.handoffs?.archived || 0} />
        <Stat label="total" value={agent.handoffs?.total || 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        <MiniBlock title="Entrada" text={profile.input || agent.when} />
        <MiniBlock title="Entrega" text={profile.output || agent.expectedOutput} />
      </div>

      <div className="flex flex-wrap gap-1">
        {(profile.owns || []).map(item => <span key={item} className="badge badge-unknown">{item}</span>)}
        {(agent.tools || []).map(tool => <span key={tool} className="badge badge-unknown">{tool}</span>)}
      </div>
    </button>
  );
}

function AgentDrawer({ detail, tab, setTab, routing, saveRouting }) {
  const profile = ROLE_CATALOG[detail.slug] || {};
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-2">
        {STATUSES.map(status => (
          <Stat key={status} label={status} value={detail.handoffs?.[status] || 0} />
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          ['papel', 'Papel'],
          ['routing', 'Roteamento'],
          ['claude', 'Prompt Claude'],
          ['prompt', 'Prompt portatil'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`btn ${tab === key ? 'btn-primary' : ''}`}
            onClick={() => setTab(key)}
            disabled={key === 'prompt' && !detail.prompt}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'papel' && (
        <div className="space-y-4 text-sm">
          <section className="card space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase text-slate-500">{profile.stage || 'Papel'}</div>
                <p className="text-slate-300 mt-1">{detail.description}</p>
              </div>
              <LlmBadge assignment={detail.llm} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <MiniBlock title="Recebe" text={profile.input || detail.when} />
              <MiniBlock title="Entrega" text={profile.output || detail.expectedOutput} />
              <MiniBlock title="Próximo papel" text={profile.next} />
              <MiniBlock title="Artefatos" text={(profile.owns || []).join(', ')} />
            </div>
          </section>

          <Block title="Quando acionar" text={detail.when} />
          <Block title="Quando nao acionar" text={detail.whenNot} />
          <Block title="Responsabilidades" text={detail.responsibilities} />
          <Block title="Regras" text={detail.rules} />
          <Block title="Saida esperada" text={detail.expectedOutput} />
          <Block title="Handoff" text={detail.handoffProtocol} />
          <PathList detail={detail} />
        </div>
      )}

      {tab === 'routing' && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-300">LLM do papel</h3>
            <LlmBadge assignment={detail.llm} />
          </div>
          <RoutingForm
            key={detail.slug}
            role={detail.slug}
            assignment={detail.llm}
            providers={routing?.providers || []}
            onSave={saveRouting}
          />
        </div>
      )}

      {tab === 'claude' && <pre className="card whitespace-pre-wrap font-mono text-xs leading-relaxed">{detail.content}</pre>}
      {tab === 'prompt' && <pre className="card whitespace-pre-wrap font-mono text-xs leading-relaxed">{detail.prompt}</pre>}
    </div>
  );
}

function LlmBadge({ assignment }) {
  if (!assignment?.provider) return <span className="badge badge-unknown whitespace-nowrap">sem LLM</span>;
  return (
    <span className="badge badge-approved whitespace-nowrap">
      {assignment.provider}{assignment.model ? ` · ${assignment.model}` : ''}
    </span>
  );
}

function RoutingForm({ role, assignment, providers, onSave, allowRoleEdit = false }) {
  const firstProvider = providers[0]?.id || 'codex';
  const currentProvider = providers.find(p => p.id === assignment?.provider) || providers[0];
  const [draft, setDraft] = useState({
    role,
    provider: assignment?.provider || firstProvider,
    model: assignment?.model || currentProvider?.models?.[0] || '',
    command: assignment?.command ?? currentProvider?.command ?? '',
    taskTypes: (assignment?.taskTypes || []).join(', '),
    notes: assignment?.notes || '',
  });
  const [saving, setSaving] = useState(false);

  function patch(next) {
    setDraft(prev => ({ ...prev, ...next }));
  }

  function changeProvider(providerId) {
    const provider = providers.find(p => p.id === providerId);
    patch({
      provider: providerId,
      model: provider?.models?.[0] || '',
      command: provider?.command || '',
    });
  }

  async function submit(event) {
    event.preventDefault();
    const targetRole = (allowRoleEdit ? draft.role : role).trim().toLowerCase();
    if (!targetRole) return;
    setSaving(true);
    try {
      await onSave(targetRole, {
        provider: draft.provider,
        model: draft.model,
        command: draft.command,
        taskTypes: draft.taskTypes.split(',').map(t => t.trim()).filter(Boolean),
        notes: draft.notes,
      });
      if (allowRoleEdit) patch({ role: '', notes: '', taskTypes: '' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-2" onSubmit={submit}>
      <div className={`grid ${allowRoleEdit ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
        {allowRoleEdit && (
          <input
            className="bg-bg border border-border rounded px-2 py-2 text-sm outline-none focus:border-accent"
            value={draft.role}
            onChange={(event) => patch({ role: event.target.value })}
            placeholder="papel, ex: ceo"
          />
        )}
        <select
          className="bg-bg border border-border rounded px-2 py-2 text-sm"
          value={draft.provider}
          onChange={(event) => changeProvider(event.target.value)}
        >
          {providers.map(provider => (
            <option key={provider.id} value={provider.id}>{provider.label}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input
          className="bg-bg border border-border rounded px-2 py-2 text-sm outline-none focus:border-accent"
          value={draft.model}
          onChange={(event) => patch({ model: event.target.value })}
          placeholder="modelo"
        />
        <input
          className="bg-bg border border-border rounded px-2 py-2 text-sm outline-none focus:border-accent"
          value={draft.command}
          onChange={(event) => patch({ command: event.target.value })}
          placeholder="comando/CLI"
        />
      </div>
      <input
        className="w-full bg-bg border border-border rounded px-2 py-2 text-sm outline-none focus:border-accent"
        value={draft.taskTypes}
        onChange={(event) => patch({ taskTypes: event.target.value })}
        placeholder="tarefas: strategy, code, review"
      />
      <textarea
        className="w-full bg-bg border border-border rounded px-2 py-2 text-sm outline-none focus:border-accent min-h-16"
        value={draft.notes}
        onChange={(event) => patch({ notes: event.target.value })}
        placeholder="observações de uso"
      />
      <button type="submit" className="btn btn-primary" disabled={saving || !draft.provider}>
        {saving ? 'Salvando...' : 'Salvar roteamento'}
      </button>
    </form>
  );
}

function Metric({ label, value }) {
  return (
    <div className="card">
      <div className="text-slate-500 text-[10px] uppercase truncate">{label}</div>
      <div className="text-xl font-semibold text-slate-100 mt-1">{value}</div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-bg/60 border border-border rounded p-2">
      <div className="text-slate-500 text-[10px] uppercase truncate">{label}</div>
      <div className="text-sm font-semibold text-slate-100">{value}</div>
    </div>
  );
}

function MiniBlock({ title, text }) {
  if (!text) return <div className="bg-bg/50 border border-border rounded p-2 text-xs text-slate-600">Sem {title.toLowerCase()}</div>;
  return (
    <div className="bg-bg/50 border border-border rounded p-2">
      <div className="text-[10px] uppercase text-slate-500 mb-1">{title}</div>
      <div className="text-xs text-slate-300 line-clamp-3">{text}</div>
    </div>
  );
}

function Block({ title, text }) {
  if (!text) return null;
  return (
    <section>
      <h4 className="text-xs uppercase text-slate-500 mb-1">{title}</h4>
      <pre className="whitespace-pre-wrap text-xs text-slate-300 font-sans">{text}</pre>
    </section>
  );
}

function PathList({ detail }) {
  return (
    <section className="border border-border rounded p-3 bg-bg/50">
      <h4 className="text-xs uppercase text-slate-500 mb-2">Arquivos do papel</h4>
      <div className="space-y-1 text-xs">
        <div><span className="text-slate-500">Claude:</span> <code className="text-accent">{detail.claudePath}</code></div>
        {detail.promptPath && <div><span className="text-slate-500">Portatil:</span> <code className="text-accent">{detail.promptPath}</code></div>}
      </div>
    </section>
  );
}
