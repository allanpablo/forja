import { createHash } from 'node:crypto';
import {
  CONTRACT_VERSION,
  type EntityId,
  type ExecutionPlan,
  type ISO8601,
  type PlanStep,
  type RiskLevel,
  type TokenBudget,
  validateTokenBudget,
} from '../../contracts/src/index.ts';

export interface PlannerRequest {
  readonly objective: string;
  readonly acceptanceCriteria: readonly string[];
  readonly allowedFiles: readonly string[];
  readonly dependencyIds?: readonly EntityId[];
  readonly graphDependencyIds?: readonly EntityId[];
  readonly contextEvidenceIds?: readonly EntityId[];
  readonly evidenceIds: readonly EntityId[];
  readonly budget: TokenBudget;
  readonly correlationId?: string;
}

export class PlannerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlannerError';
  }
}

export class DeterministicPlanner {
  plan(request: PlannerRequest): ExecutionPlan {
    if (request.objective.trim().length === 0) throw new PlannerError('Planner objective is required');
    if (request.acceptanceCriteria.length === 0) throw new PlannerError('Planner requires acceptance criteria');
    const evidenceIds = [...new Set([...request.evidenceIds, ...(request.contextEvidenceIds ?? [])])];
    if (evidenceIds.length === 0) throw new PlannerError('Planner requires evidence references');
    validateTokenBudget(request.budget);
    const risk = this.riskFor(request.objective, request.allowedFiles);
    const now = new Date().toISOString() as ISO8601;
    const fields = this.auditFields(request.correlationId ?? `plan:${request.objective}`);
    const stepDefinitions = [
      { objective: 'Confirm scope, dependencies and current evidence', criteria: ['Scope and dependencies are recorded'], files: [], dependencies: [] as readonly EntityId[] },
      { objective: request.objective, criteria: request.acceptanceCriteria, files: request.allowedFiles, dependencies: [...(request.dependencyIds ?? []), ...(request.graphDependencyIds ?? [])] },
      { objective: 'Validate the objective against independent checks', criteria: ['All acceptance criteria have evidence'], files: [], dependencies: [] as readonly EntityId[] },
    ];
    const budgets = this.allocate(request.budget, stepDefinitions.length);
    const steps: PlanStep[] = stepDefinitions.map((definition, index) => ({
      ...fields,
      id: this.id(`step:${request.objective}:${index}`),
      objective: definition.objective,
      acceptanceCriteria: definition.criteria,
      allowedFiles: definition.files,
      dependencyIds: [...definition.dependencies].sort(),
      evidenceIds,
      risk,
      budget: budgets[index],
      status: index === 0 ? 'ready' : 'planned',
    }));
    return {
      ...fields,
      id: this.id(`plan:${request.objective}:${evidenceIds.join(',')}`),
      objective: request.objective,
      steps,
      budget: request.budget,
      risk,
      evidenceIds,
    };
  }

  private riskFor(objective: string, files: readonly string[]): RiskLevel {
    if (/(deploy|release|secret|credential|destructive|delete|production)/i.test(objective)) return 'high';
    if (files.length > 20 || files.some((file) => /(^|\/)(infra|migration|security)(\/|$)/i.test(file))) return 'medium';
    return 'low';
  }

  private allocate(budget: TokenBudget, count: number): readonly TokenBudget[] {
    const split = (total: number): number[] => Array.from({ length: count }, (_, index) => Math.floor(total / count) + (index < total % count ? 1 : 0));
    const inputs = split(budget.inputTokens);
    const outputs = split(budget.outputTokens);
    return inputs.map((inputTokens, index) => ({ inputTokens, outputTokens: outputs[index], totalTokens: inputTokens + outputs[index], usedTokens: 0 }));
  }

  private id(value: string): EntityId {
    return createHash('sha256').update(value).digest('hex') as EntityId;
  }

  private auditFields(correlationId: string): Pick<ExecutionPlan, 'schemaVersion' | 'createdAt' | 'updatedAt' | 'correlationId'> {
    const now = new Date().toISOString() as ISO8601;
    return { schemaVersion: CONTRACT_VERSION, createdAt: now, updatedAt: now, correlationId };
  }
}
