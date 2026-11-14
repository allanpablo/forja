import { test } from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { ContextEngine, ContextEngineError, GraphContextSource, InMemoryContextCache } from '../packages/context/src/index.ts';
import { GraphLoop } from '../packages/graph/src/index.ts';

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

test('context: itens preservam proveniência e incerteza sem expor conteúdo omitido', async () => {
  const item = candidate('uncertain', 'hipótese sensível', 1, { status: 'hypothesis', checksum: 'external' });
  const engine = new ContextEngine({ memory: { search: () => [item] } });
  const visible = await engine.build({ objective: 'task', budget });
  assert.deepEqual(visible.items, [{ id: item.id, source: item.source, locator: item.locator, content: item.content, checksum: createHash('sha256').update(item.content).digest('hex'), status: item.status, evidence: item.evidence }]);
  const hidden = await engine.build({ objective: 'task', budget, includeContent: false });
  assert.deepEqual(hidden.content, []);
  assert.equal(Object.hasOwn(hidden.items[0], 'content'), false);
  assert.equal(JSON.stringify(hidden).includes(item.content), false);
});

test('context: checksum de conteúdo detecta mudança mesmo com checksum externo repetido', async () => {
  let content = 'first content';
  const cache = new InMemoryContextCache();
  const engine = new ContextEngine({ memory: { search: () => [candidate('changing', content, 1, { checksum: 'supplied' })] }, cache });
  const first = await engine.build({ objective: 'task', budget });
  content = 'new content';
  const second = await engine.build({ objective: 'task', budget });
  assert.notEqual(first.items[0].checksum, second.items[0].checksum);
  assert.notEqual(first.checksum, second.checksum);
  assert.equal(second.items[0].checksum, createHash('sha256').update(content).digest('hex'));
  assert.equal(engine.expand(second.items[0].checksum), content);
  assert.equal(engine.expand('supplied'), content);
});

test('context: checksum externo igual não colapsa conteúdos diferentes', async () => {
  const engine = new ContextEngine({ memory: { search: () => [candidate('one', 'first', 2, { checksum: 'same' }), candidate('two', 'second', 1, { checksum: 'same' })] } });
  const result = await engine.build({ objective: 'task', budget });
  assert.deepEqual(result.content, ['first', 'second']);
  assert.equal(result.metrics.deduplicatedCount, 0);
});

test('context: itens mantêm todas as evidências associadas, inclusive incerteza com ID repetido', async () => {
  const entries = [evidence('shared', 'a'), { ...evidence('shared', 'z'), status: 'unknown' }];
  const engine = new ContextEngine({ memory: { search: () => [candidate('mixed', 'claim', 1, { evidence: entries })] } });
  const result = await engine.build({ objective: 'task', budget });
  assert.deepEqual(result.items[0].evidence, entries);
});

test('context: exclui candidato com qualquer evidência contradita', async () => {
  const bad = candidate('bad', 'claim', 100, { evidence: [evidence('good', 'good'), { ...evidence('bad', 'bad'), status: 'contradicted' }] });
  const engine = new ContextEngine({ memory: { search: () => [bad, candidate('valid', 'current', 1)] } });
  const result = await engine.build({ objective: 'task', budget });
  assert.deepEqual(result.content, ['current']);
  assert.equal(result.metrics.candidateCount, 1);
});

test('context: orçamento opcional cobra bytes UTF-8 dos itens e cache não torna seleção gratuita', async () => {
  const item = candidate('budget', 'á漢字', 1);
  const engine = new ContextEngine({ memory: { search: () => [item] }, cache: new InMemoryContextCache() });
  const largeBudget = { inputTokens: 1000, outputTokens: 0, totalTokens: 1000, usedTokens: 0 };
  const pack = await engine.build({ objective: 'task', budget: largeBudget, includeProvenanceInBudget: true });
  const cost = pack.items.reduce((sum, selected) => sum + Math.ceil(Buffer.byteLength(JSON.stringify(selected), 'utf8') / 4), 0);
  assert.equal(pack.metrics.selectedTokens, cost);
  const exact = { inputTokens: cost + 3, outputTokens: 0, totalTokens: cost + 3, usedTokens: 3 };
  const cached = await engine.build({ objective: 'task', budget: exact, includeProvenanceInBudget: true });
  assert.equal(cached.metrics.selectedTokens, cost);
  assert.equal(cached.metrics.cacheHits, 1);
  assert.equal(cached.metrics.unusedTokens, 0);
  await assert.rejects(() => engine.build({ objective: 'task', budget: { ...exact, usedTokens: 4 }, includeProvenanceInBudget: true }), (error) => error.code === 'CONTEXT_BUDGET_EXCEEDED');
  const legacy = await engine.build({ objective: 'task', budget });
  assert.equal(legacy.metrics.selectedTokens, Math.ceil(Buffer.byteLength(item.content) / 4));
});

test('context: desempata candidatos e evidências independentemente da ordem da fonte', async () => {
  const items = [candidate('b', 'second', 1, { locator: 'same' }), candidate('a', 'first', 1, { locator: 'same', evidence: [evidence('z', 'z'), evidence('a', 'a')] })];
  const engine = new ContextEngine({ memory: { search: () => items } });
  const first = await engine.build({ objective: 'task', budget });
  items.reverse();
  items[0].evidence.reverse();
  const second = await engine.build({ objective: 'task', budget });
  assert.deepEqual(second.items, first.items);
  assert.deepEqual(second.references, first.references);
  assert.equal(second.checksum, first.checksum);
});

test('context: fonte GraphLoop seleciona somente relações relevantes com evidência', async () => {
  const graph = new GraphLoop();
  graph.upsertNode({ id: 'graph-context-a', type: 'File', label: 'runtime.ts', status: 'verified' });
  graph.upsertNode({ id: 'graph-context-b', type: 'File', label: 'validator.ts', status: 'verified' });
  graph.addEvidence({ id: 'graph-context-e', source: 'test', locator: 'runtime.ts:1', capturedAt: '2026-08-01T00:00:00.000Z', status: 'verified' });
  graph.upsertEdge({ from: 'graph-context-a', to: 'graph-context-b', type: 'DEPENDS_ON', status: 'verified', confidence: 1, evidenceIds: ['graph-context-e'] });
  const engine = new ContextEngine({ graph: new GraphContextSource({ searchContext: (objective) => graph.contextRecords(objective) }), cache: new InMemoryContextCache() });
  const result = await engine.build({ objective: 'runtime validator', budget: { inputTokens: 50, outputTokens: 0, totalTokens: 50, usedTokens: 0 } });
  assert.equal(result.references.length, 1);
  assert.equal(result.metrics.selectedCount, 1);
  assert.match(result.content[0], /DEPENDS_ON/);
});
