'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { ApprovalRequest, ControlPlaneMetrics, GraphNode, Observation } from '../../../packages/contracts/src/index.ts';

interface Snapshot { readonly metrics: ControlPlaneMetrics; readonly observations: readonly Observation[]; readonly graphNodes: readonly GraphNode[]; readonly approvals: readonly ApprovalRequest[]; }
const dashboardApi = '/api/forja';

export default function DashboardClient() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | undefined>(undefined);
  const snapshot = useQuery({ queryKey: ['control-plane', 'snapshot'], queryFn: loadSnapshot });
  const [impactOrigin, setImpactOrigin] = useState('');
  const impact = useQuery({ queryKey: ['graph', 'impact', impactOrigin], queryFn: () => loadImpact(impactOrigin), enabled: false });

  useEffect(() => {
    const source = new EventSource(`${dashboardApi}/events/stream`);
    source.onmessage = () => { void queryClient.invalidateQueries({ queryKey: ['control-plane', 'snapshot'] }); };
    source.onerror = () => source.close();
    return () => source.close();
  }, [queryClient]);

  async function execute(path: string): Promise<void> {
    try { const response = await fetch(`${dashboardApi}${path}`, { method: 'POST' }); if (!response.ok) throw new Error('Ação recusada pelo Control Plane'); await queryClient.invalidateQueries({ queryKey: ['control-plane', 'snapshot'] }); setError(undefined); }
    catch (reason: unknown) { setError(reason instanceof Error ? reason.message : 'Falha na ação'); }
  }

  async function decideApproval(id: string, decision: 'approved' | 'rejected'): Promise<void> {
    try { const response = await fetch(`${dashboardApi}/approvals/${encodeURIComponent(id)}/decide`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision }) }); if (!response.ok) throw new Error('Decisão recusada pelo Control Plane'); await queryClient.invalidateQueries({ queryKey: ['control-plane', 'snapshot'] }); setError(undefined); }
    catch (reason: unknown) { setError(reason instanceof Error ? reason.message : 'Falha na decisão'); }
  }

  const metrics = snapshot.data?.metrics;
  return <>
    <header className="header"><div><p className="eyebrow">FORJAJS 2.0</p><h1>Control Plane</h1><p className="muted">Autonomia supervisionada, evidência e execução auditável.</p></div><button onClick={() => void snapshot.refetch()} disabled={snapshot.isFetching}>{snapshot.isFetching ? 'Atualizando…' : 'Atualizar'}</button></header>
    {(error !== undefined || snapshot.error !== null) && <div className="alert" role="alert">{error ?? 'Control Plane indisponível'}</div>}
    <section className="grid" aria-label="Métricas operacionais"><Metric label="Execuções" value={metrics?.runCount ?? 0} /><Metric label="Taxa de sucesso" value={`${((metrics?.successRate ?? 0) * 100).toFixed(1)}%`} /><Metric label="Tokens de entrada" value={metrics?.totalInputTokens ?? 0} /><Metric label="Observações" value={metrics?.observationCount ?? 0} /></section>
    <section className="panel"><div className="panel-title"><h2>GraphLoop</h2><span className="muted">nós com origem no backend</span></div><div className="graph-controls"><input aria-label="ID do nó de impacto" value={impactOrigin} onChange={(event) => setImpactOrigin(event.target.value)} placeholder="ID do nó para impacto" /><button onClick={() => void impact.refetch()} disabled={impactOrigin.trim().length === 0}>Calcular impacto</button></div><div className="graph-grid">{snapshot.data?.graphNodes.slice(0, 12).map((node) => <span key={node.id} className="node"><strong>{node.label}</strong><small>{node.type} · {node.status}</small></span>)}</div>{impact.data !== undefined && <pre className="impact">{JSON.stringify(impact.data, null, 2)}</pre>}</section>
    <section className="panel"><div className="panel-title"><h2>Approvals</h2><span className="muted">identidade configurada no servidor</span></div>{snapshot.data?.approvals.length === 0 && <p className="muted">Nenhuma aprovação registrada.</p>}<ul className="events">{snapshot.data?.approvals.map((approval) => <li key={approval.id}><span className="dot" /><span><strong>{approval.decision ?? 'pending'}</strong> · {approval.action}<small>{approval.impact}</small></span>{approval.decision === undefined && <span className="actions"><button onClick={() => void decideApproval(approval.id, 'approved')}>Aprovar</button><button onClick={() => void decideApproval(approval.id, 'rejected')}>Rejeitar</button></span>}</li>)}</ul></section>
    <section className="panel"><div className="panel-title"><h2>Atividade recente</h2><span className="muted">{snapshot.isFetching ? 'sincronizando' : 'estado remoto'}</span></div>
      {snapshot.data?.observations.length === 0 && <p className="muted">Nenhuma observação registrada.</p>}
      <ul className="events">{snapshot.data?.observations.slice(-8).reverse().map((observation) => <li key={observation.id}><span className={`dot ${observation.outcome}`} /><span><strong>{observation.outcome}</strong> · {observation.capabilityId ?? 'operação do Control Plane'}<small>{observation.traceId}</small></span>{observation.runId !== undefined && <span className="actions"><button onClick={() => void execute(`/executions/${observation.runId}/pause`)}>Pausar</button><button onClick={() => void execute(`/executions/${observation.runId}/cancel`)}>Cancelar</button></span>}</li>)}</ul>
    </section>
  </>;
}

async function loadSnapshot(): Promise<Snapshot> {
  const [metricsResponse, observationsResponse, graphResponse, approvalsResponse] = await Promise.all([fetch(`${dashboardApi}/control-plane/metrics`), fetch(`${dashboardApi}/observability/observations`), fetch(`${dashboardApi}/graph/query`), fetch(`${dashboardApi}/approvals`)]);
  if (![metricsResponse, observationsResponse, graphResponse, approvalsResponse].every((response) => response.ok)) throw new Error('Control Plane indisponível');
  return { metrics: await metricsResponse.json() as ControlPlaneMetrics, observations: await observationsResponse.json() as readonly Observation[], graphNodes: await graphResponse.json() as readonly GraphNode[], approvals: await approvalsResponse.json() as readonly ApprovalRequest[] };
}

async function loadImpact(origin: string): Promise<unknown> { const response = await fetch(`${dashboardApi}/graph/impact?origin=${encodeURIComponent(origin)}`); if (!response.ok) throw new Error('Impacto não disponível'); return response.json() as Promise<unknown>; }

function Metric({ label, value }: Readonly<{ label: string; value: string | number }>) { return <article className="metric"><span>{label}</span><strong>{value}</strong></article>; }
