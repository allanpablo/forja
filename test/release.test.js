import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { runChecks, worstStatus } from '../lib/core/checks.mjs';
import { RELEASE_CHECKS } from '../lib/core/release.mjs';

const checkById = (id) => RELEASE_CHECKS.find((c) => c.id === id);

const PKG_DIR = '/pkg';

/**
 * fs de fixture para um tarball instalado. `files` mapeia path → conteúdo.
 * Só `bin/`, `lib/` e `scripts/` contam como código do pacote — `boilerplates/` é conteúdo.
 */
function tarballStub(files) {
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
    statSync: (p) => ({ isDirectory: () => dirs.has(p) }),
    readdirSync: (p) => {
      const out = new Set();
      for (const f of [...Object.keys(files), ...dirs]) {
        if (path.dirname(f) === p) out.add(path.basename(f));
      }
      if (!out.size && !dirs.has(p)) throw new Error(`ENOENT: ${p}`);
      return [...out];
    },
  };
}

function env(files, extra = {}) {
  return {
    root: '/repo',
    pkgDir: PKG_DIR,
    installDir: '/tmp/inst',
    fs: tarballStub(files),
    registry: {},
    smokeCommands: [],
    publish: false,
    spawn: () => ({ stdout: '', stderr: '' }),
    ...extra,
  };
}

const PKG_JSON = (extra = {}) => JSON.stringify({
  name: 'forjajs',
  files: ['bin/', 'lib/', 'scripts/'],
  bin: { forja: 'bin/forja.mjs' },
  dependencies: { 'better-sqlite3': '^12.0.0' },
  ...extra,
});

// ---------------------------------------------------------------------------
// registry-scripts — todo comando anunciado existe no pacote
// ---------------------------------------------------------------------------

test('registry-scripts: comando cujo script ficou fora do tarball reprova', async () => {
  const e = env(
    { [`${PKG_DIR}/scripts/existe.mjs`]: '' },
    { registry: { 'a:cmd': { node: 'scripts/existe.mjs' }, 'b:cmd': { node: 'scripts/sumiu.mjs' } } }
  );

  const [r] = await runChecks({ checks: [checkById('registry-scripts')], env: e });

  assert.equal(r.status, 'fail');
  assert.match(r.detail, /b:cmd/);
  assert.match(r.fix, /files\[\]/);
});

test('registry-scripts: todos presentes → ok', async () => {
  const e = env(
    { [`${PKG_DIR}/scripts/a.mjs`]: '' },
    { registry: { 'a:cmd': { node: 'scripts/a.mjs' } } }
  );

  const [r] = await runChecks({ checks: [checkById('registry-scripts')], env: e });
  assert.equal(r.status, 'ok');
});

// ---------------------------------------------------------------------------
// imports-resolve — o bug da v1.1.3
// ---------------------------------------------------------------------------

test('imports-resolve: bug da v1.1.3 — script publicado importa arquivo fora do files[]', async () => {
  // `docs/dashboard.md` e o script `npm run dashboard` foram publicados; a pasta `dashboard/`
  // nunca esteve no files[]. Quem instalava recebia a documentação e o comando, sem o código.
  const e = env({
    [`${PKG_DIR}/package.json`]: PKG_JSON(),
    [`${PKG_DIR}/bin/forja.mjs`]: "import { COMMANDS } from '../lib/core/registry.mjs';\n",
  });

  const [r] = await runChecks({ checks: [checkById('imports-resolve')], env: e });

  assert.equal(r.status, 'fail');
  assert.match(r.detail, /registry\.mjs/);
  assert.match(r.fix, /files\[\]/);
});

test('imports-resolve: destino presente → ok (resolve com e sem extensão)', async () => {
  const e = env({
    [`${PKG_DIR}/package.json`]: PKG_JSON(),
    [`${PKG_DIR}/bin/forja.mjs`]: "import { x } from '../lib/core/registry.mjs';\n",
    [`${PKG_DIR}/lib/core/registry.mjs`]: 'export const x = 1;\n',
  });

  const [r] = await runChecks({ checks: [checkById('imports-resolve')], env: e });
  assert.equal(r.status, 'ok');
});

test('imports-resolve: template literal não é código do pacote', async () => {
  // O gerador *escreve* `import './app.module'` para o projeto gerado. Esse arquivo não existe —
  // nem deve existir — no tarball do Forja.
  const e = env({
    [`${PKG_DIR}/package.json`]: PKG_JSON(),
    [`${PKG_DIR}/lib/generators/nest.js`]: [
      'const files = {',
      "  'src/main.ts': `import { AppModule } from './app.module';",
      "import { Controller } from './app.controller';`,",
      '};',
    ].join('\n'),
  });

  const [r] = await runChecks({ checks: [checkById('imports-resolve')], env: e });
  assert.equal(r.status, 'ok', 'código emitido pelo gerador não é import do gerador');
});

// ---------------------------------------------------------------------------
// deps-declared / deps-unused — o bug do ADR-0021 §2
// ---------------------------------------------------------------------------

test('deps-declared: bug do ADR-0021 — better-sqlite3 fora de dependencies', async () => {
  const e = env({
    [`${PKG_DIR}/package.json`]: JSON.stringify({ name: 'forjajs', dependencies: {} }),
    [`${PKG_DIR}/scripts/sync.js`]: "import Database from 'better-sqlite3';\n",
  });

  const [r] = await runChecks({ checks: [checkById('deps-declared')], env: e });

  assert.equal(r.status, 'fail');
  assert.match(r.detail, /better-sqlite3/);
  assert.equal(r.fix, 'npm i -S better-sqlite3');
});

