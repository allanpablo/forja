import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { auditMemoryMaps } from '../lib/memory-audit.ts';

function fixtureProject(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-memaudit-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return root;
}

test('mapa que cita código existente resolve (0 pendurados)', () => {
  const root = fixtureProject({
    'memory/30-domains/orders/context.md': 'A regra mora em `domain/order.entity.ts`.',
    'backend/src/modules/orders/domain/order.entity.ts': 'export class Order {}',
  });
  const [a] = auditMemoryMaps(root);
  assert.equal(a.domain, 'orders');
  assert.equal(a.refs, 1);
  assert.deepEqual(a.dangling, []);
  fs.rmSync(root, { recursive: true, force: true });
});

test('mapa que cita código inexistente pendura (o coração do gate)', () => {
  const root = fixtureProject({
    'memory/30-domains/orders/context.md': 'Ver `domain/order.entity.ts` e `domain/renomeado.ts`.',
    'backend/src/modules/orders/domain/order.entity.ts': 'x',
  });
  const [a] = auditMemoryMaps(root);
  assert.equal(a.refs, 2);
  assert.deepEqual(a.dangling, ['domain/renomeado.ts']);
  fs.rmSync(root, { recursive: true, force: true });
});

test('resolve path relativo ao backend/ (não só ao módulo) — ex.: test/', () => {
  const root = fixtureProject({
    'memory/30-domains/orders/context.md': 'Teste em `test/orders/place-order.spec.ts`.',
    'backend/test/orders/place-order.spec.ts': 'describe()',
  });
  const [a] = auditMemoryMaps(root);
  assert.deepEqual(a.dangling, [], 'path relativo ao backend/ resolve');
  fs.rmSync(root, { recursive: true, force: true });
});

test('projeto sem domínios devolve [] — não estoura', () => {
  const root = fixtureProject({ 'README.md': 'x' });
  assert.deepEqual(auditMemoryMaps(root), []);
  fs.rmSync(root, { recursive: true, force: true });
});

test('só conta paths de código (com / e .ts), não prosa entre crases', () => {
  const root = fixtureProject({
    'memory/30-domains/orders/context.md': 'Use `Order` e `npm test`, veja `domain/x.ts`.',
    'backend/src/modules/orders/domain/x.ts': 'x',
  });
  const [a] = auditMemoryMaps(root);
  assert.equal(a.refs, 1, 'só domain/x.ts conta; `Order` e `npm test` não');
  assert.deepEqual(a.dangling, []);
  fs.rmSync(root, { recursive: true, force: true });
});

// direção reversa: módulo sem mapa (a economia perdida em silêncio)
import { modulesOf, modulesWithoutMap } from '../lib/memory-audit.ts';

test('modulesOf lista os diretórios sob backend/src/modules', () => {
  const root = fixtureProject({
    'backend/src/modules/orders/x.ts': 'x',
    'backend/src/modules/billing/y.ts': 'y',
  });
  assert.deepEqual(modulesOf(root), ['billing', 'orders']);
  fs.rmSync(root, { recursive: true, force: true });
});

test('modulesWithoutMap pega módulo de código sem context.md', () => {
  const root = fixtureProject({
    'memory/30-domains/orders/context.md': '# orders',
    'backend/src/modules/orders/x.ts': 'x',
    'backend/src/modules/billing/y.ts': 'y', // sem mapa
  });
  assert.deepEqual(modulesWithoutMap(root), ['billing']);
  fs.rmSync(root, { recursive: true, force: true });
});

test('modulesWithoutMap: todos mapeados → []', () => {
  const root = fixtureProject({
    'memory/30-domains/orders/context.md': '# orders',
    'backend/src/modules/orders/x.ts': 'x',
  });
  assert.deepEqual(modulesWithoutMap(root), []);
  fs.rmSync(root, { recursive: true, force: true });
});
