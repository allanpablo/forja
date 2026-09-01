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
 * Fixture: baseline com um teste que passa, mais um branch `feature` — `passing` decide se o
 * teste em `feature` passa ou falha, pra exercitar as duas recomendações (`promote`/`discard`).
 */
function createFixture({ passing }) {
  const graphRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-simulate-fixture-'));
  fs.mkdirSync(path.join(graphRoot, 'test'), { recursive: true });
  fs.writeFileSync(path.join(graphRoot, 'package.json'), JSON.stringify({ name: 'fx', scripts: { test: 'node --test' } }));
  fs.writeFileSync(path.join(graphRoot, 'index.js'), "console.log('ok');\n");
  fs.writeFileSync(path.join(graphRoot, 'test', 'basic.test.js'), "const { test } = require('node:test');\nconst assert = require('node:assert');\ntest('passes', () => { assert.equal(1, 1); });\n");
  git(['init', '-q'], graphRoot);
  git(['config', 'user.email', 'forja-test@example.invalid'], graphRoot);
  git(['config', 'user.name', 'Forja Test'], graphRoot);
  git(['add', '.'], graphRoot);
  git(['commit', '-qm', 'baseline'], graphRoot);
  const defaultBranch = git(['symbolic-ref', '--short', 'HEAD'], graphRoot).stdout.trim();
  git(['checkout', '-qb', 'feature'], graphRoot);
  fs.writeFileSync(path.join(graphRoot, 'index.js'), "console.log('feature');\n");
  const testBody = passing
    ? "const { test } = require('node:test');\nconst assert = require('node:assert');\ntest('passes', () => { assert.equal(1, 1); });\n"
    : "const { test } = require('node:test');\nconst assert = require('node:assert');\ntest('fails', () => { assert.equal(1, 2); });\n";
  fs.writeFileSync(path.join(graphRoot, 'test', 'basic.test.js'), testBody);
  git(['add', '.'], graphRoot);
  git(['commit', '-qm', 'feature change'], graphRoot);
  git(['checkout', '-q', defaultBranch], graphRoot);
  return graphRoot;
}

function run(args, graphRoot, workspace) {
  return spawnSync(process.execPath, ['scripts/simulate.ts', ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, FORJA_GRAPH_ROOT: graphRoot, FORJA_WORKSPACE: workspace, FORJA_RUNTIME_DB: path.join(workspace, 'universal.db') },
  });
}

function worktreeList(graphRoot) {
  return git(['worktree', 'list'], graphRoot).stdout.trim();
}

function cleanup(graphRoot, workspace) {
  fs.rmSync(graphRoot, { recursive: true, force: true });
  fs.rmSync(workspace, { recursive: true, force: true });
}

test('simulate: teste passa → recommendation promote, worktree destruído (git worktree list idêntico antes/depois)', () => {
  const graphRoot = createFixture({ passing: true });
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-simulate-workspace-'));
  try {
    const before = worktreeList(graphRoot);
    const result = run(['feature', '--json'], graphRoot, workspace);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.testResult.passed, true);
    assert.equal(report.recommendation, 'promote');
    // no caso "passing", test/basic.test.js tem o mesmo conteúdo do baseline — só index.js muda de verdade.
    assert.deepEqual([...report.changedFiles].sort(), ['index.js']);

    const after = worktreeList(graphRoot);
    assert.equal(after, before, 'nenhum worktree deveria sobrar após simulate — nunca promove, sempre destrói (AC-3)');

    const status = git(['status', '--porcelain'], graphRoot).stdout.trim();
    assert.equal(status, '', 'árvore real não deveria ter nenhuma mudança não commitada após simulate');
  } finally {
    cleanup(graphRoot, workspace);
  }
});

test('simulate: teste falha → recommendation discard, worktree ainda destruído', () => {
  const graphRoot = createFixture({ passing: false });
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-simulate-workspace-'));
  try {
    const before = worktreeList(graphRoot);
    const result = run(['feature', '--json'], graphRoot, workspace);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.testResult.passed, false);
    assert.equal(report.recommendation, 'discard');

    assert.equal(worktreeList(graphRoot), before);
  } finally {
    cleanup(graphRoot, workspace);
  }
});

