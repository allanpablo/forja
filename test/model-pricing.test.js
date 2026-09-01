import assert from 'node:assert/strict';
import test from 'node:test';
import { computeCostUsd, isPriceStale, loadPricingTable, lookupPrice, validatePricingTable, ModelPricingError } from '../lib/core/model-pricing.ts';

test('model-pricing: carrega a tabela local do repo e conhece um modelo real', () => {
  const table = loadPricingTable();
  assert.equal(table.currency, 'USD');
  const price = lookupPrice(table, 'claude:opus');
  assert.ok(price !== undefined);
  assert.ok(price.inputPer1kUsd > 0);
  assert.ok(price.outputPer1kUsd > 0);
  assert.equal(typeof price.asOf, 'string');
});

test('model-pricing: modelo desconhecido devolve undefined, nunca lança (AC-4)', () => {
  const table = loadPricingTable();
  assert.equal(lookupPrice(table, 'nao-existe:v0'), undefined);
  assert.equal(lookupPrice(table, undefined), undefined);
  assert.equal(computeCostUsd(table, 'nao-existe:v0', 1000, 1000), undefined);
});

test('model-pricing: computeCostUsd multiplica tokens de entrada/saída pelo preço por 1K, separadamente', () => {
  const table = validatePricingTable({ version: 1, currency: 'USD', prices: { 'x:y': { inputPer1kUsd: 0.01, outputPer1kUsd: 0.02, asOf: '2026-08-31' } } });
  const cost = computeCostUsd(table, 'x:y', 2000, 500);
  // 2000 tok in @ 0.01/1k = 0.02 ; 500 tok out @ 0.02/1k = 0.01 ; total 0.03
  assert.ok(Math.abs(cost - 0.03) < 1e-9);
});

test('model-pricing: rejeita tabela malformada em vez de aceitar dados inválidos silenciosamente', () => {
  assert.throws(() => validatePricingTable({ version: 1, currency: 'BRL', prices: {} }), ModelPricingError);
  assert.throws(() => validatePricingTable({ version: 1, currency: 'USD', prices: { 'x:y': { inputPer1kUsd: -1, outputPer1kUsd: 0, asOf: '2026-08-31' } } }), ModelPricingError);
  assert.throws(() => validatePricingTable({ version: 1, currency: 'USD', prices: { 'x:y': { inputPer1kUsd: 0, outputPer1kUsd: 0 } } }), ModelPricingError);
});

test('model-pricing: isPriceStale sinaliza preço não revisado há mais de 90 dias (mitigação de risco do SPEC-029)', () => {
  const fresh = { inputPer1kUsd: 0.01, outputPer1kUsd: 0.02, asOf: '2026-08-01' };
  const stale = { inputPer1kUsd: 0.01, outputPer1kUsd: 0.02, asOf: '2025-01-01' };
  const now = new Date('2026-08-31T00:00:00.000Z');
  assert.equal(isPriceStale(fresh, now), false);
  assert.equal(isPriceStale(stale, now), true);
});
