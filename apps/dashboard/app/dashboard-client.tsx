'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ApprovalRequest, ControlPlaneMetrics, GraphNode, Observation } from '../../../packages/contracts/src/index.ts';

const api = '/api/forja';

/* ── Contratos ─────────────────────────────────────────────────────────────
   Cada aba lê um contrato `--json` que já existe no CLI (ADR-0082). Nada aqui
   inventa campo: o que o script escreve no stdout é o que estas interfaces
   descrevem, e o painel só alcança capacidades que o servidor declara como
   leitura sem efeito colateral (app/api/forja/capabilities.ts).               */

type Sub<T> = { readonly available: true; readonly value: T } | { readonly available: false; readonly reason: string };
type Where = { readonly file: string; readonly line: number };

interface StatusPayload {
  readonly workspace: { readonly root: string; readonly source: string; readonly exists: boolean; readonly memoryIndexed: boolean };
  readonly sprint: Sub<{ readonly active: boolean; readonly title: string; readonly items: number; readonly done: number } | null>;
  readonly orchestrate: Sub<{ readonly runs: readonly { slug: string; goal: string; openStage: string | null; openVerdict: string | null; concluded: boolean }[] }>;
  readonly specs: Sub<readonly { slug: string; status: string; plan: string; tasks: string }[]>;
  readonly recentRuns: Sub<readonly { cmd: string; exitCode: number; ts: string }[]>;
  readonly handoffs: Sub<readonly { id: number; from: string; to: string; intent: string; slug: string }[]>;
}

interface NextPayload { readonly action: string; readonly command: string; readonly reason: string }

interface TracePayload {
  readonly totals: { readonly specs: number; readonly criteria: number; readonly covered: number; readonly testFiles: number };
  readonly specs: readonly {
    slug: string;
    specId: string | null;
    status: string;
    criteria: readonly { id: string; text: string; tests: readonly Where[] }[];
    uncovered: readonly string[];
    orphans: readonly { ac: string; ref: Where }[];
  }[];
  readonly ambiguous: readonly { ac: string; ref: Where; reason: string }[];
}

/** Sentinela que `scripts/cost-economy.ts` usa para observação sem `model` — não é um modelo real. */
const NO_MODEL = '(sem modelo)';

interface CostPayload {
  readonly workspace: string;
  readonly currency: string;
  readonly totalCostUsd: number;
  readonly observationCount: number;
  readonly unknownPricingCount: number;
  readonly byModel: Readonly<Record<string, { count: number; inputTokens: number; outputTokens: number; costUsd: number; priceKnown: boolean }>>;
}

interface DoctorPayload {
  readonly verdict: 'ok' | 'warn' | 'fail';
  readonly core: readonly { id: string; status: string; severity: string | null; detail: string | null; fix: string | null }[];
  readonly project?: { readonly status: string; readonly checks: readonly { id: string; status: string; detail: string }[] };
  readonly tools: readonly { name: string; role: string; gate: string; install: string; ok: boolean; version: string | null }[];
  readonly toolsAvailable: number;
  readonly toolsTotal: number;
}

interface Snapshot {
  readonly metrics: ControlPlaneMetrics;
  readonly observations: readonly Observation[];
  readonly graphNodes: readonly GraphNode[];
  readonly approvals: readonly ApprovalRequest[];
}

type TabId = 'visao' | 'rastreio' | 'custo' | 'gates' | 'operacao';

const TABS: readonly { id: TabId; label: string }[] = [
  { id: 'visao', label: 'Visão' },
  { id: 'rastreio', label: 'Rastreio' },
  { id: 'custo', label: 'Custo' },
  { id: 'gates', label: 'Gates' },
  { id: 'operacao', label: 'Operação' },
];

type Access = { readonly state: 'checking' } | { readonly state: 'open' } | { readonly state: 'locked' } | { readonly state: 'unreachable'; readonly message: string };

export default function DashboardClient() {
  const [access, setAccess] = useState<Access>({ state: 'checking' });

  useEffect(() => {
    let alive = true;
    void probeAccess().then((next) => { if (alive) setAccess(next); });
    return () => { alive = false; };
  }, []);

  if (access.state !== 'open') return <AccessScreen access={access} onChange={setAccess} />;
  return <Panel onDisconnect={() => { document.cookie = 'forja_dashboard_token=; path=/; max-age=0'; setAccess({ state: 'locked' }); }} />;
}

/**
 * O proxy falha fechado: sem o token no cookie, toda requisição é 403. Antes esse estado aparecia
 * como cinco banners de erro sem nenhuma forma de resolver pela tela; agora é um portão explícito,
 * e "servidor fora do ar" se distingue de "credencial recusada".
 */
async function probeAccess(): Promise<Access> {
  try {
    const response = await fetch(`${api}/control-plane/metrics`, { cache: 'no-store' });
    if (response.status === 403) return { state: 'locked' };
    if (response.ok) return { state: 'open' };
    return { state: 'unreachable', message: await failureOf(response, `O servidor respondeu HTTP ${response.status}.`) };
  } catch (reason: unknown) {
    return { state: 'unreachable', message: reason instanceof Error ? reason.message : 'Não foi possível alcançar o servidor.' };
  }
}

