import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { usePolling } from '../lib/usePolling.js';
import { subscribe as subscribeEvents } from '../lib/useEvents.js';
import Badge from '../components/Badge.jsx';
import Drawer from '../components/Drawer.jsx';

const STATUS_FLOW = ['draft', 'review', 'approved', 'implementing', 'done'];
const STATUS_OPTIONS = [...STATUS_FLOW, 'abandoned'];
const STAGES = ['spec', 'plan', 'tasks'];
const STATUS_LABEL = {
  draft: 'Marcar rascunho',
  review: 'Enviar para review',
  approved: 'Aprovar',
  implementing: 'Marcar implementacao',
  done: 'Concluir',
  abandoned: 'Abandonar',
};

export default function Specs() {
  const { data, error, loading, refetch } = usePolling(
    api.specs,
    30000,
    ['spec.created', 'spec.status_changed'],
  );
  const [openSlug, setOpenSlug] = useState(null);
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState('spec');
  const [pending, setPending] = useState(null);

  const loadDetail = useCallback(async (slug) => {
    setDetail(null);
    try { setDetail(await api.spec(slug)); }
    catch (err) { setDetail({ error: err.message }); }
  }, []);

  async function openDetail(slug) {
    setOpenSlug(slug);
    setTab('spec');
    await loadDetail(slug);
  }

  useEffect(() => {
    if (!openSlug) return undefined;
    return subscribeEvents(['spec.status_changed'], ({ payload }) => {
      if (payload?.slug === openSlug) loadDetail(openSlug);
    });
  }, [loadDetail, openSlug]);

  async function setStatus(slug, stage, status) {
    const key = `${slug}:${stage}:${status}`;
    setPending(key);
    try {
      await api.setSpecStatus(slug, stage, status);
      await refetch();
      if (openSlug === slug) await loadDetail(slug);
    } catch (err) {
      alert(`Falhou: ${err.detail?.error || err.message}`);
    } finally {
      setPending(null);
    }
  }

  async function generateStage(slug, stage) {
    const key = `${slug}:generate:${stage}`;
    setPending(key);
    try {
      await api.generateSpecStage(slug, stage);
      await refetch();
      if (openSlug === slug) {
        await loadDetail(slug);
        setTab(stage);
      }
    } catch (err) {
      alert(`Falhou: ${err.detail?.error || err.message}`);
    } finally {
      setPending(null);
    }
  }

  if (loading && !data) return <p className="text-slate-400 text-sm">Carregando…</p>;
  if (error) return <ErrorBlock error={error} onRetry={refetch} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Specs ({data?.length || 0})</h2>
        <button type="button" className="btn" onClick={refetch}>Atualizar</button>
      </div>

      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/60 text-left text-xs uppercase text-slate-400">
            <tr>
              <th className="px-4 py-2">Slug</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">ID</th>
              <th className="px-4 py-2">Owner</th>
              <th className="px-4 py-2">Sprint</th>
              <th className="px-4 py-2">Plan</th>
              <th className="px-4 py-2">Tasks</th>
              <th className="px-4 py-2">Ações</th>
            </tr>
          </thead>
          <tbody>
            {data.map((s) => (
              <tr
                key={s.slug}
                className="border-t border-border hover:bg-slate-900/40 cursor-pointer"
                onClick={() => openDetail(s.slug)}
              >
                <td className="px-4 py-2 font-mono text-accent">{s.slug}</td>
                <td className="px-4 py-2"><Badge status={s.status} /></td>
                <td className="px-4 py-2 text-slate-400">{s.id || '—'}</td>
                <td className="px-4 py-2 text-slate-400">{s.owner || '—'}</td>
                <td className="px-4 py-2 text-slate-400">{s.sprint || '—'}</td>
                <td className="px-4 py-2">{s.hasplan ? '✓' : '—'}</td>
                <td className="px-4 py-2">{s.hastasks ? '✓' : '—'}</td>
                <td className="px-4 py-2" onClick={(event) => event.stopPropagation()}>
                  <StatusQuickActions
                    slug={s.slug}
                    stage="spec"
                    current={s.status}
                    hasPlan={s.hasplan}
                    hasTasks={s.hastasks}
                    pending={pending}
                    onSetStatus={setStatus}
                    onGenerateStage={generateStage}
                  />
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr><td className="px-4 py-6 text-center text-slate-500" colSpan={8}>Nenhuma spec ainda. Use o Briefing ou <code className="text-accent">npm run spec:new</code>.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Drawer open={!!openSlug} onClose={() => setOpenSlug(null)} title={openSlug}>
        {detail && !detail.error && (
          <div className="card mb-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-300">Acoes da spec</h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!!detail.plan || !!pending}
                onClick={() => generateStage(openSlug, 'plan')}
                title="Cria specs/<slug>/plan.md quando spec.md estiver approved"
              >
                {pending === `${openSlug}:generate:plan` ? 'Gerando...' : detail.plan ? 'plan.md criado' : 'Gerar plan.md'}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!detail.plan || !!detail.tasks || !!pending}
                onClick={() => generateStage(openSlug, 'tasks')}
                title="Cria specs/<slug>/tasks.md quando plan.md estiver approved"
              >
                {pending === `${openSlug}:generate:tasks` ? 'Gerando...' : detail.tasks ? 'tasks.md criado' : 'Gerar tasks.md'}
              </button>
            </div>
            <h3 className="text-sm font-semibold text-slate-300">Status por arquivo</h3>
            {STAGES.map(stage => (
              <StageStatusRow
                key={stage}
                slug={openSlug}
                stage={stage}
                content={detail[stage]}
                pending={pending}
                onSetStatus={setStatus}
              />
            ))}
          </div>
        )}

        <div className="flex gap-2 mb-4">
          {['spec', 'plan', 'tasks'].map(t => (
            <button
              key={t}
              type="button"
              className={`btn ${tab === t ? 'btn-primary' : ''}`}
              onClick={() => setTab(t)}
              disabled={detail && detail[t] === null}
            >
              {t}{detail && detail[t] === null ? ' (—)' : ''}
            </button>
          ))}
        </div>
        {!detail && <p className="text-slate-400 text-sm">Carregando…</p>}
        {detail?.error && <p className="text-rose-400">{detail.error}</p>}
        {detail && detail[tab] && (
          <pre className="card whitespace-pre-wrap font-mono text-xs leading-relaxed">{detail[tab]}</pre>
        )}
      </Drawer>
    </div>
  );
}

