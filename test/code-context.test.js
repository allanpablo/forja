import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildContextPack, byRelevance, domainsOf, estimateTokens, withinBudget } from '../lib/code-context.ts';

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

// --- SPEC-057 AC-4: leitura por relevância dentro de um orçamento ------------

const arq = (rel, tokens = 100) => ({ path: rel, tokens, content: 'x'.repeat(tokens * 4) });

test('byRelevance: sem termo, a camada decide — domain/ antes de presentation/', () => {
  const ordem = byRelevance(
    [arq('m/orders/presentation/orders.controller.ts'), arq('m/orders/domain/order.entity.ts'), arq('m/orders/application/place-order.ts')],
    []
  ).map((f) => f.path);
  assert.deepEqual(ordem, [
    'm/orders/domain/order.entity.ts',
    'm/orders/application/place-order.ts',
    'm/orders/presentation/orders.controller.ts',
  ]);
});

test('byRelevance: termo no caminho vence termo só no conteúdo', () => {
  const noNome = arq('m/orders/domain/money.vo.ts');
  const noConteudo = { ...arq('m/orders/domain/other.ts'), content: 'money money money' };
  const ordem = byRelevance([noConteudo, noNome], ['money']).map((f) => f.path);
  assert.equal(ordem[0], 'm/orders/domain/money.vo.ts');
});

test('byRelevance: a mesma consulta dá sempre a mesma ordem (pacote determinístico)', () => {
  const files = [arq('m/a.ts'), arq('m/b.ts'), arq('m/c.ts')];
  assert.deepEqual(byRelevance(files, []), byRelevance([...files].reverse(), []));
});

test('withinBudget: corta o que estoura e devolve os omitidos para o rodapé', () => {
  const { kept, omitted } = withinBudget([arq('a.ts', 60), arq('b.ts', 60), arq('c.ts', 60)], 130);
  assert.deepEqual(kept.map((f) => f.path), ['a.ts', 'b.ts']);
  assert.deepEqual(omitted.map((f) => f.path), ['c.ts']);
});

test('withinBudget: um arquivo maior que o orçamento inteiro ainda entra (pacote nunca vazio)', () => {
  const { kept, omitted } = withinBudget([arq('gigante.ts', 9000)], 100);
  assert.equal(kept.length, 1);
  assert.equal(omitted.length, 0);
});

test('buildContextPack: --code respeita o orçamento e lista o que ficou de fora', () => {
  const root = fixtureProject({
    'memory/30-domains/orders/context.md': '# orders',
    'backend/src/modules/orders/domain/order.entity.ts': 'a'.repeat(400),
    'backend/src/modules/orders/domain/money.vo.ts': 'b'.repeat(400),
    'backend/src/modules/orders/presentation/orders.controller.ts': 'c'.repeat(400),
  });
  const pack = buildContextPack({ projectRoot: root, domain: 'orders', includeCode: true, budget: 250 });
  assert.equal(pack.code.length, 2, 'deveria caber só 2 de 3 arquivos de 100 tokens');
  assert.ok(pack.codeTokens <= 250);
  assert.deepEqual(pack.codeOmitted.map((c) => c.path), ['backend/src/modules/orders/presentation/orders.controller.ts']);
  assert.deepEqual(
    pack.code.map((c) => path.basename(c.path)),
    ['money.vo.ts', 'order.entity.ts'],
    'domain/ vem antes de presentation/; dentro da camada, alfabética (determinismo)'
  );
  fs.rmSync(root, { recursive: true, force: true });
});

test('buildContextPack: full traz a fatia inteira, sem omitidos (comportamento pré-SPEC-057)', () => {
  const root = fixtureProject({
    'memory/30-domains/orders/context.md': '# orders',
    'backend/src/modules/orders/domain/order.entity.ts': 'a'.repeat(4000),
    'backend/src/modules/orders/presentation/orders.controller.ts': 'c'.repeat(4000),
  });
  const pack = buildContextPack({ projectRoot: root, domain: 'orders', includeCode: true, full: true, budget: 10 });
  assert.equal(pack.code.length, 2);
  assert.deepEqual(pack.codeOmitted, []);
  fs.rmSync(root, { recursive: true, force: true });
});

test('buildContextPack: o termo da busca puxa o arquivo relevante para dentro do orçamento', () => {
  const root = fixtureProject({
    'memory/30-domains/orders/context.md': '# orders',
    'backend/src/modules/orders/domain/order.entity.ts': 'a'.repeat(4000),
    'backend/src/modules/orders/presentation/refund.controller.ts': 'c'.repeat(400),
  });
  const pack = buildContextPack({ projectRoot: root, domain: 'orders', includeCode: true, query: 'refund', budget: 200 });
  assert.equal(pack.code.length, 1);
  assert.match(pack.code[0].path, /refund\.controller\.ts$/);
  fs.rmSync(root, { recursive: true, force: true });
});

