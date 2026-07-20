import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildContextPack, domainsOf, estimateTokens } from '../lib/code-context.ts';

/** Um projeto de fixture no disco: memory/30-domains + backend/src/modules. */
function fixtureProject(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-codectx-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return root;
}

test('domainsOf lista os diretórios sob memory/30-domains', () => {
  const root = fixtureProject({
    'memory/30-domains/orders/context.md': '# orders',
    'memory/30-domains/products/context.md': '# products',
  });
  assert.deepEqual(domainsOf(root), ['orders', 'products']);
  fs.rmSync(root, { recursive: true, force: true });
});

test('domainsOf devolve [] num projeto sem domínios (não estoura)', () => {
  const root = fixtureProject({ 'README.md': 'x' });
  assert.deepEqual(domainsOf(root), []);
  fs.rmSync(root, { recursive: true, force: true });
});

test('buildContextPack sem --code traz só o mapa e seus tokens', () => {
  const root = fixtureProject({
    'memory/30-domains/orders/context.md': 'a'.repeat(400),
    'backend/src/modules/orders/order.entity.ts': 'x'.repeat(800),
  });
  const pack = buildContextPack({ projectRoot: root, domain: 'orders' });
  assert.equal(pack.found, true);
  assert.equal(pack.mapTokens, 100); // 400/4
  assert.equal(pack.code.length, 0, 'sem --code, não lê código');
  assert.equal(pack.totalTokens, 100);
  fs.rmSync(root, { recursive: true, force: true });
});

test('buildContextPack com --code anexa o .ts da fatia e soma tokens', () => {
  const root = fixtureProject({
    'memory/30-domains/orders/context.md': 'a'.repeat(400),
    'backend/src/modules/orders/domain/order.entity.ts': 'x'.repeat(800),
    'backend/src/modules/orders/orders.module.ts': 'y'.repeat(200),
  });
  const pack = buildContextPack({ projectRoot: root, domain: 'orders', includeCode: true });
  assert.equal(pack.code.length, 2);
  assert.equal(pack.codeTokens, 250); // (800+200)/4
  assert.equal(pack.totalTokens, 350); // mapa 100 + código 250
  fs.rmSync(root, { recursive: true, force: true });
});

test('buildContextPack marca found=false quando o domínio não tem mapa', () => {
  const root = fixtureProject({ 'memory/30-domains/orders/context.md': '# orders' });
  const pack = buildContextPack({ projectRoot: root, domain: 'inexistente' });
  assert.equal(pack.found, false);
  assert.equal(pack.map, null);
  fs.rmSync(root, { recursive: true, force: true });
});

test('estimateTokens é bytes/4 (o proxy do framework)', () => {
  assert.equal(estimateTokens('a'.repeat(40)), 10);
});