function AccessScreen({ access, onChange }: Readonly<{ access: Access; onChange: (next: Access) => void }>) {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function connect(): Promise<void> {
    setBusy(true);
    setError(undefined);
    document.cookie = `forja_dashboard_token=${encodeURIComponent(token.trim())}; path=/; max-age=86400; samesite=lax`;
    const next = await probeAccess();
    setBusy(false);
    if (next.state === 'open') { onChange(next); return; }
    document.cookie = 'forja_dashboard_token=; path=/; max-age=0';
    setError(next.state === 'unreachable' ? next.message : 'Token recusado. Confira o FORJA_DASHBOARD_TOKEN com que o painel foi iniciado.');
  }

  return <div className="access">
    <div className="access__inner">
      <div className="brand">
        <span className="brand__mark" aria-hidden="true">F</span>
        <span className="brand__text">
          <span className="brand__title">Forja Control Plane</span>
          <span className="brand__sub">autonomia supervisionada</span>
        </span>
      </div>

      {access.state === 'checking' && <article className="card"><Skeleton lines={3} /></article>}

      {access.state === 'unreachable' && <article className="card">
        <Head title="Servidor indisponível" hint="o painel não conseguiu falar com a API" />
        <div className="banner"><span className="dot dot--crit" /><span>{access.message}</span></div>
        <p className="card__hint">Suba a API com <code>npm run dashboard:api</code> e confira <code>FORJA_API_URL</code>. O painel roda em <code>:3001</code> e a API em <code>:3000</code>.</p>
        <div className="inline">
          <button className="btn btn--primary" disabled={busy} onClick={() => { setBusy(true); void probeAccess().then((next) => { setBusy(false); onChange(next); }); }}>{busy ? 'Tentando…' : 'Tentar de novo'}</button>
        </div>
      </article>}

      {access.state === 'locked' && <form className="card" onSubmit={(event) => { event.preventDefault(); void connect(); }}>
        <Head title="Conectar ao servidor" hint="credencial local do painel" />
        <p className="card__hint">O proxy só encaminha requisições autenticadas. Informe o <code>FORJA_DASHBOARD_TOKEN</code> com que o painel foi iniciado — ele guarda um cookie de sessão neste navegador.</p>
        <input
          className="field"
          type="password"
          aria-label="Token do painel"
          placeholder="FORJA_DASHBOARD_TOKEN"
          autoComplete="off"
          value={token}
          onChange={(event) => setToken(event.target.value)}
        />
        {error !== undefined && <div className="banner" role="alert"><span className="dot dot--crit" /><span>{error}</span></div>}
        <div className="inline">
          <button className="btn btn--primary" type="submit" disabled={busy || token.trim().length === 0}>{busy ? 'Verificando…' : 'Conectar'}</button>
        </div>
      </form>}
    </div>
  </div>;
}

function Panel({ onDisconnect }: Readonly<{ onDisconnect: () => void }>) {
  const [tab, setTab] = useState<TabId>('visao');
  return <>
    <Topbar onDisconnect={onDisconnect} />
    <nav className="tabs" role="tablist" aria-label="Seções do painel">
      {TABS.map((entry) => <button key={entry.id} role="tab" className="tab" aria-selected={tab === entry.id} onClick={() => setTab(entry.id)}>{entry.label}</button>)}
    </nav>
    {tab === 'visao' && <VisaoTab />}
    {tab === 'rastreio' && <RastreioTab />}
    {tab === 'custo' && <CustoTab />}
    {tab === 'gates' && <GatesTab />}
    {tab === 'operacao' && <OperacaoTab />}
  </>;
}

/* ── Topo ──────────────────────────────────────────────────────────────── */

function Topbar({ onDisconnect }: Readonly<{ onDisconnect: () => void }>) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const source = new EventSource(`${api}/events`);
    // O Nest emite `event: observation.recorded`; `onmessage` só pega eventos sem nome, então os
    // dois caminhos são necessários para o painel reagir a uma execução registrada.
    const refresh = () => { setLive(true); void queryClient.invalidateQueries(); };
    source.onopen = () => setLive(true);
    source.onmessage = refresh;
    source.addEventListener('observation.recorded', refresh);
    // Não fecha no erro: o EventSource reconecta sozinho e `onopen` reacende o indicador.
    source.onerror = () => setLive(false);
    return () => source.close();
  }, [queryClient]);

  return <header className="topbar">
    <div className="brand">
      <span className="brand__mark" aria-hidden="true">F</span>
      <span className="brand__text">
        <span className="brand__title">Forja Control Plane</span>
        <span className="brand__sub">autonomia supervisionada</span>
      </span>
    </div>
    <div className="topbar__actions">
      <span className={`pill ${live ? 'pill--live' : ''}`}>
        <span className={`dot ${live ? 'dot--live' : ''}`} />
        {live ? 'tempo real' : 'sem stream'}
      </span>
      <button
        className="btn btn--primary"
        disabled={busy}
        onClick={() => { setBusy(true); void queryClient.invalidateQueries().finally(() => setBusy(false)); }}
      >{busy ? 'Atualizando…' : 'Atualizar'}</button>
      <button className="btn btn--ghost" onClick={onDisconnect}>Sair</button>
    </div>
  </header>;
}

