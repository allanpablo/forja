export function buildApprovalDecisionBody(input: unknown, approverId: string, decidedAt: string): Record<string, unknown> {
  if (!isRecord(input) || (input.decision !== 'approved' && input.decision !== 'rejected')) throw new Error('Approval decision must be approved or rejected');
  if (approverId.trim().length === 0) throw new Error('FORJA_APPROVER_ID is required');
  return { decision: input.decision, approverId, decidedAt };
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }
