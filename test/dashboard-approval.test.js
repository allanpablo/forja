import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApprovalDecisionBody } from '../apps/dashboard/app/api/forja/approval.ts';
import { isCallerAuthorized, matchesAllowedPrefix } from '../apps/dashboard/app/api/forja/guard.ts';

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

test('isCallerAuthorized fecha por padrão quando FORJA_DASHBOARD_TOKEN não está configurado', () => {
  const request = new Request('http://localhost/api/forja/approvals', { headers: { 'x-forja-dashboard-token': 'anything' } });
  assert.equal(isCallerAuthorized(request, undefined), false, 'sem token configurado não deve ser allow-all');
  assert.equal(isCallerAuthorized(request, ''), false);
});

test('isCallerAuthorized aceita o header configurado e rejeita credencial errada ou ausente', () => {
  const withHeader = new Request('http://localhost/api/forja/approvals', { headers: { 'x-forja-dashboard-token': 'right-token' } });
  assert.equal(isCallerAuthorized(withHeader, 'right-token'), true);
  const withWrongHeader = new Request('http://localhost/api/forja/approvals', { headers: { 'x-forja-dashboard-token': 'wrong-token' } });
  assert.equal(isCallerAuthorized(withWrongHeader, 'right-token'), false);
  const withoutHeader = new Request('http://localhost/api/forja/approvals');
  assert.equal(isCallerAuthorized(withoutHeader, 'right-token'), false);
});

test('isCallerAuthorized aceita o token via cookie quando não há header', () => {
  const withCookie = new Request('http://localhost/api/forja/approvals', { headers: { cookie: 'other=1; forja_dashboard_token=right-token; another=2' } });
  assert.equal(isCallerAuthorized(withCookie, 'right-token'), true);
  const withWrongCookie = new Request('http://localhost/api/forja/approvals', { headers: { cookie: 'forja_dashboard_token=wrong-token' } });
  assert.equal(isCallerAuthorized(withWrongCookie, 'right-token'), false);
});