test('simulate: texto legível (sem --json) contém todas as seções', () => {
  const graphRoot = createFixture({ passing: true });
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-simulate-workspace-'));
  try {
    const result = run(['feature'], graphRoot, workspace);
    assert.equal(result.status, 0, result.stderr);
    for (const heading of ['teste \\(npm test\\)', 'ARCHITECTURE CHECK', 'RISCO', 'RECOMENDAÇÃO']) {
      assert.match(result.stdout, new RegExp(heading));
    }
    assert.match(result.stdout, /nenhuma mudança foi aplicada à árvore real/);
  } finally {
    cleanup(graphRoot, workspace);
  }
});

test('simulate: violação de arquitetura injetada no ref → recommendation review, mesmo com teste passando', () => {
  const graphRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-simulate-fixture-'));
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-simulate-workspace-'));
  try {
    fs.mkdirSync(path.join(graphRoot, 'memory', '90-decisions'), { recursive: true });
    fs.mkdirSync(path.join(graphRoot, 'packages', 'policy', 'src'), { recursive: true });
    fs.mkdirSync(path.join(graphRoot, 'test'), { recursive: true });
    fs.writeFileSync(path.join(graphRoot, 'package.json'), JSON.stringify({ name: 'fx', scripts: { test: 'node --test' } }));
    fs.writeFileSync(
      path.join(graphRoot, 'memory', '90-decisions', '0099-isolamento.md'),
      '# ADR-0099: Isolamento de policy\n\n- **Status**: accepted\n\n## Constraints\n\n- packages/policy não depende de better-sqlite3\n',
    );
    fs.writeFileSync(path.join(graphRoot, 'packages', 'policy', 'src', 'index.ts'), "import { thing } from '../../contracts/src/index.ts';\n");
    fs.writeFileSync(path.join(graphRoot, 'test', 'basic.test.js'), "const { test } = require('node:test');\nconst assert = require('node:assert');\ntest('passes', () => { assert.equal(1, 1); });\n");
    git(['init', '-q'], graphRoot);
    git(['config', 'user.email', 'forja-test@example.invalid'], graphRoot);
    git(['config', 'user.name', 'Forja Test'], graphRoot);
    git(['add', '.'], graphRoot);
    git(['commit', '-qm', 'baseline'], graphRoot);
    const defaultBranch = git(['symbolic-ref', '--short', 'HEAD'], graphRoot).stdout.trim();

    // compile a constitution sobre o baseline (1 regra active) e commit ela — precisa estar
    // presente no ref simulado, já que architecture:check lê do worktree isolado, não do real.
    const compile = spawnSync(process.execPath, ['scripts/architecture.ts', 'compile'], { cwd: root, encoding: 'utf8', env: { ...process.env, FORJA_GRAPH_ROOT: graphRoot, FORJA_WORKSPACE: workspace, FORJA_RUNTIME_DB: path.join(workspace, 'universal.db') } });
    assert.equal(compile.status, 0, compile.stderr);
    git(['add', '.context/architecture/constitution.json'], graphRoot);
    git(['commit', '-qm', 'constitution'], graphRoot);

    git(['checkout', '-qb', 'feature'], graphRoot);
    fs.writeFileSync(path.join(graphRoot, 'packages', 'policy', 'src', 'index.ts'), "import Database from 'better-sqlite3';\n");
    git(['add', '.'], graphRoot);
    git(['commit', '-qm', 'violates the constitution'], graphRoot);
    git(['checkout', '-q', defaultBranch], graphRoot);

    const result = run(['feature', '--json'], graphRoot, workspace);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.testResult.passed, true);
    assert.ok('violations' in report.architectureCheck && report.architectureCheck.violations.length > 0);
    assert.equal(report.recommendation, 'review', 'violação de arquitetura ativa deve rebaixar de promote pra review, mesmo com teste ok');
  } finally {
    cleanup(graphRoot, workspace);
  }
});

test('simulate: exige um ref', () => {
  const graphRoot = createFixture({ passing: true });
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-simulate-workspace-'));
  try {
    const result = run([], graphRoot, workspace);
    assert.notEqual(result.status, 0);
  } finally {
    cleanup(graphRoot, workspace);
  }
});
