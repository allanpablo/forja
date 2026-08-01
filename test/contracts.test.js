import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ContractValidationError, validateCapabilityDefinition, validateTokenBudget } from '../packages/contracts/src/index.ts';

const budget = { inputTokens: 100, outputTokens: 50, totalTokens: 150, usedTokens: 20 };

test('contracts: valida orçamento determinístico', () => {
  assert.deepEqual(validateTokenBudget(budget), budget);
  assert.throws(() => validateTokenBudget({ ...budget, totalTokens: 149 }), ContractValidationError);
});

test('contracts: rejeita capability sem namespace e timeout válido', () => {
  const definition = {
    schemaVersion: '2.0', createdAt: '2026-07-31T00:00:00.000Z', updatedAt: '2026-07-31T00:00:00.000Z', correlationId: 'test',
    id: 'invalid', version: '1.0.0', description: 'test', permissions: [], risk: 'low', sideEffects: [], requirements: [],
    supportsAutonomy: false, idempotent: true, timeoutMs: 1000, retry: { maxAttempts: 1, backoffMs: 0 }, aliases: [],
  };
  assert.throws(() => validateCapabilityDefinition(definition), /id: must be a namespaced capability id/);
});
