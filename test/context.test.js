import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ContextEngine, ContextEngineError, InMemoryContextCache } from '../packages/context/src/index.ts';

const now = '2026-07-31T00:00:00.000Z';
const evidence = (id, locator) => ({ id, source: 'test', locator, capturedAt: now, status: 'verified' });
const candidate = (id, content, relevance, overrides = {}) => ({ id, source: 'memory', locator: `memory/${id}.md`, content, relevance, status: 'verified', evidence: [evidence(`e-${id}`, `memory/${id}.md`)], ...overrides });
const budget = { inputTokens: 100, outputTokens: 0, totalTokens: 100, usedTokens: 0 };

test('context: seleciona por relevância, remove obsoletos e deduplica checksum', async () => {
  const cache = new InMemoryContextCache();
  const engine = new ContextEngine({ memory: { search: () => [{ ...candidate('high', 'important evidence', 10), checksum: 'same' }, { ...candidate('duplicate', 'important evidence', 9), checksum: 'same' }, candidate('obsolete', 'old', 100, { obsolete: true }), candidate('contradicted', 'bad', 100, { status: 'contradicted' })] }, cache });
  const pack = await engine.build({ objective: 'task', budget, correlationId: 'context-test' });
  assert.equal(pack.content.length, 1);
  assert.equal(pack.metrics.candidateCount, 2);
  assert.equal(pack.metrics.deduplicatedCount, 1);
  assert.equal(pack.metrics.selectedTokens > 0, true);
  assert.equal(pack.references.length, 1);
});

test('context: cacheia por checksum e expande conteúdo sob demanda', async () => {
  const cache = new InMemoryContextCache();
  const item = { ...candidate('cached', 'cached context', 1), checksum: 'checksum-1' };
  const engine = new ContextEngine({ memory: { search: () => [item] }, cache });
  const first = await engine.build({ objective: 'task', budget, includeContent: false });
  const second = await engine.build({ objective: 'task', budget });
  assert.deepEqual(first.content, []);
  assert.equal(first.metrics.cacheHits, 0);
  assert.equal(second.metrics.cacheHits, 1);
  assert.equal(engine.expand('checksum-1'), 'cached context');
});

test('context: respeita orçamento e falha quando nenhuma evidência cabe', async () => {
  const engine = new ContextEngine({ memory: { search: () => [candidate('large', 'this content is larger than one token budget', 1)] } });
  await assert.rejects(() => engine.build({ objective: 'task', budget: { inputTokens: 1, outputTokens: 0, totalTokens: 1, usedTokens: 0 } }), (error) => error instanceof ContextEngineError && error.code === 'CONTEXT_BUDGET_EXCEEDED');
});

test('context: exige evidência atual e rejeita cache ausente na expansão', async () => {
  const empty = new ContextEngine({ memory: { search: () => [] } });
  await assert.rejects(() => empty.build({ objective: 'missing', budget }), (error) => error instanceof ContextEngineError && error.code === 'INSUFFICIENT_EVIDENCE');
  assert.throws(() => empty.expand('missing'), (error) => error instanceof ContextEngineError && error.code === 'CONTENT_NOT_CACHED');
});