/* ── Aba: Visão ────────────────────────────────────────────────────────── */

function VisaoTab() {
  const status = useQuery({ queryKey: ['capability', 'forja.status'], queryFn: () => capability<StatusPayload>('forja.status') });
  const next = useQuery({ queryKey: ['capability', 'forja.next'], queryFn: () => capability<NextPayload>('forja.next') });
  const data = status.data;
  const sprint = sub(data?.sprint);
  const specs = sub(data?.specs) ?? [];
  const runs = sub(data?.orchestrate)?.runs ?? [];
  const handoffs = sub(data?.handoffs) ?? [];
  const recent = sub(data?.recentRuns) ?? [];

  return <Section title="Visão" hint={data === undefined ? 'retrato único do estado (forja status)' : data.workspace.root}>
    <Failure error={status.error} />
    <div className="grid grid--metrics">
      <Metric label="Memória" value={data?.workspace.memoryIndexed === true ? 'indexada' : 'ausente'} hint={`${data?.workspace.source ?? '—'} · ${data?.workspace.exists === true ? 'workspace existe' : 'sem workspace'}`} accent={data?.workspace.memoryIndexed === true} loading={status.isPending} />
      <Metric label="Sprint" value={sprint === undefined || sprint === null ? '—' : `${sprint.done}/${sprint.items}`} hint={sprint?.title ?? reasonOf(data?.sprint) ?? 'sem sprint'} loading={status.isPending} />
      <Metric label="Specs" value={specs.length} hint={`${specs.filter((spec) => spec.status === 'done').length} concluídas`} loading={status.isPending} />
      <Metric label="Corridas" value={runs.length} hint={`${runs.filter((run) => !run.concluded).length} abertas`} loading={status.isPending} />
    </div>

    <div className="grid grid--split">
      <div className="grid">
        <article className="card">
          <Head title="Próxima ação" hint="forja.next">
            {next.data !== undefined && <span className="pill pill--info">{next.data.action}</span>}
          </Head>
          {next.isPending && <Skeleton lines={2} />}
          <Failure error={next.error} />
          {next.data !== undefined && <>
            <p className="card__hint">{next.data.reason}</p>
            <Cmd value={next.data.command} />
          </>}
        </article>

        <article className="card">
          <Head title="Corridas" hint="orchestrate" />
          {runs.length === 0 && <Empty text="Nenhuma corrida registrada." detail="Abra uma com forja orchestrate:start <slug>." />}
          <div className="rows">
            {runs.map((run) => <Row
              key={run.slug}
              title={run.slug}
              meta={run.goal}
              dot={run.concluded ? 'ok' : run.openVerdict === null ? 'info' : 'warn'}
              aside={<span className={`pill ${run.concluded ? 'pill--ok' : 'pill--info'}`}>{run.concluded ? 'concluída' : run.openStage ?? 'aberta'}</span>}
            />)}
          </div>
        </article>
      </div>

      <div className="grid">
        <article className="card">
          <Head title="Handoffs abertos" hint={`${handoffs.length} no workspace`} />
          {handoffs.length === 0 && <Empty text="Nenhum handoff aberto." />}
          <div className="rows">
            {handoffs.slice(0, 6).map((handoff) => <Row
              key={handoff.id}
              title={`#${handoff.id} · ${handoff.from} → ${handoff.to}`}
              meta={handoff.intent}
              aside={<span className="pill">{handoff.slug === '' ? 'sem slug' : handoff.slug}</span>}
            />)}
          </div>
        </article>

        <article className="card">
          <Head title="Execuções recentes" hint="auditoria append-only" />
          {recent.length === 0 && <Empty text="Nenhuma execução registrada neste workspace." />}
          <div className="rows">
            {recent.slice(0, 6).map((run, index) => <Row
              key={`${run.ts}-${index}`}
              title={run.cmd}
              meta={new Date(run.ts).toLocaleString('pt-BR')}
              dot={run.exitCode === 0 ? 'ok' : 'crit'}
              aside={<span className={`pill ${run.exitCode === 0 ? 'pill--ok' : 'pill--crit'}`}>exit {run.exitCode}</span>}
            />)}
          </div>
        </article>

        <article className="card">
          <Head title="Specs" hint="estado por artefato" />
          {specs.length === 0 && <Empty text="Nenhuma spec em specs/." />}
          <div className="rows">
            {specs.slice(0, 6).map((spec) => <Row
              key={spec.slug}
              title={spec.slug}
              meta={`plan ${spec.plan} · tasks ${spec.tasks}`}
              aside={<span className={`pill ${pillOfStatus(spec.status)}`}>{spec.status}</span>}
            />)}
          </div>
        </article>
      </div>
    </div>
  </Section>;
}

