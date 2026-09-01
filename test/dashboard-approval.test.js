import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApprovalDecisionBody } from '../apps/dashboard/app/api/forja/approval.ts';
import { matchesAllowedPrefix } from '../apps/dashboard/app/api/forja/guard.ts';

test('dashboard proxy injects server-side approver identity', () => {
  const result = buildApprovalDecisionBody({ decision: 'approved', approverId: 'attacker' }, 'configured-user', '2026-08-01T00:00:00.000Z');
  assert.deepEqual(result, { decision: 'approved', approverId: 'configured-user', decidedAt: '2026-08-01T00:00:00.000Z' });
});

test('dashboard proxy rejects invalid approval configuration', () => {
  assert.throws(() => buildApprovalDecisionBody({ decision: 'approved' }, '', '2026-08-01T00:00:00.000Z'), /FORJA_APPROVER_ID/);
  assert.throws(() => buildApprovalDecisionBody({ decision: 'maybe' }, 'configured-user', '2026-08-01T00:00:00.000Z'), /approved or rejected/);
});

test('matchesAllowedPrefix rejeita sufixo que apenas compartilha a string do prefixo', () => {
  assert.equal(matchesAllowedPrefix('/control-plane/metrics-extra', '/control-plane/metrics'), false, 'startsWith ingênuo aceitaria isso');
  assert.equal(matchesAllowedPrefix('/approvalsxyz', '/approvals'), false);
});

test('matchesAllowedPrefix aceita o prefixo exato e caminhos aninhados', () => {
  assert.equal(matchesAllowedPrefix('/control-plane/metrics', '/control-plane/metrics'), true);
  assert.equal(matchesAllowedPrefix('/control-plane/metrics/sub', '/control-plane/metrics'), true);
  assert.equal(matchesAllowedPrefix('/executions/run-1', '/executions/'), true);
  assert.equal(matchesAllowedPrefix('/executions', '/executions/'), false, 'mantém o comportamento original: prefixo com barra exige algo depois');
});
