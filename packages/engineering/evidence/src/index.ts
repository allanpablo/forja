/**
 * @forja/engineering-evidence — Engineering Evidence Ledger (SPEC-035).
 *
 * Não é uma fonte de dado nova: `buildEvidenceLedger` é um mapeamento puro sobre um `RuntimeRun`
 * + `AuditRecord`/`ApprovalRequest` já persistidos (packages/contracts, packages/adapter-sqlite)
 * e, opcionalmente, um `ArchitectureCheckReport` (SPEC-033) / `ChangeRiskAssessment` (SPEC-034) já
 * calculados em outro lugar. Nada aqui busca dado sozinho (isso é `scripts/evidence.ts`) e nada
 * aqui inventa um campo que não veio no input — reflete só o que os componentes já disseram (D3
 * do plan, mesmo princípio de AC-3 em `forja engineer`).
 */

import type { AgentIdentity, ApprovalRequest, AuditRecord, EvaluationResult, RuntimeRun } from '../../../contracts/src/index.ts';
import type { ArchitectureCheckReport } from '../../architecture/src/index.ts';
import type { ChangeRiskAssessment } from '../../risk/src/index.ts';

export interface EvidenceLedgerInput {
  readonly run: RuntimeRun;
  readonly auditRecords: readonly AuditRecord[];
  readonly approvals: readonly ApprovalRequest[];
  readonly architectureCheck?: ArchitectureCheckReport;
  readonly riskAssessment?: ChangeRiskAssessment;
  readonly commit?: string;
}

export interface EvidenceLedgerRunSummary {
  readonly runId: string;
  readonly state: string;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly steps: number;
  readonly changedFiles: readonly string[];
}

export interface EvidenceLedgerRecord {
  readonly run: EvidenceLedgerRunSummary;
  readonly intent: string;
  readonly agent: AgentIdentity;
  readonly architectureCheck?: ArchitectureCheckReport;
  readonly risk?: ChangeRiskAssessment;
  readonly tests?: EvaluationResult;
  readonly auditRecords: readonly AuditRecord[];
  readonly approvals: readonly ApprovalRequest[];
  readonly commit?: string;
}

export function buildEvidenceLedger(input: EvidenceLedgerInput): EvidenceLedgerRecord {
  const { run } = input;
  return {
    run: {
      runId: run.runId,
      state: run.state,
      startedAt: run.createdAt,
      updatedAt: run.updatedAt,
      steps: run.steps,
      changedFiles: run.changedFiles,
    },
    intent: run.objective,
    agent: run.agent,
    ...(input.architectureCheck === undefined ? {} : { architectureCheck: input.architectureCheck }),
    ...(input.riskAssessment === undefined ? {} : { risk: input.riskAssessment }),
    ...(run.validation === undefined ? {} : { tests: run.validation }),
    auditRecords: input.auditRecords,
    approvals: input.approvals,
    ...(input.commit === undefined ? {} : { commit: input.commit }),
  };
}
