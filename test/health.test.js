import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { CHECKS, runChecks, worstStatus } from '../lib/core/health.mjs';

const checkById = (id) => CHECKS.find((c) => c.id === id);

/** Erro com `code`, como o Node produz. Os probes classificam por code, nunca por mensagem. */
function errWithCode(code, message = code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/** Um `better-sqlite3` de mentira que se comporta como o real: só o construtor toca o binding. */
function fakeSqlite({ onConstruct, rows = { n: 42 } } = {}) {
  return {
    default: class FakeDatabase {
      constructor() {
        if (onConstruct) onConstruct();
      }
      prepare() {
        return { get: () => rows };
      }
      close() {}
    },
  };
}

// Probes de fixture: o runner é testado sem depender de nenhum check real.
function check(id, status, extra = {}) {
  return {
    id,
    title: id,
    severity: 'critical',
    scope: 'runtime',
    probe: () => ({ status, detail: `${id}: ${status}`, fix: null }),
    ...extra,
  };
}

const byId = (results) => Object.fromEntries(results.map((r) => [r.id, r]));

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

test('runChecks devolve um resultado por check, na ordem declarada', async () => {
  const results = await runChecks({ checks: [check('a', 'ok'), check('b', 'warn')] });
  assert.deepEqual(results.map((r) => r.id), ['a', 'b']);
  assert.equal(results[0].status, 'ok');
  assert.equal(results[1].status, 'warn');
});

test('runChecks filtra por scope', async () => {
  const checks = [check('runtime-check', 'ok'), check('repo-check', 'ok', { scope: 'repo' })];

  const runtime = await runChecks({ scope: 'runtime', checks });
  assert.deepEqual(runtime.map((r) => r.id), ['runtime-check'], 'scope repo não deveria rodar');

  const all = await runChecks({ scope: 'all', checks });
  assert.equal(all.length, 2);
});

test('probe que lança vira fail e não derruba os demais', async () => {
  // Um probe que estoura derrubaria o diagnóstico justamente no ambiente quebrado que ele
  // existe para diagnosticar.
  const explode = {
    ...check('explode', 'ok'),
    probe: () => { throw new Error('boom'); },
  };
  const results = await runChecks({ checks: [explode, check('depois', 'ok')] });

  assert.equal(results[0].status, 'fail');
  assert.match(results[0].detail, /boom/);
  assert.equal(results[1].status, 'ok', 'o check seguinte deveria ter rodado');
});

test('probe assíncrono é aguardado', async () => {
  const asyncCheck = {
    ...check('async', 'ok'),
    probe: async () => ({ status: 'warn', detail: 'resolvido', fix: 'faça x' }),
  };
  const [r] = await runChecks({ checks: [asyncCheck] });
  assert.equal(r.status, 'warn');
  assert.equal(r.fix, 'faça x');
});

test('fix ausente vira null, nunca undefined', async () => {
  const semFix = { ...check('sem-fix', 'ok'), probe: () => ({ status: 'ok', detail: 'ok' }) };
  const [r] = await runChecks({ checks: [semFix] });
  assert.equal(r.fix, null);
});

// ---------------------------------------------------------------------------
// Cascata (dependsOn)
//
// Uma causa, uma linha vermelha. Com o ABI quebrado, os checks de memória também falhariam e o
// operador veria três erros sem saber qual é a raiz.
// ---------------------------------------------------------------------------

test('dependência falhou → dependente é skipped, não fail', async () => {
  const results = await runChecks({
    checks: [check('abi', 'fail'), check('db', 'ok', { dependsOn: 'abi' })],
  });
  const { abi, db } = byId(results);

  assert.equal(abi.status, 'fail');
  assert.equal(db.status, 'skipped');
  assert.match(db.detail, /abi/);
});

test('cascata propaga pela cadeia inteira, não só um nível', async () => {
  // abi falha → db é skipped → fresh depende de db e também não tem o que observar.
  // Propagar só a partir de `fail` faria o fresh rodar às cegas sobre um banco inacessível.
  const results = await runChecks({
    checks: [
      check('abi', 'fail'),
      check('db', 'ok', { dependsOn: 'abi' }),
      check('fresh', 'ok', { dependsOn: 'db' }),
    ],
  });
  const { db, fresh } = byId(results);

  assert.equal(db.status, 'skipped');
  assert.equal(fresh.status, 'skipped', 'skipped conta como "não verificado" para os dependentes');
  assert.equal(worstStatus(results), 'fail', 'a raiz continua reprovando o gate');
});

test('cascata não pula quem depende de um check apenas com warn', async () => {
  // `warn` significa "observei, e passa com ressalva" — o dependente ainda tem o que observar.
  const results = await runChecks({
    checks: [check('db', 'warn'), check('fresh', 'ok', { dependsOn: 'db' })],
  });
  assert.equal(byId(results).fresh.status, 'ok');
});

test('dependência saudável → dependente roda normalmente', async () => {
  const results = await runChecks({
    checks: [check('abi', 'ok'), check('db', 'fail', { dependsOn: 'abi' })],
  });
  assert.equal(byId(results).db.status, 'fail');
});

// ---------------------------------------------------------------------------
// worstStatus
// ---------------------------------------------------------------------------

test('worstStatus: tudo ok', () => {
  assert.equal(worstStatus([{ status: 'ok', severity: 'critical' }]), 'ok');
});

test('worstStatus: critical falhou → fail', () => {
  assert.equal(worstStatus([{ status: 'fail', severity: 'critical' }]), 'fail');
});

test('worstStatus: warn nunca escala para fail', () => {
  // Um gate que reprova o que não impede trabalho é um gate que se aprende a ignorar.
  const results = [
    { status: 'ok', severity: 'critical' },
    { status: 'warn', severity: 'warn' },
    { status: 'fail', severity: 'warn' },
  ];
  assert.equal(worstStatus(results), 'warn');
});

test('worstStatus: skipped sozinho não reprova', () => {
  assert.equal(worstStatus([{ status: 'skipped', severity: 'critical' }]), 'ok');
});

// ---------------------------------------------------------------------------
// native-abi — o check que teria pego a quebra de 2026-07-13
// ---------------------------------------------------------------------------

const abi = () => checkById('native-abi');

test('native-abi: ABI incompatível → npm rebuild, não npm install', async () => {
  // O cenário real: better-sqlite3 compilado para o Node 24, rodando no Node 26. A memória
  // inteira morre. O SessionStart prescrevia `npm install`, que não recompila binário nativo.
  const env = {
    importModule: async () => fakeSqlite({
      onConstruct: () => { throw errWithCode('ERR_DLOPEN_FAILED', 'NODE_MODULE_VERSION 127 vs 147'); },
    }),
    process: { versions: { node: '26.5.0' } },
  };

  const [r] = await runChecks({ checks: [abi()], env });

  assert.equal(r.status, 'fail');
  assert.equal(r.fix, 'npm rebuild better-sqlite3');
  assert.match(r.detail, /npm install NÃO corrige/i, 'precisa desmentir a prescrição antiga');
});

test('native-abi: módulo ausente → npm install', async () => {
  const env = {
    importModule: async () => { throw errWithCode('ERR_MODULE_NOT_FOUND'); },
  };

  const [r] = await runChecks({ checks: [abi()], env });

  assert.equal(r.status, 'fail');
  assert.equal(r.fix, 'npm install');
});

test('native-abi: as duas causas não colapsam na mesma prescrição', async () => {
  // A raiz do bug original: um `catch { return null }` engolia ambas e prescrevia a correção de
  // apenas uma delas.
  const dlopen = await runChecks({
    checks: [abi()],
    env: {
      importModule: async () => fakeSqlite({
        onConstruct: () => { throw errWithCode('ERR_DLOPEN_FAILED'); },
      }),
      process: { versions: { node: '26.5.0' } },
    },
  });
  const notFound = await runChecks({
    checks: [abi()],
    env: { importModule: async () => { throw errWithCode('ERR_MODULE_NOT_FOUND'); } },
  });

  assert.notEqual(dlopen[0].fix, notFound[0].fix, 'causas distintas, correções distintas');
});

test('native-abi: erro inesperado no import não é mascarado como ABI', async () => {
  const env = { importModule: async () => { throw errWithCode('ERR_UNKNOWN', 'algo novo'); } };
  const [r] = await runChecks({ checks: [abi()], env });

  // O runner blinda, mas o probe não pode fingir que sabe a causa nem prescrever um fix errado.
  assert.equal(r.status, 'fail');
  assert.equal(r.fix, null);
});

test('native-abi: ambiente são → ok', async () => {
  const env = {
    importModule: async () => fakeSqlite(),
    process: { versions: { node: '26.5.0' } },
  };
  const [r] = await runChecks({ checks: [abi()], env });
  assert.equal(r.status, 'ok');
});

// ---------------------------------------------------------------------------
// memory-db / memory-fresh
// ---------------------------------------------------------------------------

const db = () => checkById('memory-db');
const fresh = () => checkById('memory-fresh');

function fsStub({ exists = true, dbMtime = 0, files = {} } = {}) {
  return {
    existsSync: () => exists,
    statSync: (p) => ({
      mtimeMs: files[p]?.mtime ?? dbMtime,
      isDirectory: () => Boolean(files[p]?.dir),
    }),
    readdirSync: (p) => files[p]?.entries ?? [],
  };
}

const workspaceStub = { dbPath: () => '/w/universal.db', info: () => ({}) };

test('memory-db: banco nunca indexado → warn, não fail', async () => {
  // Um clone novo (ou um CI) não tem universal.db: é o estado natural, não uma quebra. Reprovar
  // aqui travaria o gate por aquilo que não impede trabalho.
  const [r] = await runChecks({
    checks: [db()],
    env: { fs: fsStub({ exists: false }), workspace: workspaceStub },
  });

  assert.equal(r.status, 'warn');
  assert.equal(r.fix, 'npm run sync:universal');
  assert.equal(worstStatus([r]), 'warn', 'não pode reprovar um repo recém-clonado');
});

test('memory-fresh: sem índice não há defasagem a reportar', async () => {
  // memory-db passa com aviso quando o banco não existe, então a cascata não pula o fresh.
  const [r] = await runChecks({
    checks: [fresh()],
    env: { root: process.cwd(), fs: fsStub({ exists: false }), workspace: workspaceStub },
  });

  assert.equal(r.status, 'skipped', 'um índice inexistente não pode estar defasado');
});

test('memory-db: banco existe mas não abre → é outra causa, outro detalhe', async () => {
  // Corrompido e ausente dão o mesmo existsSync; o operador merece saber qual dos dois é.
  const [r] = await runChecks({
    checks: [db()],
    env: {
      fs: fsStub({ exists: true }),
      workspace: workspaceStub,
      importModule: async () => fakeSqlite({
        onConstruct: () => { throw errWithCode('SQLITE_NOTADB', 'file is not a database'); },
      }),
    },
  });

  assert.equal(r.status, 'fail');
  assert.match(r.detail, /não abre|corrompido/i);
});

test('memory-db: banco saudável → ok com contagem', async () => {
  const [r] = await runChecks({
    checks: [db()],
    env: {
      fs: fsStub({ exists: true }),
      workspace: workspaceStub,
      importModule: async () => fakeSqlite({ rows: { n: 137 } }),
    },
  });

  assert.equal(r.status, 'ok');
  assert.match(r.detail, /137/);
});

test('memory-fresh: memory/ mais novo que o índice → warn, não fail', async () => {
  const memoryDir = path.join(process.cwd(), 'memory');
  const env = {
    root: process.cwd(),
    workspace: workspaceStub,
    fs: fsStub({
      dbMtime: 1_000,
      files: {
        [memoryDir]: { dir: true, entries: ['adr.md'] },
        [path.join(memoryDir, 'adr.md')]: { mtime: 99_000_000 },
      },
    }),
  };

  const [r] = await runChecks({ checks: [fresh()], env });

  assert.equal(r.status, 'warn', 'índice velho atrapalha, mas não impede trabalho');
  assert.equal(r.fix, 'npm run sync:universal');
  assert.equal(worstStatus([r]), 'warn', 'não pode reprovar o gate');
});

test('memory-fresh: índice em dia → ok', async () => {
  const memoryDir = path.join(process.cwd(), 'memory');
  const env = {
    root: process.cwd(),
    workspace: workspaceStub,
    fs: fsStub({
      dbMtime: 99_000_000,
      files: {
        [memoryDir]: { dir: true, entries: ['adr.md'] },
        [path.join(memoryDir, 'adr.md')]: { mtime: 1_000 },
      },
    }),
  };

  const [r] = await runChecks({ checks: [fresh()], env });
  assert.equal(r.status, 'ok');
});

// ---------------------------------------------------------------------------
// workspace / node-engines
// ---------------------------------------------------------------------------

test('workspace: ausente → warn com workspace:init, nunca fail', async () => {
  const env = {
    workspace: { dbPath: () => '/w/db', info: () => ({ root: '/w', source: 'default', exists: false }) },
  };
  const [r] = await runChecks({ checks: [checkById('workspace')], env });

  assert.equal(r.status, 'warn', 'o framework trabalha sem workspace');
  assert.equal(r.fix, 'npm run workspace:init');
});

test('workspace: reporta a origem da resolução', async () => {
  // O modo de falha interessante não é "não existe", é "existe, mas não é o que você pensa":
  // um FORJA_WORKSPACE esquecido aponta o framework para o workspace errado, e tudo parece bem.
  const env = {
    workspace: {
      dbPath: () => '/x/db',
      info: () => ({ root: '/x', source: 'FORJA_WORKSPACE', exists: true }),
    },
  };
  const [r] = await runChecks({ checks: [checkById('workspace')], env });

  assert.equal(r.status, 'ok');
  assert.match(r.detail, /FORJA_WORKSPACE/);
});

test('node-engines: abaixo do mínimo → warn', async () => {
  const env = {
    root: '/repo',
    process: { versions: { node: '18.0.0' } },
    fs: { readFileSync: () => JSON.stringify({ engines: { node: '>=20' } }) },
  };
  const [r] = await runChecks({ checks: [checkById('node-engines')], env });

  assert.equal(r.status, 'warn');
  assert.match(r.detail, /abaixo/);
});

test('node-engines: dentro do range → ok', async () => {
  const env = {
    root: '/repo',
    process: { versions: { node: '26.5.0' } },
    fs: { readFileSync: () => JSON.stringify({ engines: { node: '>=20' } }) },
  };
  const [r] = await runChecks({ checks: [checkById('node-engines')], env });
  assert.equal(r.status, 'ok');
});

// ---------------------------------------------------------------------------
// runtime-deps / mcp-json — regressões do ADR-0021 viram gate executável
// ---------------------------------------------------------------------------

/** fs de fixture para um repo do framework inteiro. `files` mapeia path → conteúdo. */
function repoStub(files, { git = true } = {}) {
  const dirs = new Set();
  for (const f of Object.keys(files)) {
    for (let d = path.dirname(f); d !== '/' && d !== '.'; d = path.dirname(d)) dirs.add(d);
  }
  return {
    existsSync: (p) => p in files || dirs.has(p) || (git && p === '/repo/.git'),
    readFileSync: (p) => {
      if (!(p in files)) throw new Error(`ENOENT: ${p}`);
      return files[p];
    },
    statSync: (p) => ({ isDirectory: () => dirs.has(p), mtimeMs: 0 }),
    readdirSync: (p) => {
      const out = new Set();
      for (const f of [...Object.keys(files), ...dirs]) {
        if (path.dirname(f) === p) out.add(path.basename(f));
      }
      return [...out];
    },
  };
}

const PKG = (extra) => JSON.stringify({
  name: 'forjajs',
  files: ['bin/', 'lib/', 'scripts/', 'docs/'],
  dependencies: { 'better-sqlite3': '^12.0.0' },
  devDependencies: { vitest: '^1.0.0' },
  ...extra,
});

test('runtime-deps: script publicado importando devDependency → fail', async () => {
  // O bug do ADR-0021 §2: dez scripts sob files[] importavam better-sqlite3, declarado só em
  // devDependencies. Numa instalação limpa, metade dos comandos estourava.
  const env = {
    root: '/repo',
    fs: repoStub({
      '/repo/package.json': PKG(),
      '/repo/scripts/foo.mjs': "import { x } from 'vitest';\n",
    }),
  };
  const [r] = await runChecks({ checks: [checkById('runtime-deps')], env });

  assert.equal(r.status, 'fail');
  assert.match(r.detail, /vitest/);
  assert.match(r.fix, /npm i -S vitest/);
});

test('runtime-deps: import estático de dependency legítima → ok', async () => {
  const env = {
    root: '/repo',
    fs: repoStub({
      '/repo/package.json': PKG(),
      '/repo/scripts/foo.mjs': "import Database from 'better-sqlite3';\nimport fs from 'node:fs';\n",
    }),
  };
  const [r] = await runChecks({ checks: [checkById('runtime-deps')], env });
  assert.equal(r.status, 'ok');
});

test('runtime-deps: import dentro de template literal não conta (SPEC-010 AC-11)', async () => {
  // Os geradores *escrevem* código NestJS dentro de crases — não o executam. Antes desta correção o
  // check passava por sorte: `@nestjs/*` não estava nas devDeps. No dia em que estivesse, ele
  // travaria o gate com falso positivo crítico. Fixture reproduz exatamente lib/generators/.
  const env = {
    root: '/repo',
    fs: repoStub({
      '/repo/package.json': JSON.stringify({
        name: 'forjajs',
        files: ['lib/'],
        dependencies: {},
        devDependencies: { '@nestjs/core': '^11.0.0' },
      }),
      // Reproduz nest-generator.js:304 — dentro do template, uma linha **começa** com `import`,
      // que é o que a âncora `^\s*import` do parser casa.
      '/repo/lib/generators/nest-generator.js': [
        "import fs from 'node:fs';",
        'const files = {',
        "  'test/app.e2e-spec.ts': `import { Test } from '@nestjs/testing';",
        "import { INestApplication } from '@nestjs/core';",
        'describe("AppController", () => {});`,',
        '};',
      ].join('\n'),
    }),
  };

  const [r] = await runChecks({ checks: [checkById('runtime-deps')], env });

  assert.equal(r.status, 'ok', 'código emitido por gerador não é dependência do gerador');
});

test('runtime-deps: import real fora de crases continua reprovando', async () => {
  // A correção não pode cegar o check: import de verdade, no topo do arquivo, ainda é violação.
  const env = {
    root: '/repo',
    fs: repoStub({
      '/repo/package.json': JSON.stringify({
        name: 'forjajs',
        files: ['lib/'],
        dependencies: {},
        devDependencies: { '@nestjs/core': '^11.0.0' },
      }),
      '/repo/lib/generators/nest-generator.js': [
        "import { NestFactory } from '@nestjs/core';",
        "const t = `import x from '@nestjs/core';`;",
      ].join('\n'),
    }),
  };

  const [r] = await runChecks({ checks: [checkById('runtime-deps')], env });

  assert.equal(r.status, 'fail');
  assert.match(r.detail, /@nestjs\/core/);
});

test('runtime-deps: import dinâmico não conta — lazy é o padrão pedido pelo ADR-0021', async () => {
  const env = {
    root: '/repo',
    fs: repoStub({
      '/repo/package.json': PKG(),
      '/repo/scripts/hook.mjs': "const { x } = await import('vitest');\n",
    }),
  };
  const [r] = await runChecks({ checks: [checkById('runtime-deps')], env });
  assert.equal(r.status, 'ok', 'parser conservador: um crítico que mente é pior que warning honesto');
});

test('runtime-deps: builtins e relativos são ignorados', async () => {
  const env = {
    root: '/repo',
    fs: repoStub({
      '/repo/package.json': PKG(),
      '/repo/lib/x.mjs': "import fs from 'node:fs';\nimport { y } from '../lib/y.mjs';\n",
    }),
  };
  const [r] = await runChecks({ checks: [checkById('runtime-deps')], env });
  assert.equal(r.status, 'ok');
});

test('mcp-json: path absoluto versionado → fail', async () => {
  // ADR-0021 §1: `-p /home/apk/.../projects/forja` apontava para uma cópia parada do repo.
  const env = {
    root: '/repo',
    fs: repoStub({
      '/repo/package.json': PKG(),
      '/repo/.mcp.json': JSON.stringify({
        mcpServers: { codegraph: { args: ['serve', '--mcp', '-p', '/home/apk/projects/forja'] } },
      }),
    }),
  };
  const [r] = await runChecks({ checks: [checkById('mcp-json')], env });

  assert.equal(r.status, 'fail');
  assert.match(r.detail, /\/home\/apk/);
});

test('mcp-json: sem path absoluto → ok', async () => {
  const env = {
    root: '/repo',
    fs: repoStub({
      '/repo/package.json': PKG(),
      '/repo/.mcp.json': JSON.stringify({
        mcpServers: { codegraph: { command: 'codegraph', args: ['serve', '--mcp'] } },
      }),
    }),
  };
  const [r] = await runChecks({ checks: [checkById('mcp-json')], env });
  assert.equal(r.status, 'ok');
});

test('checks de repo não rodam fora do repo do framework', async () => {
  // Numa instalação `npm i -g forjajs` não há devDependencies nem .mcp.json. Rodar estes checks
  // ali produziria falso positivo crítico na máquina do usuário final.
  const env = {
    root: '/instalacao',
    fs: repoStub({ '/instalacao/package.json': PKG() }, { git: false }),
  };

  const results = await runChecks({ checks: [checkById('runtime-deps'), checkById('mcp-json')], env });

  assert.ok(results.every((r) => r.status === 'ok'), 'não se aplicam');
  assert.ok(results.every((r) => /não se aplica/.test(r.detail)));
});

test('scope runtime não executa os checks de repo', async () => {
  const ids = (await runChecks({ scope: 'runtime', env: {
    importModule: async () => fakeSqlite(),
    process: { versions: { node: '26.5.0' } },
    workspace: workspaceStub,
    fs: fsStub({ exists: true }),
  } })).map((r) => r.id);

  assert.ok(!ids.includes('runtime-deps'));
  assert.ok(!ids.includes('mcp-json'));
});

// ---------------------------------------------------------------------------
// Integração dos checks reais: uma causa, uma linha vermelha
// ---------------------------------------------------------------------------

test('clone novo, sem memória indexada, não reprova o gate', async () => {
  // O cenário do CI: repo recém-clonado, `sync:universal` nunca rodou, workspace inexistente.
  // Nada disso impede trabalho — é o ponto de partida de qualquer instalação. Se o gate reprova
  // aqui, ele reprova todo mundo no primeiro dia, e aí ninguém mais confia nele.
  const results = await runChecks({
    scope: 'runtime',
    env: {
      importModule: async () => fakeSqlite(),
      process: { versions: { node: '26.5.0' } },
      workspace: { dbPath: () => '/w/universal.db', info: () => ({ root: '/w', source: 'default', exists: false }) },
      fs: fsStub({ exists: false }),
    },
  });

  assert.equal(worstStatus(results), 'warn', 'avisa, mas não trava');
  assert.ok(results.every((r) => r.status !== 'fail'), 'nada aqui é falha');
});

test('ABI quebrado não vira três erros vermelhos', async () => {
  const results = await runChecks({
    scope: 'runtime',
    env: {
      importModule: async () => fakeSqlite({
        onConstruct: () => { throw errWithCode('ERR_DLOPEN_FAILED'); },
      }),
      process: { versions: { node: '26.5.0' } },
      workspace: workspaceStub,
      fs: fsStub({ exists: true }),
    },
  });

  const fails = results.filter((r) => r.status === 'fail');
  assert.deepEqual(fails.map((r) => r.id), ['native-abi'], 'só a raiz falha');

  const skipped = results.filter((r) => r.status === 'skipped').map((r) => r.id);
  assert.ok(skipped.includes('memory-db'), 'memória depende do ABI: não tem o que observar');
  assert.ok(skipped.includes('memory-fresh'));
});