/* ── Aba: Rastreio ─────────────────────────────────────────────────────── */

function RastreioTab() {
  const [filter, setFilter] = useState('');
  const trace = useQuery({ queryKey: ['capability', 'spec.trace'], queryFn: () => capability<TracePayload>('spec.trace') });
  const totals = trace.data?.totals;
  const ratio = totals === undefined || totals.criteria === 0 ? 0 : totals.covered / totals.criteria;
  const needle = filter.trim().toLowerCase();
  const specs = (trace.data?.specs ?? []).filter((spec) => needle.length === 0 || spec.slug.toLowerCase().includes(needle) || (spec.specId ?? '').toLowerCase().includes(needle));

  return <Section title="Rastreio" hint="critérios de aceite × testes que os citam (SPEC-053)">
    <Failure error={trace.error} />
    <div className="grid grid--metrics">
      <Metric label="Cobertura" value={`${Math.round(ratio * 100)}%`} hint={`${totals?.covered ?? 0} de ${totals?.criteria ?? 0} critérios`} accent={ratio >= 0.8} loading={trace.isPending} />
      <Metric label="Specs com AC" value={totals?.specs ?? 0} hint="declaram critérios AC-N" loading={trace.isPending} />
      <Metric label="Arquivos de teste" value={totals?.testFiles ?? 0} hint="lidos na varredura" loading={trace.isPending} />
      <Metric label="Citações ambíguas" value={trace.data?.ambiguous.length ?? 0} hint="AC-N sem spec identificável" loading={trace.isPending} />
    </div>

    <article className="card">
      <Head title="Por spec" hint={`${specs.length} listadas`}>
        <input className="field" aria-label="Filtrar por slug ou SPEC-NNN" placeholder="filtrar por slug ou SPEC-NNN…" value={filter} onChange={(event) => setFilter(event.target.value)} />
      </Head>
      {trace.isPending && <Skeleton lines={5} />}
      {trace.data !== undefined && specs.length === 0 && <Empty text="Nenhuma spec corresponde ao filtro." />}
      <div className="rows">
        {specs.map((spec) => {
          const covered = spec.criteria.length - spec.uncovered.length;
          const clean = spec.uncovered.length === 0 && spec.orphans.length === 0;
          return <div className="row row--stack" key={spec.slug}>
            <div className="row__line">
              <span className={`dot ${clean ? 'dot--ok' : covered === 0 ? 'dot--crit' : 'dot--warn'}`} />
              <span className="row__main">
                <span className="row__title">{spec.specId ?? '—'} · {spec.slug}</span>
                <span className="row__meta">
                  {covered}/{spec.criteria.length} critérios com teste
                  {spec.uncovered.length > 0 && ` · sem teste: ${spec.uncovered.slice(0, 6).join(', ')}${spec.uncovered.length > 6 ? '…' : ''}`}
                  {spec.orphans.length > 0 && ` · ${spec.orphans.length} órfã(s)`}
                </span>
              </span>
              <span className="row__aside"><span className={`pill ${pillOfStatus(spec.status)}`}>{spec.status}</span></span>
            </div>
            <Gauge value={spec.criteria.length === 0 ? 0 : covered / spec.criteria.length} tone={clean ? 'ok' : covered === 0 ? 'crit' : 'warn'} />
          </div>;
        })}
      </div>
    </article>
  </Section>;
}

/* ── Aba: Custo ────────────────────────────────────────────────────────── */

