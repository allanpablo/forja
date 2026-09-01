import {
  CONTRACT_VERSION,
  type Contradiction,
  type EntityId,
  type EvaluationResult,
  type ExecutionPlan,
  type ISO8601,
} from '../../contracts/src/index.ts';

export interface ValidationCheckInput {
  readonly name: string;
  readonly passed: boolean;
  readonly evidenceIds: readonly EntityId[];
  readonly detail?: string;
}

export interface AcceptanceResult {
  readonly criterion: string;
  readonly passed: boolean;
  readonly evidenceIds: readonly EntityId[];
}

export interface SecurityFinding {
  readonly id: EntityId;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly message: string;
  readonly evidenceIds: readonly EntityId[];
}

export interface ValidationRequest {
  readonly plan: ExecutionPlan;
  readonly changedFiles: readonly string[];
  readonly checks: readonly ValidationCheckInput[];
  readonly acceptance: readonly AcceptanceResult[];
  readonly contradictions?: readonly Contradiction[];
  readonly securityFindings?: readonly SecurityFinding[];
  readonly blockers?: readonly string[];
  readonly requiredChecks?: readonly string[];
  readonly correlationId?: string;
}

export class ValidatorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidatorError';
  }
}

export class DeterministicValidator {
  /**
   * A `passed: true` claim with no evidenceIds is unsubstantiated: this validator has no way to
   * confirm the check actually ran (it never executes build/test/lint/typecheck itself — it only
   * aggregates what the caller reports), so an evidence-free "passed" is treated as not passed
   * rather than taken on faith. The internally-computed `scope` check is exempt: it's derived
   * here from `changedFiles`/`plan`, not asserted by the caller, so it needs no evidence pointer.
   */
  private substantiated(item: { readonly passed: boolean; readonly evidenceIds: readonly EntityId[] }): boolean {
    return item.passed && item.evidenceIds.length > 0;
  }

  validate(request: ValidationRequest): EvaluationResult {
    const required = request.requiredChecks ?? ['build', 'tests', 'lint', 'typecheck'];
    const scopeCheckName = 'scope';
    const allowedFiles = request.plan.steps.flatMap((step) => step.allowedFiles);
    const outOfScope = request.changedFiles.filter((file) => !allowedFiles.some((allowed) => allowed === file || allowed === '*' || (allowed.endsWith('/') && file.startsWith(allowed))));
    const scopeCheck: ValidationCheckInput = { name: scopeCheckName, passed: outOfScope.length === 0, evidenceIds: [], detail: outOfScope.length === 0 ? 'All changed files are within plan scope' : `Out of scope: ${outOfScope.join(', ')}` };
    const checks = [...request.checks, scopeCheck];
    // A validation that reports zero checks and zero acceptance results proves nothing, no matter
    // how empty `requiredChecks` is set — without this, an empty `checks`/`acceptance`/
    // `requiredChecks` trio sails straight through every other condition below as "accepted".
    const noWorkReported = request.checks.length === 0 && request.acceptance.length === 0;
    const missingChecks = required.filter((name) => !request.checks.some((check) => check.name === name));
    const failedChecks = checks.filter((check) => check.name === scopeCheckName ? !check.passed : !this.substantiated(check));
    const missingAcceptance = request.plan.steps.flatMap((step) => step.acceptanceCriteria).filter((criterion) => !request.acceptance.some((result) => result.criterion === criterion));
    const failedAcceptance = request.acceptance.filter((result) => !this.substantiated(result));
    const contradictions = request.contradictions ?? [];
    const securityFindings = request.securityFindings ?? [];
    const severeSecurity = securityFindings.filter((finding) => finding.severity === 'high' || finding.severity === 'critical');
    const evidenceIds = [...new Set([
      ...checks.flatMap((check) => check.evidenceIds),
      ...request.acceptance.flatMap((result) => result.evidenceIds),
      ...contradictions.flatMap((item) => item.evidenceIds),
      ...securityFindings.flatMap((item) => item.evidenceIds),
    ])];
    let status: EvaluationResult['status'] = 'accepted';
    if ((request.blockers?.length ?? 0) > 0) status = 'blocked';
    else if (outOfScope.length > 0 || failedChecks.length > 0 || failedAcceptance.length > 0 || contradictions.length > 0 || severeSecurity.length > 0) status = 'rejected';
    else if (missingChecks.length > 0 || missingAcceptance.length > 0 || noWorkReported) status = 'inconclusive';
    const now = new Date().toISOString() as ISO8601;
    return {
      schemaVersion: CONTRACT_VERSION,
      createdAt: now,
      updatedAt: now,
      correlationId: request.correlationId ?? request.plan.id,
      status,
      checks: [
        ...checks.map(({ name, passed, evidenceIds }) => ({ name, passed: name === scopeCheckName ? passed : this.substantiated({ passed, evidenceIds }), evidenceIds })),
        { name: 'acceptance', passed: failedAcceptance.length === 0 && missingAcceptance.length === 0, evidenceIds: request.acceptance.flatMap((result) => result.evidenceIds) },
        { name: 'contradictions', passed: contradictions.length === 0, evidenceIds: contradictions.flatMap((item) => item.evidenceIds) },
        { name: 'security', passed: severeSecurity.length === 0, evidenceIds: severeSecurity.flatMap((item) => item.evidenceIds) },
      ],
      summary: this.summary(status, missingChecks, missingAcceptance, outOfScope, evidenceIds.length),
    };
  }

  private summary(status: EvaluationResult['status'], missingChecks: readonly string[], missingAcceptance: readonly string[], outOfScope: readonly string[], evidenceCount: number): string {
    const details = [
      missingChecks.length > 0 ? `missing checks: ${missingChecks.join(', ')}` : '',
      missingAcceptance.length > 0 ? `missing criteria: ${missingAcceptance.join('; ')}` : '',
      outOfScope.length > 0 ? `out of scope: ${outOfScope.join(', ')}` : '',
      `evidence: ${evidenceCount}`,
    ].filter(Boolean);
    return `${status}${details.length > 0 ? ` (${details.join(' | ')})` : ''}`;
  }
}
