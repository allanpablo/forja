import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extractProvenance } from '../packages/engineering/provenance/src/index.ts';

const now = '2026-09-01T00:00:00.000Z';

function run(overrides = {}) {
  return {
    schemaVersion: '2.0', createdAt: now, updatedAt: now, correlationId: 'run-1',
    runId: 'run-1', objective: 'fix bug', agent: { id: 'agent-1', name: 'worker', role: 'developer', autonomy: 'supervised' },
    policy: { effect: 'ALLOW', reason: 'ok', policyId: 'p1' }, budget: { totalTokens: 100, usedTokens: 10 },
    state: 'completed', steps: 1, evidence: [], changedFiles: ['a.ts', 'b.ts'], metrics: { tokensUsed: 10, durationMs: 100 },
    ...overrides,
  };
}

test('extractProvenance: um ProvenanceRecord por changedFiles, sem inventar dado', () => {
  const records = extractProvenance(run());
  assert.equal(records.length, 2);
  assert.deepEqual(records.map((r) => r.file), ['a.ts', 'b.ts']);
  for (const record of records) {
    assert.equal(record.runId, 'run-1');
    assert.equal(record.agentId, 'agent-1');
    assert.equal(record.agentName, 'worker');
    assert.equal(record.recordedAt, now);
    assert.equal(record.lines, undefined, 'granularidade de linha não existe nesta spec (AC-2)');
    assert.equal(record.model, undefined, 'AgentIdentity não carrega modelo de LLM hoje');
  }
});

test('extractProvenance: run sem changedFiles devolve lista vazia, não erro', () => {
  const records = extractProvenance(run({ changedFiles: [] }));
  assert.deepEqual(records, []);
});
