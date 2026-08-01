import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GraphError, GraphExecutionMemory, GraphIndexer, GraphLoop, extractDeterministicRelations } from '../packages/graph/src/index.ts';

const now = '2026-07-31T00:00:00.000Z';
const node = (id, type = 'File') => ({ id, type, label: id, status: 'verified' });
const evidence = (id) => ({ id, source: 'test', locator: `test/${id}`, capturedAt: now, status: 'verified' });

function graph() {
  const value = new GraphLoop();
  value.upsertNode(node('a')); value.upsertNode(node('b')); value.upsertNode(node('c')); value.upsertNode(node('isolated'));
  value.addEvidence(evidence('e1')); value.addEvidence(evidence('e2')); value.addEvidence(evidence('e3'));
  value.upsertEdge({ from: 'a', to: 'b', type: 'DEPENDS_ON', status: 'verified', confidence: 1, evidenceIds: ['e1'] });
  value.upsertEdge({ from: 'b', to: 'c', type: 'CALLS', status: 'verified', confidence: 0.9, evidenceIds: ['e2'] });
  value.upsertEdge({ from: 'a', to: 'c', type: 'CONTRADICTS', status: 'contradicted', confidence: 1, evidenceIds: ['e3'] });
  return value;
}

test('graph: exige endpoints e evidência em toda aresta', () => {
  const value = new GraphLoop();
  value.upsertNode(node('a'));
  assert.throws(() => value.upsertEdge({ from: 'a', to: 'missing', type: 'CALLS', status: 'verified', confidence: 1, evidenceIds: ['e'] }), GraphError);
});

test('graph: path, impacto, contradições e agenda são consultáveis sem LLM', () => {
  const value = graph();
  assert.equal(value.path('a', 'c').edges.length, 2);
  assert.equal(value.impact('a', 2).nodes.length, 3);
  assert.equal(value.contradictions().length, 1);
  assert.equal(value.agenda().length, 1);
});

test('graph: arestas respeitam validade temporal', () => {
  const value = new GraphLoop();
  value.upsertNode(node('a')); value.upsertNode(node('b')); value.addEvidence(evidence('e'));
  value.upsertEdge({ from: 'a', to: 'b', type: 'DEPENDS_ON', status: 'verified', confidence: 1, evidenceIds: ['e'], validFrom: '2026-08-01T00:00:00.000Z' });
  assert.equal(value.path('a', 'b', 2, now), undefined);
  assert.equal(value.path('a', 'b', 2, '2026-08-02T00:00:00.000Z').edges.length, 1);
});

test('graph: sync incremental é idempotente por source checksum', () => {
  const value = new GraphLoop();
  const mutation = { sourceKey: 'src/file.ts', sourceChecksum: 'checksum', nodes: [node('a'), node('b')], evidence: [evidence('e')], edges: [{ from: 'a', to: 'b', type: 'DEPENDS_ON', status: 'verified', confidence: 1, evidenceIds: ['e'] }] };
  assert.equal(value.apply(mutation).skipped, false);
  assert.equal(value.apply(mutation).skipped, true);
});

test('graph: extractor determinístico cria imports, links e evidências', () => {
  const mutation = extractDeterministicRelations({ nodeId: 'source', locator: 'src/a.ts', capturedAt: now, content: "import x from './b.ts';\nVeja [spec](../spec.md)." });
  assert.equal(mutation.edges.length, 2);
  assert.equal(mutation.evidence.length, 2);
  assert.ok(mutation.edges.every((edge) => edge.evidenceIds.length > 0));
});

test('graph: extractor cria símbolos, chamadas, ADRs, tarefas, testes e agents', () => {
  const mutation = extractDeterministicRelations({ nodeId: 'source-rich', locator: 'docs/feature.md', capturedAt: now, content: '# Feature\nADR-0041\n- [x] Implement validator\n- **to**: validator-agent\nexport function validate() { parse(); }\ndescribe("validator accepts input", () => test("happy path", () => {}));' });
  const types = mutation.nodes.map((item) => item.type);
  assert.ok(types.includes('ADR'));
  assert.ok(types.includes('Task'));
  assert.ok(types.includes('Agent'));
  assert.ok(types.includes('Symbol'));
  assert.ok(types.includes('Test'));
  assert.ok(mutation.edges.some((edge) => edge.type === 'CALLS'));
  assert.ok(mutation.edges.every((edge) => edge.evidenceIds.length > 0));
});

test('graph: extractor lê dependências de package manifest e ignora JSON inválido', () => {
  const manifest = extractDeterministicRelations({ nodeId: 'package-node', locator: 'package.json', capturedAt: now, content: JSON.stringify({ dependencies: { zod: '^3.0.0' }, devDependencies: { typescript: '^5.0.0' } }) });
  assert.equal(manifest.nodes.filter((item) => item.type === 'Technology').length, 2);
  const invalid = extractDeterministicRelations({ nodeId: 'bad-package', locator: 'package.json', capturedAt: now, content: '{invalid' });
  assert.equal(invalid.edges.length, 0);
});

test('graph: memória de execução registra capability e evidência persistível', () => {
  const value = new GraphLoop();
  const memory = new GraphExecutionMemory(value);
  const evidenceItem = evidence('execution-evidence');
  memory.remember({ runId: 'run-graph', objective: 'fix test', agent: { id: 'agent-1', name: 'agent', role: 'developer', autonomy: 'supervised' }, policy: { effect: 'ALLOW', reason: 'test', policyId: 'policy-1' }, budget: { inputTokens: 10, outputTokens: 10, totalTokens: 20, usedTokens: 1 }, state: 'running', steps: 1, evidence: [], changedFiles: ['tests/failing.test.js'], metrics: { attempts: 1, retries: 0, durationMs: 1, inputTokens: 1, outputTokens: 0 }, ...{ schemaVersion: '2.0', createdAt: now, updatedAt: now, correlationId: 'run-graph' } }, { schemaVersion: '2.0', createdAt: now, updatedAt: now, correlationId: 'result-graph', runId: 'run-graph', status: 'succeeded', output: { capabilityId: 'fixture.fix-test', payload: {}, evidence: [evidenceItem] }, evidence: [evidenceItem] });
  assert.equal(value.path('execution:run-graph', 'capability:fixture.fix-test').edges.length, 1);
  assert.equal(value.query({ type: 'Execution' }).length, 1);
});

test('graph: indexador aplica documentos e pula checksum repetido', async () => {
  const graph = new GraphLoop();
  const indexer = new GraphIndexer(graph);
  const source = { listDocuments: () => [{ nodeId: 'document-indexed', locator: 'src/index.ts', capturedAt: now, content: "import { value } from './value.ts';\nexport function read() { return value(); }" }] };
  const first = await indexer.sync(source);
  const second = await indexer.sync(source);
  assert.equal(first.documents, 1);
  assert.equal(first.indexed, 1);
  assert.equal(first.edges > 0, true);
  assert.equal(second.skipped, 1);
  assert.equal(graph.query({ type: 'File' }).length >= 2, true);
});