function CustoTab() {
  const cost = useQuery({ queryKey: ['capability', 'cost.economy'], queryFn: () => capability<CostPayload>('cost.economy') });
  const models = Object.entries(cost.data?.byModel ?? {}).sort((left, right) => right[1].costUsd - left[1].costUsd);
  const peak = models.reduce((max, [, entry]) => Math.max(max, entry.costUsd), 0);
  // `cost:economy` agrega toda observação, inclusive execução de capacidade sem modelo/tokens. Um
  // gráfico de barras zerado pareceria quebrado; ele só aparece quando há uso de modelo de fato.
  const hasUsage = models.some(([, entry]) => entry.costUsd > 0 || entry.inputTokens + entry.outputTokens > 0);
  const namedModels = models.filter(([model]) => model !== NO_MODEL).length;

  return <Section title="Custo" hint={cost.data === undefined ? 'custo real acumulado das execuções LLM (SPEC-029)' : `${cost.data.workspace} · ${cost.data.currency}`}>
    <Failure error={cost.error} />
    <div className="grid grid--metrics">
      <Metric label="Custo acumulado" value={cost.data === undefined ? '—' : `$${cost.data.totalCostUsd.toFixed(4)}`} hint="tabela de preço local" accent loading={cost.isPending} />
      <Metric label="Observações" value={cost.data?.observationCount ?? 0} hint="registradas no workspace" loading={cost.isPending} />
      <Metric label="Modelos" value={namedModels} hint="com uso identificado" loading={cost.isPending} />
      <Metric label="Sem preço" value={cost.data?.unknownPricingCount ?? 0} hint="observações fora da tabela" loading={cost.isPending} />
    </div>

    <article className="card">
      <Head title="Por modelo" hint="custo em USD, maior primeiro" />
      {cost.isPending && <Skeleton lines={3} />}
      {cost.data !== undefined && models.length === 0 && <Empty text="Nenhuma execução LLM registrada neste workspace." detail="Rode forja llm:run para gerar observações com custo." />}
      {cost.data !== undefined && models.length > 0 && !hasUsage && <Empty
        text="Nenhuma observação traz modelo ou tokens."
        detail={`As ${cost.data.observationCount} observações deste workspace são execuções de capacidade, não chamadas LLM — por isso o custo é $0. Rode forja llm:run para registrar uso real.`}
      />}
      {hasUsage && <div className="bars" role="img" aria-label="Custo por modelo">
        {models.map(([model, entry]) => <div className="bars__col" key={model}>
          <div className="bars__fill" style={{ height: `${Math.max(2, (entry.costUsd / peak) * 100)}%` }} />
          <span className="bars__label">{model}</span>
        </div>)}
      </div>}
      {models.length > 0 && <div className="rows">
        {models.map(([model, entry]) => <Row
          key={model}
          title={model}
          meta={`${entry.inputTokens.toLocaleString('pt-BR')} tokens de entrada · ${entry.outputTokens.toLocaleString('pt-BR')} de saída · ${entry.count} observação(ões)`}
          dot={entry.priceKnown ? 'ok' : 'warn'}
          aside={<span className={`pill ${entry.priceKnown ? '' : 'pill--warn'}`}>${entry.costUsd.toFixed(4)}</span>}
        />)}
      </div>}
    </article>
  </Section>;
}

/* ── Aba: Gates ────────────────────────────────────────────────────────── */

function GatesTab() {
  const doctor = useQuery({ queryKey: ['capability', 'system.doctor'], queryFn: () => capability<DoctorPayload>('system.doctor') });
  const core = doctor.data?.core ?? [];
  const flagged = core.filter((check) => check.status === 'fail' || check.status === 'warn');
  const healthy = core.filter((check) => check.status === 'ok' || check.status === 'skipped');

  return <Section title="Gates" hint="raio-x do núcleo (SPEC-009) e ferramentas de processo (ADR-0018)">
    <Failure error={doctor.error} />
    {doctor.error !== null && doctor.error !== undefined && <div className="banner">
      <span className="dot dot--crit" />
      <span>Com o núcleo reprovado o comando sai em erro e o detalhe dos checks não chega pela API. Rode <code>forja tools:doctor</code> no terminal para ver as falhas críticas.</span>
    </div>}
    <div className="grid grid--metrics">
      <Metric label="Veredito" value={doctor.data?.verdict ?? '—'} hint="decidido só pelo núcleo" accent={doctor.data?.verdict === 'ok'} loading={doctor.isPending} />
      <Metric label="Ressalvas" value={flagged.length} hint="checks em aviso ou falha" loading={doctor.isPending} />
      <Metric label="Ferramentas" value={doctor.data === undefined ? '—' : `${doctor.data.toolsAvailable}/${doctor.data.toolsTotal}`} hint="ausentes nunca travam" loading={doctor.isPending} />
      <Metric label="Checks" value={core.length} hint="catálogo do núcleo" loading={doctor.isPending} />
    </div>

    <div className="grid grid--cards">
      <article className="card">
        <Head title="Núcleo" hint="o que impede o framework de trabalhar" />
        {doctor.isPending && <Skeleton lines={4} />}
        {doctor.data !== undefined && flagged.length === 0 && <Empty text="Nenhuma ressalva no núcleo." />}
        <div className="rows">
          {flagged.map((check) => <Row
            key={check.id}
            title={check.id}
            meta={check.fix === null ? check.detail ?? '' : `${check.detail ?? ''} · corrigir: ${check.fix}`}
            dot={check.status === 'fail' ? 'crit' : 'warn'}
            aside={<span className={`pill ${check.status === 'fail' ? 'pill--crit' : 'pill--warn'}`}>{check.severity ?? check.status}</span>}
          />)}
        </div>
        {healthy.length > 0 && <p className="card__hint">{healthy.length} check(s) verde(s): {healthy.map((check) => check.id).join(', ')}</p>}
      </article>

      <article className="card">
        <Head title="Ferramentas" hint="potencializam o harness, nunca travam" />
        {doctor.isPending && <Skeleton lines={4} />}
        <div className="rows">
          {(doctor.data?.tools ?? []).map((tool) => <Row
            key={tool.name}
            title={tool.name}
            meta={tool.ok ? tool.gate : `instalar: ${tool.install}`}
            dot={tool.ok ? 'ok' : undefined}
            aside={<span className={`pill ${tool.ok ? 'pill--ok' : ''}`}>{tool.ok ? tool.version ?? 'instalada' : 'ausente'}</span>}
          />)}
        </div>
        {doctor.data?.project !== undefined && <>
          <h3 className="card__title">Projeto</h3>
          <div className="rows">
            {doctor.data.project.checks.map((check) => <Row
              key={check.id}
              title={check.id}
              meta={check.detail}
              dot={toneOf(check.status)}
              aside={<span className={`pill ${pillOf(check.status)}`}>{check.status}</span>}
            />)}
          </div>
        </>}
      </article>
    </div>
  </Section>;
}

