import { useState } from 'react';
import { api } from '../lib/api.js';
import { usePolling } from '../lib/usePolling.js';
import Badge from '../components/Badge.jsx';

export default function Projects() {
  const { data, error, loading, refetch } = usePolling(
    api.projects,
    30000,
    ['project.created', 'spec.created', 'spec.status_changed', 'handoff.created', 'handoff.transitioned'],
  );
  const { data: system } = usePolling(
    api.systemOverview,
    30000,
    ['handoff.transitioned', 'stack.updated', 'workflow.updated'],
  );
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');

  async function openProject(project) {
    setSelected(project);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const [workflow, specs, handoffs, tokens] = await Promise.all([
        api.workflow(project.name).catch(() => null),
        api.specs().catch(() => []),
        api.handoffs({ limit: 500 }).catch(() => []),
        api.tokens({ project: project.name, days: '30' }).catch(() => null),
      ]);
      setDetail({
        workflow,
        specs: specs.filter(spec => belongsToProject(spec.slug, project.name)),
        handoffs: handoffs.filter(handoff => belongsToProject(handoff.spec_slug, project.name)),
        tokens,
      });
      setAdminNotes(project.admin?.notes || '');
    } catch (err) {
      setDetailError(err.detail?.error || err.message);
    } finally {
      setDetailLoading(false);
    }
  }

  async function updateProjectStatus(status) {
    if (!selected) return;
    setAdminBusy(true);
    try {
      const res = await api.setProjectStatus(selected.name, status);
      setSelected(prev => prev ? { ...prev, admin: res.admin } : prev);
      await refetch();
    } finally {
      setAdminBusy(false);
    }
  }

  async function saveProjectNotes() {
    if (!selected) return;
    setAdminBusy(true);
    try {
      const res = await api.setProjectNotes(selected.name, adminNotes);
      setSelected(prev => prev ? { ...prev, admin: res.admin } : prev);
      await refetch();
    } finally {
      setAdminBusy(false);
    }
  }

  if (loading && !data) return <p className="text-slate-400 text-sm">Carregando…</p>;
  if (error) return <p className="text-rose-300">Erro: {error.message}</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Projetos ({data?.length || 0})</h2>
        <button type="button" className="btn" onClick={refetch}>Atualizar</button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_460px] gap-4">
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4 content-start">
        {data.map((p) => (
          <ProjectCard
            key={p.name}
            project={p}
            gates={system?.projects?.find(item => item.project === p.name)}
            selected={selected?.name === p.name}
            onOpen={() => openProject(p)}
          />
        ))}
        {data.length === 0 && (
          <p className="text-slate-500 col-span-full">Nenhum projeto em <code>projects/</code>.</p>
        )}
        </div>
        <ProjectDetail
          project={selected}
          gates={system?.projects?.find(item => item.project === selected?.name)}
          detail={detail}
          loading={detailLoading}
          error={detailError}
          adminBusy={adminBusy}
          adminNotes={adminNotes}
          onAdminNotesChange={setAdminNotes}
          onStatusChange={updateProjectStatus}
          onSaveNotes={saveProjectNotes}
        />
      </div>
    </div>
  );
}

