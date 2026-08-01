import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GraphError, GraphLoop, extractDeterministicRelations } from '../packages/graph/src/index.ts';

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