/* ── Aba: Operação ─────────────────────────────────────────────────────── */

function OperacaoTab() {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [origin, setOrigin] = useState('');
  // Separado do campo: digitar não dispara consulta a cada tecla, e clicar num nó da lista
  // consulta o impacto dele na hora sem o usuário copiar um hash de 64 caracteres.
  const [target, setTarget] = useState('');
  const snapshot = useQuery({ queryKey: ['control-plane', 'snapshot'], queryFn: loadSnapshot });
  const impact = useQuery({ queryKey: ['graph', 'impact', target], queryFn: () => loadImpact(target), enabled: target.length > 0 });
  const metrics = snapshot.data?.metrics;

  async function act(label: string, path: string, body?: unknown): Promise<void> {
    try {
      const response = await fetch(`${api}${path}`, {
        method: 'POST',
        ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      });
      if (!response.ok) throw new Error(await failureOf(response, `${label} recusada`));
      await queryClient.invalidateQueries({ queryKey: ['control-plane', 'snapshot'] });
      setNotice(undefined);
    } catch (reason: unknown) { setNotice(reason instanceof Error ? reason.message : `Falha em ${label}`); }
  }

  return <Section title="Operação" hint="execuções, aprovações e grafo">
    {notice !== undefined && <div className="banner" role="alert"><span className="dot dot--crit" /><span>{notice}</span></div>}
    <Failure error={snapshot.error} />
    <div className="grid grid--metrics">
      <Metric label="Execuções" value={metrics?.runCount ?? 0} loading={snapshot.isPending} />
      <Metric label="Taxa de sucesso" value={`${((metrics?.successRate ?? 0) * 100).toFixed(1)}%`} accent loading={snapshot.isPending} />
      <Metric label="Tokens de entrada" value={(metrics?.totalInputTokens ?? 0).toLocaleString('pt-BR')} loading={snapshot.isPending} />
      <Metric label="Observações" value={metrics?.observationCount ?? 0} loading={snapshot.isPending} />
    </div>

    <div className="grid grid--cards">
      <article className="card">
        <Head title="Aprovações" hint="identidade configurada no servidor" />
        {snapshot.data?.approvals.length === 0 && <Empty text="Nenhuma aprovação registrada." />}
        <div className="rows">
          {(snapshot.data?.approvals ?? []).map((approval) => <Row
            key={approval.id}
            title={approval.action}
            meta={approval.impact}
            dot={approval.decision === 'approved' ? 'ok' : approval.decision === 'rejected' ? 'crit' : 'warn'}
            aside={approval.decision === undefined
              ? <>
                <button className="btn btn--sm btn--primary" onClick={() => void act('aprovação', `/approvals/${encodeURIComponent(approval.id)}/decide`, { decision: 'approved' })}>Aprovar</button>
                <button className="btn btn--sm btn--danger" onClick={() => void act('rejeição', `/approvals/${encodeURIComponent(approval.id)}/decide`, { decision: 'rejected' })}>Rejeitar</button>
              </>
              : <span className={`pill ${approval.decision === 'approved' ? 'pill--ok' : 'pill--crit'}`}>{approval.decision}</span>}
          />)}
        </div>
      </article>

      <article className="card">
        <Head title="GraphLoop" hint={`${snapshot.data?.graphNodes.length ?? 0} nós indexados`} />
        <div className="inline">
          <input className="field" aria-label="ID do nó de impacto" placeholder="ID do nó para impacto" value={origin} onChange={(event) => setOrigin(event.target.value)} />
          <button className="btn" disabled={origin.trim().length === 0} onClick={() => setTarget(origin.trim())}>Impacto</button>
        </div>
        {snapshot.data?.graphNodes.length === 0 && <Empty text="Nenhum nó indexado." detail="Rode forja graph:sync para indexar o workspace." />}
        <div className="rows">
          {(snapshot.data?.graphNodes ?? []).slice(0, 8).map((node) => <Row
            key={node.id}
            title={node.label}
            meta={`${node.id.slice(0, 12)}…`}
            dot={node.status === 'verified' ? 'ok' : 'info'}
            aside={<>
              <span className="pill">{node.type}</span>
              <button className="btn btn--sm btn--ghost" onClick={() => { setOrigin(node.id); setTarget(node.id); }}>Impacto</button>
            </>}
          />)}
        </div>
        {impact.isFetching && <Skeleton lines={3} />}
        <Failure error={impact.error} />
        {impact.data !== undefined && <>
          <p className="card__hint">Impacto de <code>{target.slice(0, 12)}…</code></p>
          <pre className="dump"><code>{JSON.stringify(impact.data, null, 2)}</code></pre>
        </>}
      </article>
    </div>

    <article className="card">
      <Head title="Atividade recente" hint={snapshot.isFetching ? 'sincronizando' : 'estado remoto'} />
      {snapshot.data?.observations.length === 0 && <Empty text="Nenhuma observação registrada." />}
      <div className="rows">
        {(snapshot.data?.observations ?? []).slice(-10).reverse().map((observation) => <Row
          key={observation.id}
          title={observation.capabilityId ?? 'operação do Control Plane'}
          meta={observation.traceId}
          dot={toneOf(observation.outcome)}
          aside={<>
            <span className={`pill ${pillOf(observation.outcome)}`}>{observation.outcome}</span>
            {observation.runId !== undefined && <>
              <button className="btn btn--sm btn--ghost" onClick={() => void act('pausa', `/executions/${observation.runId}/pause`)}>Pausar</button>
              <button className="btn btn--sm btn--danger" onClick={() => void act('cancelamento', `/executions/${observation.runId}/cancel`)}>Cancelar</button>
            </>}
          </>}
        />)}
      </div>
    </article>
  </Section>;
}