// domain vem direto do argv de `forja code:context <domínio>` — sem allowlist, "../../etc" (ou
// qualquer coisa fora de memory/30-domains/*) caminha para fora do projectRoot via path.join
// tanto no context.md quanto na varredura recursiva de --code.
test('buildContextPack rejeita domain com path traversal e não escapa do projectRoot', () => {
  const root = fixtureProject({ 'memory/30-domains/orders/context.md': '# orders' });
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-codectx-outside-'));
  fs.writeFileSync(path.join(outsideDir, 'secret.md'), 'segredo fora do projeto');
  try {
    const traversal = `..${path.sep}..${path.sep}${path.basename(outsideDir)}`;
    const pack = buildContextPack({ projectRoot: root, domain: traversal });
    assert.equal(pack.found, false, 'domain fora da allowlist deve ser rejeitado');
    assert.equal(pack.map, null);
    assert.equal(pack.mapPath, null);

    const packCode = buildContextPack({ projectRoot: root, domain: traversal, includeCode: true });
    assert.equal(packCode.code.length, 0, 'com --code, também não deve varrer nada fora do projectRoot');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outsideDir, { recursive: true, force: true });
  }
});

test('buildContextPack rejeita até um "../" que ainda resolveria dentro do projectRoot (allowlist, não sanitização)', () => {
  const root = fixtureProject({
    'memory/30-domains/orders/context.md': '# orders',
    'memory/other-secret/context.md': '# não é um domínio declarado em 30-domains',
  });
  const pack = buildContextPack({ projectRoot: root, domain: `..${path.sep}other-secret` });
  assert.equal(pack.found, false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('buildContextPack: domínio sem backend/ anexa só o mapa — a varredura some, não estoura', () => {
  const root = fixtureProject({ 'memory/30-domains/orders/context.md': 'a'.repeat(400) });
  const pack = buildContextPack({ projectRoot: root, domain: 'orders', includeCode: true });
  assert.equal(pack.found, true);
  assert.equal(pack.code.length, 0);
  assert.equal(pack.totalTokens, 100);
  fs.rmSync(root, { recursive: true, force: true });
});

/** fs real com caminhos envenenados: o disco muda (ou fecha) enquanto o pacote é montado. */
function fsEnvenenado({ stats = new Set(), leituras = new Set(), direorios = new Set() } = {}) {
  const diz = (p) => String(p);
  return {
    readdirSync: (p, ...a) => (direorios.has(diz(p)) ? (() => { throw new Error('EACCES'); })() : fs.readdirSync(p, ...a)),
    statSync: (p, ...a) => (stats.has(diz(p)) ? (() => { throw new Error('ENOENT'); })() : fs.statSync(p, ...a)),
    readFileSync: (p, ...a) => (leituras.has(diz(p)) ? (() => { throw new Error('EACCES'); })() : fs.readFileSync(p, ...a)),
  };
}

test('disco instável: entrada que quebra no stat ou na leitura degrada o pack em vez de derrubar o comando', () => {
  const root = fixtureProject({
    'memory/30-domains/orders/context.md': 'a'.repeat(400),
    'memory/30-domains/sumido/context.md': 'x',
    'backend/src/modules/orders/order.entity.ts': 'x'.repeat(400),
    'backend/src/modules/orders/gone.ts': 'y'.repeat(400),
    'backend/src/modules/orders/ilegivel.ts': 'z'.repeat(400),
  });
  const env = {
    fs: fsEnvenenado({
      stats: new Set([
        path.join(root, 'memory', '30-domains', 'sumido'),
        path.join(root, 'backend', 'src', 'modules', 'orders', 'gone.ts'),
      ]),
      leituras: new Set([
        path.join(root, 'memory', '30-domains', 'orders', 'context.md'),
        path.join(root, 'backend', 'src', 'modules', 'orders', 'ilegivel.ts'),
      ]),
    }),
  };

  const pack = buildContextPack({ projectRoot: root, domain: 'orders', includeCode: true }, env);

  assert.equal(pack.found, false, 'mapa ilegível não pode ser vendido como encontrado');
  assert.deepEqual(pack.mapPath, null);
  assert.deepEqual(
    pack.code.map((c) => c.path),
    ['backend/src/modules/orders/order.entity.ts'],
    'o que o disco deixou ler entra; o que sumiu fica de fora sem arrastar o resto',
  );
  fs.rmSync(root, { recursive: true, force: true });
});

test('domainsOf: entrada que não dá stat não é domínio (e o resto continua listando)', () => {
  const root = fixtureProject({
    'memory/30-domains/orders/context.md': '# orders',
    'memory/30-domains/sumido/context.md': '# sumido',
  });
  const env = { fs: fsEnvenenado({ stats: new Set([path.join(root, 'memory', '30-domains', 'sumido')]) }) };
  assert.deepEqual(domainsOf(root, env), ['orders']);
  fs.rmSync(root, { recursive: true, force: true });
});
