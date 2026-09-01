/** Versioned, framework-independent contracts for ForjaJS 2.0. */

import path from 'node:path';

export const CONTRACT_VERSION = '2.0';

export type Brand<T, B extends string> = T & { readonly __brand: B };
export type EntityId = Brand<string, 'EntityId'>;
export type CapabilityId = Brand<string, 'CapabilityId'>;
export type RunId = Brand<string, 'RunId'>;

export type ISO8601 = string & { readonly __iso8601: unique symbol };
export type KnowledgeStatus = 'verified' | 'inferred' | 'hypothesis' | 'contradicted' | 'unknown';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type PolicyEffect = 'ALLOW' | 'DENY' | 'REQUIRE_APPROVAL' | 'ALLOW_WITH_LIMITS';
export type ExecutionState = 'created' | 'planning' | 'awaiting_approval' | 'running' | 'validating' | 'paused' | 'blocked' | 'failed' | 'completed' | 'cancelled' | 'rolled_back';
export type SandboxState = 'created' | 'prepared' | 'executing' | 'validating' | 'ready_to_promote' | 'promoted' | 'rolled_back' | 'rejected' | 'destroyed' | 'failed';

export interface AuditFields {
  readonly schemaVersion: typeof CONTRACT_VERSION;
  readonly createdAt: ISO8601;
  readonly updatedAt: ISO8601;
  readonly correlationId: string;
}

export interface Evidence {
  readonly id: EntityId;
  readonly source: string;
  readonly locator: string;
  readonly checksum?: string;
  readonly capturedAt: ISO8601;
  readonly status: KnowledgeStatus;
}

export interface Claim {
  readonly id: EntityId;
  readonly statement: string;
  readonly status: KnowledgeStatus;
  readonly confidence: number;
  readonly evidenceIds: readonly EntityId[];
}

export interface CapabilityDefinition extends AuditFields {
  readonly id: CapabilityId;
  readonly version: string;
  readonly description: string;
  readonly permissions: readonly string[];
  readonly risk: RiskLevel;
  readonly sideEffects: readonly string[];
  readonly requirements: readonly string[];
  readonly supportsAutonomy: boolean;
  readonly idempotent: boolean;
  readonly timeoutMs: number;
  readonly retry: { readonly maxAttempts: number; readonly backoffMs: number };
  readonly aliases: readonly string[];
  readonly deprecated?: { readonly since: string; readonly replacement?: CapabilityId };
}

export interface CapabilityInput { readonly capabilityId: CapabilityId; readonly payload: unknown; }
export interface CapabilityOutput { readonly capabilityId: CapabilityId; readonly payload: unknown; readonly evidence: readonly Evidence[]; }
export interface ExecutionError { readonly code: string; readonly message: string; readonly retryable: boolean; readonly details?: Readonly<Record<string, string>>; }
export interface ExecutionResult extends AuditFields { readonly runId: RunId; readonly status: 'succeeded' | 'failed' | 'blocked' | 'cancelled'; readonly output?: CapabilityOutput; readonly error?: ExecutionError; readonly evidence: readonly Evidence[]; }

export interface AgentIdentity { readonly id: EntityId; readonly name: string; readonly role: string; readonly autonomy: 'consultive' | 'assisted' | 'supervised' | 'controlled_autonomous'; }
export interface AgentProfile extends AgentIdentity { readonly capabilities: readonly CapabilityId[]; readonly permissions: readonly string[]; }
/**
 * Registro persistente de agente (SPEC-036) — `AgentIdentity` continua sendo o tipo efêmero por
 * run (`PolicyRequest`/`RuntimeRun`); este é o registro entre runs, com reputação derivada de
 * comportamento real. `trustLevel`/`autonomyLevel`/`lastScoredAt` só são escritos por
 * `computeReputationScore` (via `agent:score`) — nunca aceitos em `agent:register`.
 */
