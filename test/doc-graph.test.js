import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { scanCommands, scanLinks, projectCommands, docFiles, scanAdrRefs, adrNumbers, commandCited } from '../lib/core/doc-graph.ts';

/**
 * fs de fixture: `files` mapeia path absoluto → conteúdo. Diretórios são inferidos dos paths.
 * Espelha o padrão dos stubs de health.test.js / release.test.js.
 */
function stub(files) {
  const dirs = new Set();
  for (const f of Object.keys(files)) {
    for (let d = path.dirname(f); d !== '/' && d !== '.'; d = path.dirname(d)) dirs.add(d);
  }
  return {
    existsSync: (p) => p in files || dirs.has(p),
    readFileSync: (p) => {
      if (!(p in files)) throw new Error(`ENOENT: ${p}`);
      return files[p];
    },
    statSync: (p) => {
      if (!(p in files) && !dirs.has(p)) throw new Error(`ENOENT: ${p}`);
      return { isDirectory: () => dirs.has(p) };
    },
    readdirSync: (p) => {
      const out = new Set();
      for (const f of [...Object.keys(files), ...dirs]) {
        if (path.dirname(f) === p) out.add(path.basename(f));
      }
      return [...out];
    },
  };
}

const ROOT = '/repo';
const env = (files) => ({ root: ROOT, fs: stub(files) });

// ---------------------------------------------------------------------------
// scanCommands — o `:` é o discriminador
// ---------------------------------------------------------------------------

test('scanCommands: pega forja x:y e npm run x:y', () => {
  const hits = scanCommands(env({
    [`${ROOT}/docs/guia.md`]: 'Rode `forja spec:new x` e depois `npm run code:impact y`.',
  }));
  assert.deepEqual(hits.map((h) => h.command).sort(), ['code:impact', 'spec:new']);
  assert.equal(hits[0].file, 'docs/guia.md');
  assert.equal(hits[0].line, 1);
});

test('scanCommands: prosa sem `:` não vira comando (evita "forja does X")', () => {
  const hits = scanCommands(env({
    [`${ROOT}/README.md`]: 'The forja core routes everything. Run forja to see help.',
  }));
  assert.equal(hits.length, 0, 'sem `:` não casa — o discriminador do plano §D4');
});

test('scanCommands: reporta a linha certa', () => {
  const hits = scanCommands(env({
    [`${ROOT}/AGENTS.md`]: 'linha um\nlinha dois\n`forja gsd:check z`\n',
  }));
  assert.equal(hits.length, 1);
  assert.equal(hits[0].line, 3);
});

test('scanCommands: só varre as superfícies de instrução, não specs/boilerplates/memory', () => {
  const hits = scanCommands(env({
    [`${ROOT}/docs/ok.md`]: '`forja spec:new a`',
    [`${ROOT}/specs/x/spec.md`]: '`forja proposto:futuro b`',
    [`${ROOT}/boilerplates/y/README.md`]: '`npm run start:dev`',
    [`${ROOT}/memory/90-decisions/0001.md`]: '`forja removido:antigo c`',
    [`${ROOT}/docs/archive/velho.md`]: '`forja legado:x d`',
  }));
  assert.deepEqual(hits.map((h) => h.command), ['spec:new'], 'só docs/ok.md conta');
});

// ---------------------------------------------------------------------------
// scanLinks — relativos, resolvidos; externos e âncoras ignorados
// ---------------------------------------------------------------------------

test('scanLinks: relativo é coletado e resolvido à raiz', () => {
  const hits = scanLinks(env({
    [`${ROOT}/docs/a.md`]: 'veja [b](../AGENTS.md) e [c](sub/x.md)',
  }));
  const byTarget = Object.fromEntries(hits.map((h) => [h.target, h.resolved]));
  assert.equal(byTarget['../AGENTS.md'], 'AGENTS.md');
  assert.equal(byTarget['sub/x.md'], 'docs/sub/x.md');
});

test('scanLinks: ignora http(s), mailto e âncora pura', () => {
  const hits = scanLinks(env({
    [`${ROOT}/docs/a.md`]: '[x](https://ex.com) [y](mailto:a@b.c) [z](#secao)',
  }));
  assert.equal(hits.length, 0);
});

test('scanLinks: descarta a âncora de um path relativo', () => {
  const [h] = scanLinks(env({
    [`${ROOT}/docs/a.md`]: '[v](../CHANGELOG.md#v1)',
  }));
  assert.equal(h.target, '../CHANGELOG.md');
  assert.equal(h.resolved, 'CHANGELOG.md');
});

// ---------------------------------------------------------------------------
// projectCommands — allowlist DERIVADA dos geradores
// ---------------------------------------------------------------------------

