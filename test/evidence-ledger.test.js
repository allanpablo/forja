import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildEvidenceLedger } from '../packages/engineering/evidence/src/index.ts';

const now = '2026-09-01T00:00:00.000Z';
const agent = { id: 'agent-1', name: 'worker', role: 'developer', autonomy: 'supervised' };

function baseRun(overrides = {}) {
  return {
    schemaVersion: '2.0', createdAt: now, updatedAt: now, correlationId: 'run-1',
    runId: 'run-1', objective: 'extrai isPathWithinRoot', agent, policy: { effect: 'ALLOW', reason: 'ok', policyId: 'p1' },
    budget: { totalTokens: 1000, usedTokens: 0 }, state: 'completed', steps: 3,
    evidence: [], changedFiles: ['packages/contracts/src/index.ts'],
    metrics: { tokensUsed: 100, durationMs: 500 },
    ...overrides,
  };
}

test('buildEvidenceLedger: mapeia run/intent/agent sem inventar campos opcionais ausentes', () => {
  const record = buildEvidenceLedger({ run: baseRun(), auditRecords: [], approvals: [] });
  assert.equal(record.run.runId, 'run-1');
  assert.equal(record.intent, 'extrai isPathWithinRoot');
  assert.deepEqual(record.agent, agent);
  assert.equal('architectureCheck' in record, false, 'campo opcional ausente não deve aparecer, nem como null');
  assert.equal('risk' in record, false);
  assert.equal('tests' in record, false);
  assert.equal('commit' in record, false);
  assert.deepEqual(record.auditRecords, []);
  assert.deepEqual(record.approvals, []);
});

test('buildEvidenceLedger: run.validation vira tests quando presente', () => {
  const validation = { schemaVersion: '2.0', createdAt: now, updatedAt: now, correlationId: 'run-1', status: 'accepted', checks: [{ name: 'unit', passed: true, evidenceIds: [] }], summary: 'ok' };
  const record = buildEvidenceLedger({ run: baseRun({ validation }), auditRecords: [], approvals: [] });
  assert.deepEqual(record.tests, validation);
});

test('buildEvidenceLedger: architectureCheck e risk passam através sem transformação', () => {
  const architectureCheck = { compliant: 1, violations: [] };
  const riskAssessment = { id: 'a1', changeId: 'run-1', createdAt: now, score: 10, confidence: 1, autonomyBand: 'autonomous', factors: [] };
  const record = buildEvidenceLedger({ run: baseRun(), auditRecords: [], approvals: [], architectureCheck, riskAssessment });
  assert.deepEqual(record.architectureCheck, architectureCheck);
  assert.deepEqual(record.risk, riskAssessment);
});

test('buildEvidenceLedger: auditRecords/approvals/commit passam através do input, sem filtro adicional', () => {
  const auditRecords = [{ schemaVersion: '2.0', createdAt: now, updatedAt: now, correlationId: 'run-1', id: 'ar1', action: 'write', aggregateId: 'run-1', outcome: 'success', evidenceIds: [], details: {} }];
  const approvals = [{ schemaVersion: '2.0', createdAt: now, updatedAt: now, correlationId: 'run-1', id: 'appr1', action: 'write', justification: 'j', impact: 'i', expiresAt: now, decision: 'approved', approverId: 'reviewer-1' }];
  const record = buildEvidenceLedger({ run: baseRun(), auditRecords, approvals, commit: 'abc1234' });
  assert.deepEqual(record.auditRecords, auditRecords);
  assert.deepEqual(record.approvals, approvals);
  assert.equal(record.commit, 'abc1234');
});
