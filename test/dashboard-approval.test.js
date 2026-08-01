import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApprovalDecisionBody } from '../apps/dashboard/app/api/forja/approval.ts';

test('dashboard proxy injects server-side approver identity', () => {
  const result = buildApprovalDecisionBody({ decision: 'approved', approverId: 'attacker' }, 'configured-user', '2026-08-01T00:00:00.000Z');
  assert.deepEqual(result, { decision: 'approved', approverId: 'configured-user', decidedAt: '2026-08-01T00:00:00.000Z' });
});

test('dashboard proxy rejects invalid approval configuration', () => {
  assert.throws(() => buildApprovalDecisionBody({ decision: 'approved' }, '', '2026-08-01T00:00:00.000Z'), /FORJA_APPROVER_ID/);
  assert.throws(() => buildApprovalDecisionBody({ decision: 'maybe' }, 'configured-user', '2026-08-01T00:00:00.000Z'), /approved or rejected/);
});