test('deps-declared: boilerplates não contam — eles são conteúdo, não código', async () => {
  // Pego na primeira execução real do gate: o `next.config.js` de um boilerplate importa `next`,
  // que é dependência do projeto do usuário. O gate exigia `npm i -S next` no framework.
  const e = env({
    [`${PKG_DIR}/package.json`]: PKG_JSON(),
    [`${PKG_DIR}/scripts/ok.js`]: "import Database from 'better-sqlite3';\n",
    [`${PKG_DIR}/boilerplates/saas/next.config.js`]: "import next from 'next';\n",
  });

  const [r] = await runChecks({ checks: [checkById('deps-declared')], env: e });

  assert.equal(r.status, 'ok', 'o que o Forja escreve não é o que o Forja executa');
});

test('deps-unused: dependency que ninguém importa é warn, não fail', async () => {
  // Peso morto viaja no tarball de todo usuário — incomoda, não quebra.
  const e = env({
    [`${PKG_DIR}/package.json`]: JSON.stringify({
      name: 'forjajs',
      dependencies: { otplib: '^12.0.0' },
    }),
    [`${PKG_DIR}/scripts/a.js`]: "import fs from 'node:fs';\n",
  });

  const [r] = await runChecks({ checks: [checkById('deps-unused')], env: e });

  assert.equal(r.status, 'warn');
  assert.match(r.detail, /otplib/);
  assert.equal(worstStatus([r]), 'warn', 'peso morto não reprova um release');
});

// ---------------------------------------------------------------------------
// smoke-commands — executar, não listar
// ---------------------------------------------------------------------------

test('smoke-commands: reprova por assinatura de loader, não por exit code', async () => {
  const e = env(
    { [`${PKG_DIR}/bin/forja.mjs`]: '', [`${PKG_DIR}/package.json`]: PKG_JSON() },
    {
      smokeCommands: [['query:universal']],
      spawn: () => ({ stdout: '', stderr: "Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'better-sqlite3'" }),
    }
  );

  const [r] = await runChecks({ checks: [checkById('smoke-commands')], env: e });

  assert.equal(r.status, 'fail');
  assert.match(r.detail, /ERR_MODULE_NOT_FOUND/);
});

test('smoke-commands: exit ≠ 0 por falta de workspace NÃO reprova', async () => {
  // Numa instalação limpa não há workspace nem universal.db. `query:universal` sair com código ≠ 0
  // é o pacote **funcionando**. Reprovar aqui reprovaria todo tarball saudável — é a armadilha do
  // memory-db da SPEC-009, um nível acima.
  const e = env(
    { [`${PKG_DIR}/bin/forja.mjs`]: '', [`${PKG_DIR}/package.json`]: PKG_JSON() },
    {
      smokeCommands: [['query:universal', 'teste']],
      spawn: () => ({ stdout: '', stderr: 'Nenhum resultado encontrado. Rode sync:universal.' }),
    }
  );

  const [r] = await runChecks({ checks: [checkById('smoke-commands')], env: e });

  assert.equal(r.status, 'ok', 'estado do ambiente não é defeito do pacote');
});

test('smoke-commands: ABI quebrado no tarball também reprova', async () => {
  const e = env(
    { [`${PKG_DIR}/bin/forja.mjs`]: '', [`${PKG_DIR}/package.json`]: PKG_JSON() },
    {
      smokeCommands: [['tools:doctor']],
      spawn: () => ({ stdout: '', stderr: 'Error: ERR_DLOPEN_FAILED' }),
    }
  );

  const [r] = await runChecks({ checks: [checkById('smoke-commands')], env: e });
  assert.equal(r.status, 'fail');
});

// ---------------------------------------------------------------------------
// tree-clean — o bug da v1.1.1
// ---------------------------------------------------------------------------

test('tree-clean: árvore suja é warn em dev e fail sob --publish', async () => {
  // `npm publish` empacota o disco, não o commit. Foi assim que otplib e qrcode entraram na v1.1.1
  // sem jamais existirem no git. Mas reprovar todo dev local faria o gate ser contornado.
  const sujo = { root: process.cwd() };

  const [dev] = await runChecks({
    checks: [checkById('tree-clean')],
    env: env({}, { ...sujo, publish: false }),
  });
  const [pub] = await runChecks({
    checks: [checkById('tree-clean')],
    env: env({}, { ...sujo, publish: true }),
  });

  // O repo de teste pode estar limpo; o que importa é a severidade quando sujo.
  if (dev.status !== 'ok') {
    assert.equal(dev.status, 'warn', 'em dev, árvore suja avisa');
    assert.equal(pub.status, 'fail', 'sob --publish, árvore suja é fatal');
  }
});

// ---------------------------------------------------------------------------
// Cascata: se não instala, o resto não tem o que observar
// ---------------------------------------------------------------------------

test('install falhou → os demais são skipped, não fail', async () => {
  const e = env({}, { pkgDir: null });

  const results = await runChecks({ checks: RELEASE_CHECKS, env: e });
  const byId = Object.fromEntries(results.map((r) => [r.id, r]));

  assert.equal(byId.install.status, 'fail');
  for (const id of ['registry-scripts', 'smoke-commands', 'imports-resolve', 'deps-declared']) {
    assert.equal(byId[id].status, 'skipped', `${id} não tem o que observar sem instalação`);
  }
});
