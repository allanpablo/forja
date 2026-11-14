import { createHash, randomUUID } from 'node:crypto';
import {
  CONTRACT_VERSION,
  isPathWithinRoot,
  type AgentIdentity,
  type ApprovalRequest,
  type CapabilityDefinition,
  type CapabilityInput,
  type EntityId,
  type ISO8601,
  type PolicyDecision,
  type RiskLevel,
  type TokenBudget,
} from '../../contracts/src/index.ts';

export type PolicyCategory = 'read' | 'write' | 'execution' | 'network' | 'repository' | 'secrets' | 'database' | 'deployment' | 'destructive';

export interface PolicyScope {
  readonly agentIds?: readonly EntityId[];
  readonly roles?: readonly string[];
  readonly capabilityIds?: readonly string[];
  readonly projects?: readonly string[];
  readonly environments?: readonly string[];
  readonly risks?: readonly RiskLevel[];
  readonly categories?: readonly PolicyCategory[];
  readonly pathPrefixes?: readonly string[];
  /**
   * Faixa opcional de `ChangeRiskAssessment.score` (0-100, SPEC-034) que a regra se aplica a.
   * `PolicyRequest.riskScore` é um `number` puro, não o assessment inteiro — este pacote nunca
   * importa `@forja/engineering-risk` (AC-5); quem calcula o score chama `RiskEngine.assess()`
   * antes de montar o `PolicyRequest`.
   */
  readonly riskScoreRange?: readonly [number, number];
  /**
   * Faixa opcional de `AnomalyAssessment.score` (0-100, SPEC-040) que a regra se aplica a. Mesmo
   * padrão exato de `riskScoreRange`: `PolicyRequest.anomalyScore` é um `number` puro, não o
   * assessment inteiro — este pacote nunca importa `@forja/engineering-monitoring`; quem calcula o
   * score chama `detectAnomaly()` antes de montar o `PolicyRequest`.
   */
  readonly anomalyScoreRange?: readonly [number, number];
}

export interface PolicyLimits {
  readonly maxTokens?: number;
  readonly maxFiles?: number;
  readonly maxDurationMs?: number;
  readonly maxRetries?: number;
  /**
   * Real dollar ceiling per execution (SPEC-029). Enforced the same way as maxFiles/maxTokens, in
   * `CapabilityRegistry.checkLimits` — see that method for why this is a `checkLimits` concern and
   * not part of rule matching. Optional so every existing rule keeps working unchanged.
   */
  readonly maxCostUsd?: number;
}

export interface PolicyRule {
  readonly id: string;
  readonly priority: number;
  readonly effect: PolicyDecision['effect'];
  readonly reason: string;
  readonly scope: PolicyScope;
  readonly limits?: PolicyLimits;
}

export interface ApprovalDetails {
  readonly action: string;
  readonly justification: string;
  readonly impact: string;
  readonly expectedDiff?: string;
  readonly expiresAt: ISO8601;
}

export interface PolicyRequest {
  readonly definition: CapabilityDefinition;
  readonly agent: AgentIdentity;
  /** Validated, canonical input supplied by the capability registry. Only its digest is persisted. */
  readonly input?: CapabilityInput;
  /** Stable action/step identity; falls back to correlationId, never to agent identity. */
  readonly operationId?: string;
  readonly correlationId?: string;
  readonly projectId?: string;
  readonly environment: string;
  readonly categories: readonly string[];
  readonly files: readonly string[];
  readonly budget?: TokenBudget;
  readonly now: ISO8601;
  readonly approval?: ApprovalDetails;
  /** Score 0-100 de um `ChangeRiskAssessment` já calculado (SPEC-034) — ver `PolicyScope.riskScoreRange`. */
  readonly riskScore?: number;
  /** Score 0-100 de um `AnomalyAssessment` já calculado (SPEC-040) — ver `PolicyScope.anomalyScoreRange`. */
  readonly anomalyScore?: number;
}

export interface ApprovalDecision {
  readonly decision: 'approved' | 'rejected';
  readonly approverId: EntityId;
  readonly decidedAt: ISO8601;
}

export interface ApprovalInput extends ApprovalDetails {
  readonly correlationId: string;
  readonly operationId?: string;
  readonly fingerprint?: string;
}

export interface ApprovalStore {
  save(request: ApprovalRequest): void;
  get(id: EntityId): ApprovalRequest | undefined;
  list(): readonly ApprovalRequest[];
}