function ProjectCard({ project, selected, onOpen, gates }) {
  return (
    <button type="button" className={`card space-y-2 text-left hover:bg-slate-900/30 ${selected ? 'border-accent' : ''}`} onClick={onOpen}>
      <div className="flex justify-between items-start">
        <h3 className="font-semibold text-base">{project.name}</h3>
        <div className="flex flex-col items-end gap-1">
          <Badge status={project.admin?.status === 'paused' ? 'review' : project.admin?.status === 'archived' ? 'archived' : 'approved'}>{project.admin?.status || 'active'}</Badge>
          <code className="text-[10px] text-slate-500">{project.path}</code>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <Stat label="Specs" value={project.specs_total} />
        <Stat label="Handoffs abertos" value={project.handoffs_open} />
        <Stat label="Memória" value={formatBytes(project.memory_bytes)} />
      </div>

      {gates && (
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div className="border border-border rounded p-2 bg-bg/50">
            <div className="text-slate-500 uppercase">Gates</div>
            <div className="text-slate-200 font-semibold">{gates.gatesOk}/{gates.gatesTotal}</div>
          </div>
          <div className="border border-border rounded p-2 bg-bg/50">
            <div className="text-slate-500 uppercase">Workflow</div>
            <div className="text-slate-200 font-semibold">{gates.workflow ? `${gates.workflow.progress}%` : '—'}</div>
          </div>
        </div>
      )}

      <div className="text-xs text-slate-400 border-t border-border pt-2">
        {project.last_commit ? (
          <>
            <div className="font-mono text-slate-300">{project.last_commit.hash}</div>
            <div className="truncate" title={project.last_commit.subject}>{project.last_commit.subject}</div>
            <div className="text-[10px] text-slate-500">{new Date(project.last_commit.iso).toLocaleString('pt-BR')}</div>
          </>
        ) : (
          <span className="text-slate-500 italic">sem git</span>
        )}
      </div>

      <details className="text-[10px] text-slate-500">
        <summary className="cursor-pointer">breakdown</summary>
        <div className="mt-1 flex gap-2">
          {Object.entries(project.handoffs_breakdown).map(([k, v]) => (
            <span key={k}>{k}:{v}</span>
          ))}
        </div>
      </details>
    </button>
  );
}

