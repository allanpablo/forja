import { randomUUID } from 'node:crypto';
import { CONTRACT_VERSION, type EntityId, type EvaluationReport, type EvaluationScope, type ISO8601, type Observation } from '../../contracts/src/index.ts';

export interface EvaluationRequest {
  readonly scope: EvaluationScope;
  readonly scopeId?: string;
  readonly observations?: readonly Observation[];
  readonly correlationId?: string;
}

export interface EvaluationObservationSource { list(): readonly Observation[] | Promise<readonly Observation[]>; }

export class EvaluationError extends Error {
  constructor(message: string) { super(message); this.name = 'EvaluationError'; }
}

export class EvaluationEngine {
  private readonly source: EvaluationObservationSource;
  constructor(source: EvaluationObservationSource) { this.source = source; }

  async evaluate(input: EvaluationRequest): Promise<EvaluationReport> {
    const values = input.observations === undefined ? await this.source.list() : input.observations;
    const selected = values.filter((value) => this.matches(value, input.scope, input.scopeId));
    const metrics = this.metrics(selected);
    const evidenceIds = selected.map((value) => value.id);
    const now = new Date().toISOString() as ISO8601;
    return {
      schemaVersion: CONTRACT_VERSION, id: randomUUID() as EntityId, createdAt: now, updatedAt: now,
      correlationId: input.correlationId ?? `evaluation:${input.scope}:${input.scopeId ?? 'all'}`,
      scope: input.scope, scopeId: input.scopeId, observationIds: evidenceIds, metrics,
      findings: Object.entries(metrics).map(([name, value]) => ({ name, value, evidenceIds })),
    };
  }

  private matches(value: Observation, scope: EvaluationScope, scopeId: string | undefined): boolean {
    if (scopeId === undefined || scope === 'workspace' || scope === 'strategy') return true;
    const candidate = scope === 'run' ? value.runId : scope === 'agent' ? value.agentId : scope === 'task' ? value.taskId : scope === 'sprint' ? value.sprintId : scope === 'capability' ? value.capabilityId : scope === 'model' ? value.model : undefined;
    return candidate === scopeId;
  }

  private metrics(values: readonly Observation[]): Readonly<Record<string, number>> {
    const total = values.length;
    const succeeded = values.filter((value) => value.outcome === 'succeeded').length;
    const repeatedInputs = this.repeatedInputCount(values);
    const taskIds = new Set(values.map((value) => value.taskId).filter((value): value is NonNullable<typeof value> => value !== undefined));
    const evidenceFree = values.filter((value) => value.contextRefs.length === 0 && value.inputHash === undefined).length;
    const rollbacks = values.filter((value) => value.errorCode?.toUpperCase() === 'ROLLBACK').length;
    const contextUsed = values.filter((value) => value.contextRefs.length > 0).length;
    const useless = values.filter((value) => value.inputTokens === 0 && value.outputTokens === 0 && value.durationMs === 0).length;
    return {
      observationCount: total,
      successRate: this.rate(succeeded, total),
      reworkRate: this.rate(repeatedInputs, total),
      tokensPerTask: taskIds.size === 0 ? 0 : values.reduce((sum, value) => sum + value.inputTokens + value.outputTokens, 0) / taskIds.size,
      uselessStepRate: this.rate(useless, total),
      cacheHitRate: this.rate(repeatedInputs, total),
      assertionsWithoutEvidenceRate: this.rate(evidenceFree, total),
      rollbackRate: this.rate(rollbacks, total),
      contextUtilizationRate: this.rate(contextUsed, total),
      totalInputTokens: values.reduce((sum, value) => sum + value.inputTokens, 0),
      totalOutputTokens: values.reduce((sum, value) => sum + value.outputTokens, 0),
      totalCost: values.reduce((sum, value) => sum + (value.cost ?? 0), 0),
    };
  }

  private repeatedInputCount(values: readonly Observation[]): number {
    const seen = new Set<string>(); let repeated = 0;
    for (const value of values) if (value.inputHash !== undefined) { if (seen.has(value.inputHash)) repeated += 1; else seen.add(value.inputHash); }
    return repeated;
  }

  private rate(value: number, total: number): number { return total === 0 ? 0 : value / total; }
}