export class PolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PolicyError';
  }
}

// Round-trip the calendar to reject Date.parse's normalization of impossible dates.
function approvalInstant(value: ISO8601): number {
  const parts = typeof value === 'string' ? /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value) : null;
  if (parts === null) throw new PolicyError('Approval date must be an unambiguous ISO timestamp');
  const calendar = `${parts[1]}.${(parts[2] ?? '').padEnd(3, '0')}Z`;
  const local = Date.parse(calendar);
  const instant = Date.parse(value);
  if (!Number.isFinite(local) || !Number.isFinite(instant) || new Date(local).toISOString() !== calendar) {
    throw new PolicyError('Invalid approval date');
  }
  return instant;
}

// Tags distinguish absent/undefined/null; descriptors prevent executing getters or toJSON.
function canonicalApprovalValue(value: unknown, ancestors = new Set<object>()): string {
  if (value === undefined) return '["undefined"]';
  if (value === null) return '["null"]';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify([typeof value, value]);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new PolicyError('Non-finite approval value');
    return JSON.stringify(['number', Object.is(value, -0) ? '-0' : value]);
  }
  if (typeof value !== 'object') throw new PolicyError('Unsupported approval value');
  if (ancestors.has(value)) throw new PolicyError('Cyclic approval value');
  const array = Array.isArray(value);
  const prototype: unknown = Object.getPrototypeOf(value);
  if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
    throw new PolicyError('Approval values must be plain objects or arrays');
  }
  ancestors.add(value);
  try {
    const keys = Reflect.ownKeys(value);
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (typeof key !== 'string' || descriptor === undefined || !('value' in descriptor) || (!descriptor.enumerable && !(array && key === 'length'))) {
        throw new PolicyError('Ambiguous approval property');
      }
    }
    if (array) {
      if (keys.length !== value.length + 1) throw new PolicyError('Sparse or extended approval array');
      const entries: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (descriptor === undefined) throw new PolicyError('Sparse approval array');
        entries.push(canonicalApprovalValue(descriptor.value, ancestors));
      }
      return `["array",[${entries.join(',')}]]`;
    }
    const entries = Object.keys(value).sort().map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return `[${JSON.stringify(key)},${canonicalApprovalValue(descriptor?.value, ancestors)}]`;
    });
    return `["object",[${entries.join(',')}]]`;
  } finally {
    ancestors.delete(value);
  }
}

export class ApprovalLedger {
  private readonly requests = new Map<EntityId, ApprovalRequest>();
  private readonly store?: ApprovalStore;

  constructor(store?: ApprovalStore) { this.store = store; }

  create(input: ApprovalInput, now: ISO8601 = new Date().toISOString() as ISO8601): ApprovalRequest {
    if (input.action.trim().length === 0) throw new PolicyError('Approval action is required');
    if (input.justification.trim().length === 0) throw new PolicyError('Approval justification is required');
    if (input.impact.trim().length === 0) throw new PolicyError('Approval impact is required');
    if (approvalInstant(input.expiresAt) <= approvalInstant(now)) throw new PolicyError('Approval expiry must be in the future');
    const request: ApprovalRequest = {
      schemaVersion: CONTRACT_VERSION,
      id: randomUUID() as EntityId,
      action: input.action,
      justification: input.justification,
      impact: input.impact,
      expectedDiff: input.expectedDiff,
      expiresAt: input.expiresAt,
      correlationId: input.correlationId,
      operationId: input.operationId,
      fingerprint: input.fingerprint,
      createdAt: now,
      updatedAt: now,
    };
    this.requests.set(request.id, request);
    void this.store?.save(request);
    return request;
  }