/* ── Peças de apresentação ─────────────────────────────────────────────── */

function Section({ title, hint, children }: Readonly<{ title: string; hint?: string; children: ReactNode }>) {
  return <section className="section" aria-label={title}>
    <div className="section__head">
      <div className="section__title"><h2>{title}</h2>{hint !== undefined && <span className="card__hint">{hint}</span>}</div>
    </div>
    {children}
  </section>;
}

function Head({ title, hint, children }: Readonly<{ title: string; hint?: string; children?: ReactNode }>) {
  return <div className="card__head">
    <div className="card__head-text">
      <h3 className="card__title">{title}</h3>
      {hint !== undefined && <span className="card__hint">{hint}</span>}
    </div>
    {children !== undefined && <div className="topbar__actions">{children}</div>}
  </div>;
}

function Metric({ label, value, hint, accent, loading }: Readonly<{ label: string; value: string | number; hint?: string; accent?: boolean; loading?: boolean }>) {
  return <article className={`card metric${accent === true ? ' metric--accent' : ''}`}>
    <span className="metric__label">{label}</span>
    {loading === true ? <span className="skeleton skeleton--value" /> : <strong className="metric__value">{value}</strong>}
    {hint !== undefined && <span className="metric__hint">{hint}</span>}
  </article>;
}

type Tone = 'ok' | 'warn' | 'crit' | 'info';

function Row({ title, meta, dot, aside }: Readonly<{ title: string; meta?: string; dot?: Tone; aside?: ReactNode }>) {
  return <div className="row">
    {dot !== undefined && <span className={`dot dot--${dot}`} />}
    <span className="row__main">
      <span className="row__title">{title}</span>
      {meta !== undefined && meta.length > 0 && <span className="row__meta">{meta}</span>}
    </span>
    {aside !== undefined && <span className="row__aside">{aside}</span>}
  </div>;
}

function Gauge({ value, tone }: Readonly<{ value: number; tone?: 'ok' | 'warn' | 'crit' }>) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return <span className={`gauge${tone === undefined ? '' : ` gauge--${tone}`}`} role="img" aria-label={`${percent}%`}>
    <span className="gauge__fill" style={{ width: `${percent}%` }} />
  </span>;
}

function Cmd({ value }: Readonly<{ value: string }>) {
  const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle');
  const code = useRef<HTMLElement>(null);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setState('copied');
    } catch {
      // A API de clipboard exige documento focado e contexto seguro; sem isso ela rejeita. Em vez
      // de engolir o erro num botão que nunca muda, seleciona o comando para o usuário copiar.
      const node = code.current;
      if (node !== null) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      setState('manual');
    }
    setTimeout(() => setState('idle'), 2400);
  }

  return <div className="cmd">
    <code ref={code}>{value}</code>
    <button className="btn btn--sm btn--ghost" onClick={() => void copy()}>
      {state === 'copied' ? 'copiado' : state === 'manual' ? 'selecionado — copie' : 'copiar'}
    </button>
  </div>;
}

function Empty({ text, detail }: Readonly<{ text: string; detail?: string }>) {
  return <div className="empty"><span>{text}</span>{detail !== undefined && <span>{detail}</span>}</div>;
}

function Skeleton({ lines }: Readonly<{ lines: number }>) {
  return <div className="grid">{Array.from({ length: lines }, (_, index) => <span className="skeleton skeleton--row" key={index} />)}</div>;
}

function Failure({ error }: Readonly<{ error: unknown }>) {
  if (error === null || error === undefined) return null;
  return <div className="banner" role="alert"><span className="dot dot--crit" /><span>{textOf(error)}</span></div>;
}

