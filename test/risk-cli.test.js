import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  return result;
}

/**
 * Fixture com 2 pacotes: bar importa foo pelo path repo-relative (não `../../` — o extrator
 * determinístico não resolve caminho relativo, só captura o texto entre aspas; usar o path
 * repo-relative é o único jeito de a aresta DEPENDS_ON realmente ligar ao arquivo que o
 * `risk:assess` está avaliando, mesma limitação documentada em scripts/risk.ts).
 */
function createFixture() {
  const graphRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-risk-fixture-'));
  fs.mkdirSync(path.join(graphRoot, 'packages', 'foo', 'src'), { recursive: true });
  fs.mkdirSync(path.join(graphRoot, 'packages', 'bar', 'src'), { recursive: true });
  fs.mkdirSync(path.join(graphRoot, 'test'), { recursive: true });
  fs.writeFileSync(path.join(graphRoot, 'packages', 'foo', 'src', 'index.ts'), 'export function foo() { return 1; }\n');
  fs.writeFileSync(path.join(graphRoot, 'packages', 'bar', 'src', 'index.ts'), "import { foo } from 'packages/foo/src/index.ts';\nexport function bar() { return foo(); }\n");
  fs.writeFileSync(path.join(graphRoot, 'test', 'bar.test.js'), "// teste do bar, não do foo — foo fica sem teste de propósito, pra exercitar test_confidence\n");
  git(['init', '-q'], graphRoot);
  git(['config', 'user.email', 'forja-test@example.invalid'], graphRoot);
  git(['config', 'user.name', 'Forja Test'], graphRoot);
  git(['add', '.'], graphRoot);
  git(['commit', '-qm', 'fixture'], graphRoot);
  return graphRoot;
}

function run(args, graphRoot, workspace) {
  return spawnSync(process.execPath, ['scripts/risk.ts', ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, FORJA_GRAPH_ROOT: graphRoot, FORJA_WORKSPACE: workspace, FORJA_RUNTIME_DB: path.join(workspace, 'universal.db') },
  });
}

function cleanup(graphRoot, workspace) {
  fs.rmSync(graphRoot, { recursive: true, force: true });
  fs.rmSync(workspace, { recursive: true, force: true });
}

test('risk:assess — sem arquivo alterado, nada a avaliar', () => {
  const graphRoot = createFixture();
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-risk-workspace-'));
  try {
    const result = run(['assess'], graphRoot, workspace);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Nenhum arquivo alterado/);
  } finally {
    cleanup(graphRoot, workspace);
  }
});

test('risk:assess — mudança não commitada em foo (importado por bar, sem teste) produz score com fatores reais', () => {
  const graphRoot = createFixture();
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-risk-workspace-'));
  try {
    fs.writeFileSync(path.join(graphRoot, 'packages', 'foo', 'src', 'index.ts'), 'export function foo() { return 2; }\n');

    const result = run(['assess'], graphRoot, workspace);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /score \d+\/100/);
    assert.match(result.stdout, /blast_radius/);
    assert.match(result.stdout, /architecture_violations/);
    assert.match(result.stdout, /security_sensitivity/);
    assert.match(result.stdout, /historical_failure_rate/);
    assert.match(result.stdout, /test_confidence/);
    assert.match(result.stdout, /reversibility/);
    assert.match(result.stdout, /deployment_complexity/);
    // sem Observation histórica nesta fixture — cold start declarado, não escondido (AC-3).
    assert.match(result.stdout, /sem dado real/);
    assert.match(result.stdout, /Observation histórica/);
    // foo.ts muda, só bar.test.js existe (test/foo.test.js não) — 0% coberto, dado real presente.
    assert.match(result.stdout, /0% dos arquivos afetados têm teste associado/);
    // bar importa foo pelo path repo-relative da fixture — blast radius real, não zero.
    assert.doesNotMatch(result.stdout, /0 nó\(s\) alcançável/);

    const idMatch = /forja risk:explain (\S+)/.exec(result.stdout);
    assert.ok(idMatch, `esperava encontrar o id do assessment em: ${result.stdout}`);
    const id = idMatch[1];
    assert.ok(fs.existsSync(path.join(graphRoot, '.context', 'risk', `${id}.json`)));

    const explain = run(['explain', id], graphRoot, workspace);
    assert.equal(explain.status, 0, explain.stderr);
    assert.match(explain.stdout, new RegExp(id));
    assert.match(explain.stdout, /score \d+\/100/);
  } finally {
    cleanup(graphRoot, workspace);
  }
});

test('risk:assess — arquivo de auth/guard/session/shutdown é detectado como sensível (achado real corrigido, ver specs/change-risk-engine/spec.md §8)', () => {
  const graphRoot = createFixture();
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-risk-workspace-'));
  try {
    // Nomes inspirados no commit real (f678d37) que originou o achado: nenhum termo do
    // vocabulário original (secret/credential/.env/database/deploy) batia com guard.ts/main.ts —
    // auth/guard/session/shutdown foram adicionados justamente pra pegar este tipo de caso.
    fs.mkdirSync(path.join(graphRoot, 'packages', 'foo', 'src', 'auth'), { recursive: true });
    fs.writeFileSync(path.join(graphRoot, 'packages', 'foo', 'src', 'auth', 'guard.ts'), 'export function guard() { return true; }\n');
    git(['add', '.'], graphRoot);
    git(['commit', '-qm', 'add auth guard'], graphRoot);

    const result = run(['assess', 'HEAD'], graphRoot, workspace);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /categorias tocadas:.*secrets/, 'auth/guard no path deve disparar a categoria secrets');
    assert.doesNotMatch(result.stdout, /nenhuma categoria sensível tocada/);
  } finally {
    cleanup(graphRoot, workspace);
  }
});

test('risk:explain — recusa id inexistente', () => {
  const graphRoot = createFixture();
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-risk-workspace-'));
  try {
    const result = run(['explain', 'nao-existe'], graphRoot, workspace);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /não encontrado/);
  } finally {
    cleanup(graphRoot, workspace);
  }
});