function StatusQuickActions({ slug, stage, current, hasPlan, hasTasks, pending, onSetStatus, onGenerateStage }) {
  const next = nextStatus(current);
  const abandonKey = `${slug}:${stage}:abandoned`;
  const nextKey = next ? `${slug}:${stage}:${next}` : null;
  return (
    <div className="flex flex-wrap gap-1">
      {!hasPlan && (
        <button
          type="button"
          className="btn btn-primary whitespace-nowrap"
          disabled={!!pending || !['approved', 'implementing', 'done'].includes(current)}
          onClick={() => onGenerateStage(slug, 'plan')}
          title="Cria specs/<slug>/plan.md. Exige spec aprovada."
        >
          {pending === `${slug}:generate:plan` ? 'Gerando...' : 'Gerar plan'}
        </button>
      )}
      {hasPlan && !hasTasks && (
        <button
          type="button"
          className="btn btn-primary whitespace-nowrap"
          disabled={!!pending}
          onClick={() => onGenerateStage(slug, 'tasks')}
          title="Cria specs/<slug>/tasks.md. Exige plan aprovado."
        >
          {pending === `${slug}:generate:tasks` ? 'Gerando...' : 'Gerar tasks'}
        </button>
      )}
      {next && (
        <button
          type="button"
          className="btn whitespace-nowrap"
          disabled={!!pending}
          onClick={() => onSetStatus(slug, stage, next)}
          title={`spec-cli set-status ${slug} ${stage} ${next}`}
        >
          {pending === nextKey ? '...' : STATUS_LABEL[next] || `Marcar ${next}`}
        </button>
      )}
      {current !== 'abandoned' && current !== 'done' && (
        <button
          type="button"
          className="btn whitespace-nowrap"
          disabled={!!pending}
          onClick={() => onSetStatus(slug, stage, 'abandoned')}
          title={`spec-cli set-status ${slug} ${stage} abandoned`}
        >
          {pending === abandonKey ? '...' : 'Abandonar'}
        </button>
      )}
    </div>
  );
}

function StageStatusRow({ slug, stage, content, pending, onSetStatus }) {
  const current = statusFromContent(content);
  return (
    <div className="grid grid-cols-[56px_92px_1fr] items-center gap-2 text-xs">
      <span className="font-mono text-slate-400">{stage}</span>
      {content ? <Badge status={current} /> : <span className="text-slate-500">sem arquivo</span>}
      <div className="flex flex-wrap gap-1">
        {STATUS_OPTIONS.map(status => {
          const key = `${slug}:${stage}:${status}`;
          return (
            <button
              key={status}
              type="button"
              className={`btn px-2 py-1 text-xs ${status === current ? 'btn-primary' : ''}`}
              disabled={!content || !!pending || status === current}
              onClick={() => onSetStatus(slug, stage, status)}
              title={`spec-cli set-status ${slug} ${stage} ${status}`}
            >
              {pending === key ? '...' : STATUS_LABEL[status] || status}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function nextStatus(current) {
  const index = STATUS_FLOW.indexOf(current);
  if (index < 0 || index === STATUS_FLOW.length - 1) return null;
  return STATUS_FLOW[index + 1];
}

function statusFromContent(content) {
  if (!content) return 'unknown';
  const match = content.match(/-\s*\*\*Status\*\*:\s*([a-z]+)/i);
  return match ? match[1].toLowerCase() : 'unknown';
}

function ErrorBlock({ error, onRetry }) {
  return (
    <div className="card border-rose-700">
      <p className="text-rose-300">Erro: {error.message}</p>
      <button type="button" className="btn mt-2" onClick={onRetry}>Tentar de novo</button>
    </div>
  );
}