  list(): readonly ApprovalRequest[] {
    if (this.store !== undefined) return this.store.list();
    return [...this.requests.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  decide(id: EntityId, decision: ApprovalDecision): ApprovalRequest {
    const current = this.get(id);
    if (current.decision !== undefined) throw new PolicyError(`Approval already decided: ${id}`);
    if (approvalInstant(current.expiresAt) <= approvalInstant(decision.decidedAt)) throw new PolicyError(`Approval expired: ${id}`);
    const updated: ApprovalRequest = { ...current, decision: decision.decision, approverId: decision.approverId, updatedAt: decision.decidedAt };
    this.requests.set(id, updated);
    void this.store?.save(updated);
    return updated;
  }

  expire(now: ISO8601): readonly ApprovalRequest[] {
    const instant = approvalInstant(now);
    const expired: ApprovalRequest[] = [];
    for (const current of this.list()) {
      if ((current.decision === undefined || current.decision === 'approved') && approvalInstant(current.expiresAt) <= instant) {
        const updated: ApprovalRequest = { ...current, decision: 'expired', updatedAt: now };
        this.requests.set(current.id, updated);
        void this.store?.save(updated);
        expired.push(updated);
      }
    }
    return expired;
  }

  /** Descriptive/historical records without both binding fields cannot authorize execution. */
  findByOperation(operationId: string, fingerprint: string): ApprovalRequest | undefined {
    const matches = this.list().filter((request) => request.operationId === operationId && request.fingerprint === fingerprint && request.decision !== 'expired');
    return matches.at(-1);
  }

  get(id: EntityId): ApprovalRequest {
    // A persistent store is authoritative, including deletion and decisions by another ledger.
    const request = this.store === undefined ? this.requests.get(id) : this.store.get(id);
    if (request === undefined) throw new PolicyError(`Approval not found: ${id}`);
    return request;
  }
}

export class PolicyEngine {
  private readonly rules: readonly PolicyRule[];
  private readonly approvalRequiredRisks: readonly RiskLevel[];
  private readonly approvalLedger: ApprovalLedger;

  constructor(options: { readonly rules?: readonly PolicyRule[]; readonly approvalRequiredRisks?: readonly RiskLevel[]; readonly approvalLedger?: ApprovalLedger } = {}) {
    this.rules = [...(options.rules ?? [])].sort((left, right) => right.priority - left.priority || this.effectRank(left.effect) - this.effectRank(right.effect) || left.id.localeCompare(right.id));
    this.approvalRequiredRisks = options.approvalRequiredRisks ?? ['critical'];
    this.approvalLedger = options.approvalLedger ?? new ApprovalLedger();
    this.validateRules(this.rules);
  }

  authorize(request: PolicyRequest): PolicyDecision {
    const match = this.rules.find((rule) => this.matches(rule.scope, request));
    const decision = match === undefined
      ? { effect: 'DENY' as const, reason: 'No matching policy rule', policyId: 'default-deny' }
      : { effect: match.effect, reason: match.reason, policyId: match.id, ...(match.limits === undefined ? {} : { limits: this.asNumericLimits(match.limits) }) };

    // ALLOW_WITH_LIMITS still grants execution — a critical-risk capability must not skip
    // approval just because a rule chose to bound it with limits instead of an unconditional ALLOW.
    const isGranting = decision.effect === 'ALLOW' || decision.effect === 'ALLOW_WITH_LIMITS';
    if (this.approvalRequiredRisks.includes(request.definition.risk) && isGranting) {
      return this.withApproval(request, decision, 'Risk requires explicit approval', match);
    }
    if (decision.effect === 'REQUIRE_APPROVAL') return this.withApproval(request, decision, decision.reason, match);
    return decision;
  }

  get approvals(): ApprovalLedger {
    return this.approvalLedger;
  }

  private withApproval(request: PolicyRequest, decision: PolicyDecision, reason: string, rule: PolicyRule | undefined): PolicyDecision {
    const now = approvalInstant(request.now);
    if (request.approval !== undefined) approvalInstant(request.approval.expiresAt);
    const operationId = request.operationId ?? request.correlationId ?? randomUUID();
    const correlationId = request.correlationId ?? operationId;
    const { definition, agent, budget, approval } = request;
    const fingerprint = `v1:${createHash('sha256').update(canonicalApprovalValue({
      operationId,
      agent: { id: agent.id, role: agent.role, autonomy: agent.autonomy },
      capability: { id: definition.id, version: definition.version, risk: definition.risk, permissions: definition.permissions, sideEffects: definition.sideEffects },
      payload: request.input?.payload,
      projectId: request.projectId,
      environment: request.environment,
      files: [...new Set(request.files)].sort(),
      categories: [...new Set(request.categories)].sort(),
      approval: approval === undefined ? undefined : {
        action: approval.action, justification: approval.justification, impact: approval.impact,
        expectedDiff: approval.expectedDiff, expiresAt: approval.expiresAt,
      },
      decision,
      rule,
      approvalRequiredRisks: this.approvalRequiredRisks,
      riskScore: request.riskScore,
      anomalyScore: request.anomalyScore,
      budget: budget === undefined ? undefined : { inputTokens: budget.inputTokens, outputTokens: budget.outputTokens, totalTokens: budget.totalTokens },
    })).digest('hex')}`;
    const existing = this.approvalLedger.findByOperation(operationId, fingerprint);
    if (existing !== undefined && approvalInstant(existing.expiresAt) > now) {
      if (existing.decision === 'approved') {
        // `decision.effect` may already be ALLOW/ALLOW_WITH_LIMITS (gated only by the risk-level
        // approval requirement) — keep it as-is. But when the *rule itself* is REQUIRE_APPROVAL,
        // that's a gate, not a final verdict: once approved, it must resolve to a grant, or every
        // retry would see the same rule match and stay stuck at REQUIRE_APPROVAL forever.
        const effect = decision.effect === 'ALLOW' || decision.effect === 'ALLOW_WITH_LIMITS' ? decision.effect : decision.limits === undefined ? 'ALLOW' : 'ALLOW_WITH_LIMITS';
        return { ...decision, effect, reason: 'Approval granted', approvalRequestId: existing.id };
      }
      if (existing.decision === 'rejected') return { ...decision, effect: 'DENY', reason: `Approval rejected: ${existing.id}`, approvalRequestId: existing.id };
      if (existing.decision === undefined) return { ...decision, effect: 'REQUIRE_APPROVAL', reason, approvalRequestId: existing.id };
    }
    if (approval === undefined) return { ...decision, effect: 'REQUIRE_APPROVAL', reason };
    const created = this.approvalLedger.create({ ...approval, correlationId, operationId, fingerprint }, request.now);
    return { ...decision, effect: 'REQUIRE_APPROVAL', reason, approvalRequestId: created.id };
  }

  private matches(scope: PolicyScope, request: PolicyRequest): boolean {
    if (scope.agentIds !== undefined && !scope.agentIds.includes(request.agent.id)) return false;
    if (scope.roles !== undefined && !scope.roles.includes(request.agent.role)) return false;
    if (scope.capabilityIds !== undefined && !scope.capabilityIds.includes(request.definition.id)) return false;
    if (scope.projects !== undefined && (request.projectId === undefined || !scope.projects.includes(request.projectId))) return false;
    if (scope.environments !== undefined && !scope.environments.includes(request.environment)) return false;
    if (scope.risks !== undefined && !scope.risks.includes(request.definition.risk)) return false;
    if (scope.categories !== undefined && !scope.categories.some((category) => request.categories.includes(category))) return false;
    if (scope.pathPrefixes !== undefined && !request.files.every((file) => scope.pathPrefixes?.some((prefix) => isPathWithinRoot(prefix, file)))) return false;
    if (scope.riskScoreRange !== undefined && (request.riskScore === undefined || request.riskScore < scope.riskScoreRange[0] || request.riskScore > scope.riskScoreRange[1])) return false;
    if (scope.anomalyScoreRange !== undefined && (request.anomalyScore === undefined || request.anomalyScore < scope.anomalyScoreRange[0] || request.anomalyScore > scope.anomalyScoreRange[1])) return false;
    return true;
  }

  private validateRules(rules: readonly PolicyRule[]): void {
    const ids = new Set<string>();
    for (const rule of rules) {
      if (rule.id.trim().length === 0) throw new PolicyError('Policy rule id is required');
      if (ids.has(rule.id)) throw new PolicyError(`Duplicate policy rule: ${rule.id}`);
      if (!Number.isInteger(rule.priority)) throw new PolicyError(`Policy priority must be an integer: ${rule.id}`);
      if (rule.reason.trim().length === 0) throw new PolicyError(`Policy reason is required: ${rule.id}`);
      ids.add(rule.id);
    }
  }

  private effectRank(effect: PolicyDecision['effect']): number {
    return effect === 'DENY' ? 0 : effect === 'REQUIRE_APPROVAL' ? 1 : effect === 'ALLOW_WITH_LIMITS' ? 2 : 3;
  }

  private asNumericLimits(limits: PolicyLimits): Readonly<Record<string, number>> {
    const output: Record<string, number> = {};
    for (const [key, value] of Object.entries(limits)) if (value !== undefined) output[key] = value;
    return output;
  }
}