function toneOf(status: string): Tone | undefined {
  if (status === 'ok' || status === 'succeeded' || status === 'done' || status === 'verified' || status === 'approved') return 'ok';
  if (status === 'warn' || status === 'pending' || status === 'implementing' || status === 'degraded') return 'warn';
  if (status === 'fail' || status === 'failed' || status === 'error' || status === 'abandoned' || status === 'rejected') return 'crit';
  return 'info';
}

function pillOf(status: string): string {
  const tone = toneOf(status);
  return tone === 'info' ? 'pill--info' : `pill--${tone}`;
}

function pillOfStatus(status: string): string {
  if (status === 'done' || status === 'approved') return 'pill--ok';
  if (status === 'abandoned' || status === 'rejected') return 'pill--crit';
  if (status === 'draft') return '';
  return 'pill--info';
}

/* ── Acesso a dados ────────────────────────────────────────────────────── */

/**
 * Executa uma capacidade de leitura e devolve o payload do contrato `--json` que o script escreveu
 * no stdout (ADR-0082). Pela HTTP volta o `ExecutionResult` cru, com o JSON do comando como texto em
 * `output.payload.stdout` — o parse acontece aqui, e um contrato `error` vira exceção com a mensagem
 * do próprio comando em vez de um "falhou" genérico.
 */
async function capability<T>(id: string, payload: Record<string, unknown> = { json: true }): Promise<T> {
  const response = await fetch(`${api}/capabilities/${id}/execute`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    // `categories` é o que a política do servidor avalia: sem ela a regra `local-read-only` não
    // casa e o default-deny bloqueia a execução. O proxy confere a declaração independentemente.
    body: JSON.stringify({ payload, categories: ['read'] }),
    cache: 'no-store',
  });
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) throw new Error(textOf(body, `Execução recusada (HTTP ${response.status})`));
  const execution = body as {
    readonly status?: string;
    readonly error?: { readonly message?: string };
    readonly output?: { readonly payload?: { readonly exitCode?: number; readonly stdout?: string } };
  };
  const contract = parseContract(execution.output?.payload?.stdout ?? '');
  if (contract !== undefined && contract.status === 'error') throw new Error(textOf(contract.error, 'Comando falhou sem mensagem'));
  if (contract !== undefined) return contract as T;
  if (execution.status !== 'succeeded') throw new Error(execution.error?.message ?? `Capacidade falhou: ${id}`);
  throw new Error(`Saída de ${id} não é o contrato --json`);
}

function parseContract(stdout: string): { readonly status: string; readonly error?: unknown } | undefined {
  const text = stdout.trim();
  if (!text.startsWith('{')) return undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || !('status' in parsed)) return undefined;
    return parsed as { status: string; error?: unknown };
  } catch { return undefined; }
}

async function loadSnapshot(): Promise<Snapshot> {
  const responses = await Promise.all([
    fetch(`${api}/control-plane/metrics`, { cache: 'no-store' }),
    fetch(`${api}/observability/observations`, { cache: 'no-store' }),
    fetch(`${api}/graph/query`, { cache: 'no-store' }),
    fetch(`${api}/approvals`, { cache: 'no-store' }),
  ]);
  for (const response of responses) {
    if (response.ok) continue;
    throw new Error(await failureOf(response, 'Control Plane indisponível'));
  }
  const [metrics, observations, graphNodes, approvals] = await Promise.all(responses.map((response) => response.json()));
  return {
    metrics: metrics as ControlPlaneMetrics,
    observations: observations as readonly Observation[],
    graphNodes: graphNodes as readonly GraphNode[],
    approvals: approvals as readonly ApprovalRequest[],
  };
}

async function loadImpact(origin: string): Promise<unknown> {
  const response = await fetch(`${api}/graph/impact?origin=${encodeURIComponent(origin)}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(await failureOf(response, 'Impacto não disponível'));
  return response.json() as Promise<unknown>;
}

async function failureOf(response: Response, fallback: string): Promise<string> {
  const body: unknown = await response.json().catch(() => undefined);
  return textOf(body, `${fallback} (HTTP ${response.status})`);
}

/** Mensagem legível de uma falha já materializada: `{error:{message}}`, `{message}`, Error ou texto. */
function textOf(source: unknown, fallback = 'Falha sem detalhe'): string {
  if (typeof source === 'string' && source.length > 0) return source;
  if (source instanceof Error) return source.message;
  if (typeof source === 'object' && source !== null) {
    const record = source as { readonly error?: { readonly message?: unknown }; readonly message?: unknown };
    if (typeof record.error?.message === 'string') return record.error.message;
    if (typeof record.message === 'string') return record.message;
  }
  return fallback;
}

/** `{available:true,value}` → valor; qualquer outra forma → `undefined`. */
function sub<T>(entry: Sub<T> | undefined): T | undefined {
  return entry !== undefined && entry.available ? entry.value : undefined;
}

/** O motivo de um coletor indisponível — só aparece quando é o caso. */
function reasonOf(entry: Sub<unknown> | undefined): string | undefined {
  return entry !== undefined && !entry.available ? entry.reason : undefined;
}
