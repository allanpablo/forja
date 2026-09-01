import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkDrift } from '../lib/drift-sentinel.ts';
import { GraphLoop, InMemoryGraphStore } from '../packages/graph/src/index.ts';

const now = '2026-08-31T00:00:00.000Z';

function documentSource(locator, content) {
  const doc = { nodeId: `node:${locator}`, locator, capturedAt: now, content };
  return { listDocuments: () => [doc] };
}

test('drift:check — documento sem mudança não gera drift', async () => {
  const store = new InMemoryGraphStore();
  const graph = new GraphLoop(store);
  const source = documentSource('src/stable.ts', "import { x } from './x.ts';\nexport function read() { return x(); }");

  const first = await checkDrift(graph, store, source);
  assert.equal(first.changed, 1);
  assert.equal(first.unchanged, 0);
  assert.equal(first.drifted, 0);

  const second = await checkDrift(graph, store, source);
  assert.equal(second.documents, 1);
  assert.equal(second.unchanged, 1);
  assert.equal(second.changed, 0);
  assert.equal(second.drifted, 0);
  assert.equal(second.details.length, 0);
});

test('drift:check — relação verified que some vira stale (validTo) e some das consultas padrão', async () => {
  const store = new InMemoryGraphStore();
  const graph = new GraphLoop(store);
  let content = "import { x } from './x.ts';\nexport function read() { return x(); }";
  const source = { listDocuments: () => [{ nodeId: 'node:src/drift.ts', locator: 'src/drift.ts', capturedAt: now, content }] };

  await checkDrift(graph, store, source);
  const dependsOnBefore = graph.query({ type: 'File', labelIncludes: './x.ts' });
  assert.equal(dependsOnBefore.length, 1);
  const targetId = dependsOnBefore[0].id;
  assert.ok(graph.path('node:src/drift.ts', targetId) !== undefined);

  // O import some do conteúdo — a relação DEPENDS_ON deixa de ser reproduzível.
  content = 'export function read() { return 1; }';
  const report = await checkDrift(graph, store, source);

  assert.equal(report.changed, 1);
  assert.equal(report.drifted, 1);
  assert.equal(report.details.length, 1);
  assert.equal(report.details[0].sourceKey, 'src/drift.ts');
  assert.ok(report.details[0].stale.some((relation) => relation.type === 'DEPENDS_ON' && relation.to === targetId));

  // A aresta some das consultas padrão (validTo já passou)...
  assert.equal(graph.path('node:src/drift.ts', targetId), undefined);
  assert.equal(graph.impact('node:src/drift.ts').nodes.some((node) => node.id === targetId), false);

  // ...mas continua inspecionável historicamente via `at`, e status continua 'verified' (SPEC-030
  // AC-2: staleness reaproveita validTo, não inventa um KnowledgeStatus novo).
  const historical = graph.path('node:src/drift.ts', targetId, 5, now);
  assert.ok(historical !== undefined);
  assert.equal(historical.edges[0].status, 'verified');
  assert.ok(historical.edges[0].validTo !== undefined);

  // Rodar de novo não duplica o carimbo: a relação já stale não aparece de novo no relatório.
  const again = await checkDrift(graph, store, source);
  assert.equal(again.unchanged, 1);
  assert.equal(again.drifted, 0);
});

test('drift:check — mudança que preserva relações antigas e soma uma nova não gera falso positivo', async () => {
  const store = new InMemoryGraphStore();
  const graph = new GraphLoop(store);
  let content = "import { x } from './x.ts';\nexport function read() { return x(); }";
  const source = { listDocuments: () => [{ nodeId: 'node:src/grow.ts', locator: 'src/grow.ts', capturedAt: now, content }] };

  await checkDrift(graph, store, source);

  // Conteúdo muda (checksum muda), mas a relação anterior (DEPENDS_ON ./x.ts) continua presente —
  // só ganha uma relação nova, não relacionada.
  content = "import { x } from './x.ts';\nimport { y } from './y.ts';\nexport function read() { return x() + y(); }";
  const report = await checkDrift(graph, store, source);

  assert.equal(report.changed, 1);
  assert.equal(report.drifted, 0);
  assert.equal(report.details.length, 0);

  const dependsOn = graph.query({ type: 'File' }).filter((node) => node.label.endsWith('.ts'));
  assert.ok(dependsOn.some((node) => node.label === './x.ts'));
  assert.ok(dependsOn.some((node) => node.label === './y.ts'));
});

test('drift:check — --domain restringe aos documentos cujo path passa pelo segmento informado', async () => {
  const store = new InMemoryGraphStore();
  const graph = new GraphLoop(store);
  const source = {
    listDocuments: () => [
      { nodeId: 'node:a', locator: 'backend/src/modules/billing/service.ts', capturedAt: now, content: "export function charge() { return 1; }" },
      { nodeId: 'node:b', locator: 'backend/src/modules/auth/service.ts', capturedAt: now, content: "export function login() { return 1; }" },
    ],
  };

  const report = await checkDrift(graph, store, source, { domain: 'billing' });
  assert.equal(report.documents, 1);
});
