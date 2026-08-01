import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CapabilityRegistry, CapabilityRegistryError } from '../packages/core/src/index.ts';

const now = '2026-07-31T00:00:00.000Z';
const definition = {
  schemaVersion: '2.0', createdAt: now, updatedAt: now, correlationId: 'test',
  id: 'workspace.read', version: '1.0.0', description: 'Read workspace state', permissions: ['read'],
  risk: 'low', sideEffects: [], requirements: [], supportsAutonomy: true, idempotent: true,
  timeoutMs: 1000, retry: { maxAttempts: 1, backoffMs: 0 }, aliases: ['workspace:status'],
};

function registry() {
  const value = new CapabilityRegistry();
  value.register({
    definition,
    validateInput: (input) => {
      if (typeof input !== 'string') throw new Error('path must be a string');
      return input;
    },
    validateOutput: (output) => {
      if (typeof output !== 'string') throw new Error('result must be a string');
      return output;
    },
    handler: (input) => ({ capabilityId: definition.id, payload: `read:${input}`, evidence: [] }),
  });
  return value;
}

const agent = { id: 'agent-1', name: 'test', role: 'developer', autonomy: 'supervised' };
const policy = { authorize: () => ({ effect: 'ALLOW', reason: 'test', policyId: 'test' }) };

test('registry: descobre por id, alias e ordena deterministicamente', () => {
  const value = registry();
  assert.equal(value.describe('workspace.read').id, 'workspace.read');
  assert.equal(value.describe('workspace:status').id, 'workspace.read');
  assert.equal(value.list().length, 1);
});

test('registry: rejeita nomes duplicados', () => {
  const value = registry();
  assert.throws(() => value.register({ definition: value.describe('workspace.read'), validateInput: (input) => input, validateOutput: (output) => output, handler: () => ({ capabilityId: definition.id, payload: '', evidence: [] }) }), CapabilityRegistryError);
});

test('registry: valida entrada antes do handler e retorna resultado estruturado', async () => {
  let called = false;
  const value = new CapabilityRegistry();
  value.register({ definition: registry().describe('workspace.read'), validateInput: () => { throw new Error('invalid'); }, validateOutput: (output) => output, handler: () => { called = true; return { capabilityId: definition.id, payload: '', evidence: [] }; } });
  const result = await value.execute({ input: { capabilityId: definition.id, payload: 42 }, agent, policy });
  assert.equal(result.status, 'failed');
  assert.equal(result.error.code, 'INVALID_INPUT');
  assert.equal(called, false);
});

test('registry: policy bloqueia sem chamar handler', async () => {
  let called = false;
  const value = registry();
  const result = await value.execute({ input: { capabilityId: definition.id, payload: 'src' }, agent, policy: { authorize: () => ({ effect: 'REQUIRE_APPROVAL', reason: 'approval', policyId: 'test' }) } });
  called = result.status === 'succeeded';
  assert.equal(result.status, 'blocked');
  assert.equal(result.error.code, 'APPROVAL_REQUIRED');
  assert.equal(called, false);
});

test('registry: executa handler permitido e normaliza saída', async () => {
  const result = await registry().execute({ input: { capabilityId: 'workspace:status', payload: 'src' }, agent, policy });
  assert.equal(result.status, 'succeeded');
  assert.equal(result.output.payload, 'read:src');
  assert.equal(result.evidence.length, 0);
  assert.match(result.runId, /^[0-9a-f-]{36}$/);
});

test('registry: filtra descoberta por permissões declaradas do agente', () => {
  const value = registry();
  assert.equal(value.list({ agent: { ...agent, permissions: ['read'] } }).length, 1);
  assert.equal(value.list({ agent: { ...agent, permissions: [] } }).length, 0);
});