function ProjectDetail({ project, detail, loading, error, gates, adminBusy, adminNotes, onAdminNotesChange, onStatusChange, onSaveNotes }) {
  if (!project) {
    return <aside className="card text-sm text-slate-500">Selecione um projeto para ver execução, specs, handoffs e consumo.</aside>;
  }
  const tokenTotal = totalTokens(detail?.tokens);
  const activeHandoffs = (detail?.handoffs || []).filter(h => !['done', 'cancelled', 'archived'].includes(h.status));
  const archivedHandoffs = (detail?.handoffs || []).filter(h => h.status === 'archived');
  return (
    <aside className="card space-y-4 xl:sticky xl:top-6 self-start max-h-[calc(100vh-3rem)] overflow-auto">
      <div>
        <h3 className="font-semibold text-lg">{project.name}</h3>
        <code className="text-xs text-slate-500">{project.path}</code>
      </div>
      {loading && <p className="text-sm text-slate-400">Carregando detalhes…</p>}
      {error && <p className="text-sm text-rose-300">{error}</p>}
      {!loading && !error && (
        <>
          <Section title="Admin do projeto">
            <div className="flex flex-wrap gap-2">
              <Badge status={project.admin?.status === 'paused' ? 'review' : project.admin?.status === 'archived' ? 'archived' : 'approved'}>
                {project.admin?.status || 'active'}
              </Badge>
              <button type="button" className="btn" disabled={adminBusy} onClick={() => onStatusChange('active')}>Ativar</button>
              <button type="button" className="btn" disabled={adminBusy} onClick={() => onStatusChange('paused')}>Pausar</button>
              <button type="button" className="btn" disabled={adminBusy} onClick={() => onStatusChange('archived')}>Arquivar</button>
            </div>
            <div className="space-y-2">
              <textarea
                className="input min-h-24"
                value={adminNotes}
                onChange={event => onAdminNotesChange(event.target.value)}
                placeholder="Notas administrativas: bloqueios, prioridade, risco, instruções de coordenação..."
              />
              <button type="button" className="btn btn-primary" disabled={adminBusy} onClick={onSaveNotes}>
                {adminBusy ? 'Salvando...' : 'Salvar notas'}
              </button>
            </div>
          </Section>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <Stat label="Specs" value={detail?.specs?.length || 0} />
            <Stat label="Handoffs ativos" value={activeHandoffs.length} />
            <Stat label="Arquivados" value={archivedHandoffs.length} />
            <Stat label="Tokens 30d" value={tokenTotal ? tokenTotal.toLocaleString('pt-BR') : '—'} />
          </div>

          {gates && (
            <Section title="Gates do projeto">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Stat label="Gate OK" value={`${gates.gatesOk}/${gates.gatesTotal}`} />
                <Stat label="Progress" value={gates.workflow ? `${gates.workflow.progress}%` : '—'} />
              </div>
              <div className="space-y-1">
                {gates.gates.map(gate => (
                  <div key={gate.label} className={`border rounded p-2 ${gate.ok ? 'border-emerald-900 bg-emerald-950/30' : 'border-neutral-800 bg-bg/50'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium">{gate.label}</span>
                      <Badge status={gate.ok ? 'approved' : 'blocked'}>{gate.ok ? 'ok' : 'faltando'}</Badge>
                    </div>
                    <code className="text-[10px] text-slate-500 break-all">{gate.path}</code>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section title="Execução atual">
            {detail?.workflow ? (
              <div className="space-y-2">
                {orderedSteps(detail.workflow).map(step => (
                  <div key={step.id} className="border border-border rounded p-2 bg-bg/60">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium">#{step.order} {step.title}</span>
                      <Badge status={step.status}>{step.status}</Badge>
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono mt-1">{step.id} · {step.role}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">Sem workflow iniciado para este projeto.</p>
            )}
          </Section>

          <Section title="Specs vinculadas">
            {(detail?.specs || []).length ? (
              <div className="space-y-1">
                {detail.specs.map(spec => (
                  <div key={spec.slug} className="flex items-center justify-between gap-2 text-xs border border-border rounded p-2">
                    <span className="font-mono text-accent truncate">{spec.slug}</span>
                    <Badge status={spec.status}>{spec.status}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">Nenhuma spec com prefixo do projeto.</p>
            )}
          </Section>

          <Section title="Handoffs ativos">
            {activeHandoffs.length ? (
              <div className="space-y-1">
                {activeHandoffs.slice(0, 8).map(h => (
                  <div key={h.id} className="text-xs border border-border rounded p-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-accent">#{h.id}</span>
                      <Badge status={h.status}>{h.status}</Badge>
                    </div>
                    <div className="text-slate-400">{h.from_agent} → {h.to_agent}</div>
                    <div className="text-slate-500 truncate" title={h.acceptance}>{h.acceptance}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">Nenhum handoff ativo.</p>
            )}
          </Section>

          <Section title="Arquivos e consumo">
            <div className="space-y-1 text-xs text-slate-400">
              <div>Memória: {formatBytes(project.memory_bytes)}</div>
              <div>Último commit: {project.last_commit ? `${project.last_commit.hash} · ${project.last_commit.subject}` : 'sem git'}</div>
              <div>Tokens é observabilidade de consumo, não etapa do processo.</div>
              {project.admin?.updatedAt && <div>Admin atualizado em: {new Date(project.admin.updatedAt).toLocaleString('pt-BR')}</div>}
            </div>
          </Section>
        </>
      )}
    </aside>
  );
}

function Section({ title, children }) {
  return (
    <section className="space-y-2">
      <h4 className="text-xs uppercase text-slate-500 font-semibold">{title}</h4>
      {children}
    </section>
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

function formatBytes(b) {
  if (!b) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function belongsToProject(slug, projectName) {
  if (!slug) return false;
  return slug === projectName || slug.startsWith(`${projectName}-`);
}

function orderedSteps(workflow) {
  return [...(workflow.kanban || [])].sort((a, b) => (a.order || 999) - (b.order || 999));
}

function totalTokens(tokens) {
  if (!tokens?.series) return 0;
  return tokens.series.reduce((sum, point) => sum + (point.tokens_in || 0) + (point.tokens_out || 0), 0);
}