export interface AgentProfile2 extends AuditFields {
  readonly id: EntityId;
  readonly role: string;
  readonly provider?: string;
  readonly model?: string;
  readonly capabilities: readonly string[];
  readonly architectureDomains: readonly string[];
  readonly limits?: { readonly maxFiles?: number; readonly maxCostUsd?: number; readonly maxDurationMs?: number };
  readonly trustLevel?: number;
  readonly autonomyLevel?: 'autonomous' | 'autonomous_with_review' | 'supervised' | 'human_in_the_loop';
  readonly lastScoredAt?: ISO8601;
}
export interface PolicyDecision { readonly effect: PolicyEffect; readonly reason: string; readonly policyId: string; readonly limits?: Readonly<Record<string, number>>; readonly approvalRequestId?: EntityId; }
export interface ApprovalRequest extends AuditFields { readonly id: EntityId; readonly action: string; readonly justification: string; readonly impact: string; readonly expectedDiff?: string; readonly expiresAt: ISO8601; readonly decision?: 'approved' | 'rejected' | 'expired'; readonly approverId?: EntityId; }

export interface TokenBudget { readonly inputTokens: number; readonly outputTokens: number; readonly totalTokens: number; readonly usedTokens: number; }
export interface Sprint extends AuditFields { readonly id: EntityId; readonly objective: string; readonly includedScope: readonly string[]; readonly excludedScope: readonly string[]; readonly budget: TokenBudget; readonly completionCriteria: readonly string[]; readonly risks: readonly string[]; readonly taskIds: readonly EntityId[]; readonly evidenceIds: readonly EntityId[]; readonly status: 'planned' | 'active' | 'paused' | 'completed' | 'cancelled'; }
export interface Task extends AuditFields { readonly id: EntityId; readonly sprintId: EntityId; readonly objective: string; readonly acceptanceCriteria: readonly string[]; readonly allowedFiles: readonly string[]; readonly dependencyIds: readonly EntityId[]; readonly evidenceIds: readonly EntityId[]; readonly budget: TokenBudget; readonly status: 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled'; }
export interface Handoff extends AuditFields { readonly id: EntityId; readonly from: string; readonly to: string; readonly intent: string; readonly objective: string; readonly completedWork: readonly string[]; readonly decisions: readonly string[]; readonly constraints: readonly string[]; readonly pending: readonly string[]; readonly evidenceIds: readonly EntityId[]; readonly acceptance: readonly string[]; readonly blockers: readonly string[]; readonly nextAgent: string; }
export interface Checkpoint extends AuditFields { readonly id: EntityId; readonly runId: RunId; readonly step: number; readonly state: ExecutionState; readonly checksum: string; readonly resumable: boolean; }
export interface RuntimeMetrics { readonly attempts: number; readonly retries: number; readonly durationMs: number; readonly inputTokens: number; readonly outputTokens: number; }
export interface RuntimeRun extends AuditFields { readonly runId: RunId; readonly objective: string; readonly agent: AgentIdentity; readonly sprintId?: EntityId; readonly taskId?: EntityId; readonly policy: PolicyDecision; readonly budget: TokenBudget; readonly state: ExecutionState; readonly steps: number; readonly evidence: readonly Evidence[]; readonly changedFiles: readonly string[]; readonly metrics: RuntimeMetrics; readonly error?: ExecutionError; readonly validation?: EvaluationResult; }
export interface DomainEvent extends AuditFields { readonly id: EntityId; readonly type: string; readonly aggregateId: EntityId; readonly sequence: number; readonly payload: unknown; readonly idempotencyKey: string; }
/** `documentStatus` is the source document's own lifecycle (e.g. an ADR's accepted/superseded, a
 *  spec's draft/approved) — deliberately not `status: KnowledgeStatus`, which grades the epistemic
 *  confidence of a *relation*, not a document's lifecycle. Keep the two vocabularies separate. */
export interface GraphNode extends AuditFields { readonly id: EntityId; readonly type: string; readonly label: string; readonly status: KnowledgeStatus; readonly validFrom?: ISO8601; readonly validTo?: ISO8601; readonly documentStatus?: string; }
export interface GraphEdge extends AuditFields { readonly id: EntityId; readonly from: EntityId; readonly to: EntityId; readonly type: string; readonly status: KnowledgeStatus; readonly confidence: number; readonly evidenceIds: readonly EntityId[]; readonly validFrom?: ISO8601; readonly validTo?: ISO8601; }
export interface GraphEvidence { readonly edgeId: EntityId; readonly evidence: readonly Evidence[]; }
export interface Contradiction { readonly id: EntityId; readonly claimIds: readonly EntityId[]; readonly reason: string; readonly evidenceIds: readonly EntityId[]; }
export interface ContextMetrics { readonly candidateCount: number; readonly selectedCount: number; readonly deduplicatedCount: number; readonly cacheHits: number; readonly selectedTokens: number; readonly unusedTokens: number; }
export interface ContextPackage extends AuditFields { readonly id: EntityId; readonly references: readonly Evidence[]; readonly content: readonly string[]; readonly budget: TokenBudget; readonly checksum: string; readonly metrics: ContextMetrics; }
export interface SuggestedAction { readonly id: EntityId; readonly reason: string; readonly priority: number; readonly risk: RiskLevel; readonly capabilityId?: CapabilityId; readonly dependencyIds: readonly EntityId[]; readonly evidenceIds: readonly EntityId[]; readonly approvalRequired: boolean; }
export interface PlanStep extends AuditFields { readonly id: EntityId; readonly objective: string; readonly acceptanceCriteria: readonly string[]; readonly allowedFiles: readonly string[]; readonly dependencyIds: readonly EntityId[]; readonly evidenceIds: readonly EntityId[]; readonly risk: RiskLevel; readonly budget: TokenBudget; readonly status: 'planned' | 'ready' | 'completed' | 'blocked'; }
export interface ExecutionPlan extends AuditFields { readonly id: EntityId; readonly objective: string; readonly steps: readonly PlanStep[]; readonly budget: TokenBudget; readonly risk: RiskLevel; readonly evidenceIds: readonly EntityId[]; }
export interface EvaluationResult extends AuditFields { readonly status: 'accepted' | 'rejected' | 'inconclusive' | 'blocked'; readonly checks: readonly { readonly name: string; readonly passed: boolean; readonly evidenceIds: readonly EntityId[] }[]; readonly summary: string; }
export interface SandboxSession extends AuditFields { readonly id: EntityId; readonly runId: RunId; readonly backend: 'git_worktree' | 'temporary_directory' | 'docker'; readonly root: string; readonly state: SandboxState; readonly promoted: boolean; }
export interface SandboxCommand { readonly executable: string; readonly args: readonly string[]; readonly cwd?: string; readonly env?: Readonly<Record<string, string>>; }
export interface SandboxExecution extends AuditFields { readonly sessionId: EntityId; readonly command: SandboxCommand; readonly exitCode: number; readonly stdout: string; readonly stderr: string; readonly durationMs: number; readonly evidenceIds: readonly EntityId[]; }
export interface SandboxDiff extends AuditFields { readonly sessionId: EntityId; readonly checksum: string; readonly files: readonly string[]; readonly additions: number; readonly deletions: number; readonly evidenceIds: readonly EntityId[]; }
export interface AuditRecord extends AuditFields { readonly id: EntityId; readonly action: string; readonly aggregateId: EntityId; readonly outcome: 'success' | 'failure' | 'blocked'; readonly evidenceIds: readonly EntityId[]; readonly details: Readonly<Record<string, string>>; }
export interface Observation extends AuditFields { readonly id: EntityId; readonly traceId: string; readonly runId?: RunId; readonly agentId?: EntityId; readonly taskId?: EntityId; readonly sprintId?: EntityId; readonly capabilityId?: CapabilityId; readonly model?: string; readonly inputHash?: string; readonly contextRefs: readonly string[]; readonly inputTokens: number; readonly outputTokens: number; readonly durationMs: number; readonly cost?: number; readonly tools: readonly string[]; readonly files: readonly string[]; readonly commands: readonly string[]; readonly validationStatus?: EvaluationResult['status']; readonly outcome: 'succeeded' | 'failed' | 'blocked' | 'inconclusive'; readonly errorCode?: string; }
export interface ControlPlaneMetrics { readonly observationCount: number; readonly runCount: number; readonly successfulRuns: number; readonly failedRuns: number; readonly blockedRuns: number; readonly successRate: number; readonly totalInputTokens: number; readonly totalOutputTokens: number; readonly totalDurationMs: number; readonly totalCost: number; readonly cacheHitRate?: number; readonly evidenceCoverageRate: number; }
export type EvaluationScope = 'run' | 'agent' | 'task' | 'sprint' | 'capability' | 'model' | 'strategy' | 'workspace';
export interface EvaluationReport extends AuditFields {
  readonly id: EntityId;
  readonly scope: EvaluationScope;
  readonly scopeId?: string;
  readonly observationIds: readonly EntityId[];
  readonly metrics: Readonly<Record<string, number>>;
  readonly findings: readonly { readonly name: string; readonly value: number; readonly evidenceIds: readonly EntityId[] }[];
}

export class ContractValidationError extends Error {
  readonly path: string;
  constructor(path: string, message: string) { super(`${path}: ${message}`); this.name = 'ContractValidationError'; this.path = path; }
}

export function assertContract(condition: boolean, path: string, message: string): asserts condition {
  if (!condition) throw new ContractValidationError(path, message);
}

export function validateTokenBudget(value: TokenBudget): TokenBudget {
  assertContract(Number.isInteger(value.inputTokens) && value.inputTokens >= 0, 'budget.inputTokens', 'must be a non-negative integer');
  assertContract(Number.isInteger(value.outputTokens) && value.outputTokens >= 0, 'budget.outputTokens', 'must be a non-negative integer');
  assertContract(value.totalTokens === value.inputTokens + value.outputTokens, 'budget.totalTokens', 'must equal inputTokens + outputTokens');
  assertContract(Number.isInteger(value.usedTokens) && value.usedTokens >= 0 && value.usedTokens <= value.totalTokens, 'budget.usedTokens', 'must be within totalTokens');
  return value;
}

/**
 * True only when `candidate` resolves inside `root` (or equals it). Uses `path.relative` +
 * separator-boundary check rather than `String.startsWith(root)`, which a sibling path
 * (`/root-evil`) or an unresolved `..` segment can satisfy without ever being inside `root`.
 * Both arguments should already be absolute; relative inputs are resolved against `process.cwd()`.
 */
export function isPathWithinRoot(root: string, candidate: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  const relative = path.relative(resolvedRoot, resolvedCandidate);
  return relative.length === 0 || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export function validateCapabilityDefinition(value: CapabilityDefinition): CapabilityDefinition {
  assertContract(value.schemaVersion === CONTRACT_VERSION, 'schemaVersion', `must be ${CONTRACT_VERSION}`);
  assertContract(/^[-a-z0-9]+(?:\.[-a-z0-9]+)+$/.test(value.id), 'id', 'must be a namespaced capability id');
  assertContract(value.version.length > 0, 'version', 'is required');
  assertContract(value.description.trim().length > 0, 'description', 'is required');
  assertContract(Number.isInteger(value.timeoutMs) && value.timeoutMs > 0, 'timeoutMs', 'must be a positive integer');
  assertContract(Number.isInteger(value.retry.maxAttempts) && value.retry.maxAttempts >= 1, 'retry.maxAttempts', 'must be at least 1');
  assertContract(Number.isInteger(value.retry.backoffMs) && value.retry.backoffMs >= 0, 'retry.backoffMs', 'must be non-negative');
  return value;
}