test('projectCommands: deriva as keys do bloco "scripts" dos geradores', () => {
  const gen = [
    'export function generate() {',
    '  return `{',
    '    "scripts": {',
    '      "start:dev": "nest start --watch",',
    '      "test:cov": "jest --coverage",',
    '      "memory:db:sync": "node x.mjs"',
    '    }',
    '  }`;',
    '}',
  ].join('\n');

  const set = projectCommands(env({ [`${ROOT}/lib/generators/nest.js`]: gen }));
  assert.ok(set.has('start:dev'));
  assert.ok(set.has('test:cov'));
  assert.ok(set.has('memory:db:sync'));
});

test('projectCommands: um comando novo no gerador entra sozinho (não é lista congelada)', () => {
  // A prova de que a allowlist SEGUE o gerador — a garantia do AC-2.
  const gen = '`{ "scripts": { "foo:bar": "x" } }`';
  const set = projectCommands(env({ [`${ROOT}/lib/generators/g.js`]: gen }));
  assert.ok(set.has('foo:bar'), 'derivada, não literal');
});

test('projectCommands: também deriva dos package.json dos boilerplates', () => {
  // test:e2e vive no package.json do boilerplate, não no gerador — foi ele que revelou a 2ª fonte.
  const set = projectCommands(env({
    [`${ROOT}/lib/generators/nest.js`]: '`{ "scripts": { "start:dev": "x" } }`',
    [`${ROOT}/boilerplates/saas/backend/package.json`]: JSON.stringify({
      scripts: { 'test:e2e': 'jest --config e2e', build: 'nest build' },
    }),
  }));
  assert.ok(set.has('start:dev'), 'fonte 1: gerador');
  assert.ok(set.has('test:e2e'), 'fonte 2: boilerplate package.json');
});

test('projectCommands: sem geradores nem boilerplates devolve set vazio, não estoura', () => {
  const set = projectCommands(env({ [`${ROOT}/docs/a.md`]: 'x' }));
  assert.equal(set.size, 0);
});

// ---------------------------------------------------------------------------
// docFiles
// ---------------------------------------------------------------------------

test('docFiles: coleta .md das superfícies, exclui archive', () => {
  const files = docFiles(env({
    [`${ROOT}/docs/a.md`]: '',
    [`${ROOT}/docs/archive/b.md`]: '',
    [`${ROOT}/prompts/c.md`]: '',
    [`${ROOT}/README.md`]: '',
    [`${ROOT}/lib/x.mjs`]: '',
  }));
  assert.ok(files.includes('docs/a.md'));
  assert.ok(files.includes('prompts/c.md'));
  assert.ok(files.includes('README.md'));
  assert.ok(!files.some((f) => f.includes('archive')), 'archive fora');
  assert.ok(!files.some((f) => f.endsWith('.mjs')), 'só .md');
});

// ---------------------------------------------------------------------------
// scanAdrRefs / adrNumbers — referências arquiteturais que não podem pendurar (ADR-0025)

test('adrNumbers lê NNNN-*.md e ignora _template', () => {
  const e = env({
    '/repo/memory/90-decisions/0001-x.md': '# ADR',
    '/repo/memory/90-decisions/0026-y.md': '# ADR',
    '/repo/memory/90-decisions/_template.md': '# tpl',
  });
  assert.deepEqual([...adrNumbers(e)].sort(), ['0001', '0026']);
});

test('scanAdrRefs acha citações ADR-NNNN em specs, com arquivo e linha', () => {
  const e = env({ '/repo/specs/x/plan.md': 'linha 1\nver ADR-0026 e ADR-0099\n' });
  const refs = scanAdrRefs(e);
  assert.deepEqual(refs.map((r) => r.num).sort(), ['0026', '0099']);
  assert.equal(refs[0].file, 'specs/x/plan.md');
  assert.equal(refs[0].line, 2);
});

test('a referência pendurada é a que não está em adrNumbers (o coração do check)', () => {
  const e = env({
    '/repo/memory/90-decisions/0026-y.md': '# ADR',
    '/repo/specs/x/plan.md': 'ADR-0026 existe, ADR-0099 não\n',
  });
  const existing = adrNumbers(e);
  const dangling = scanAdrRefs(e).filter((r) => !existing.has(r.num));
  assert.deepEqual(dangling.map((r) => r.ref), ['ADR-0099']);
});

test('commandCited: comando sem dois-pontos é achado por grep literal (fallback do commands-documented)', () => {
  const e = env({ '/repo/README.md': 'Use `forja orchestrate "objetivo" --slug x` para abrir a corrida.' });
  assert.equal(commandCited(e, 'orchestrate'), true);
  assert.equal(commandCited(e, 'inexistente'), false);
});
