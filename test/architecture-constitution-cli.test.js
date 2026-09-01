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

/** Fixture pequena e isolada: uma ADR com uma constraint reconhecida, mais o arquivo que a viola
 *  (e um que não viola), para exercitar architecture:compile + :check de ponta a ponta rápido. */
function createFixture({ violating }) {
  const graphRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-architecture-fixture-'));
  fs.mkdirSync(path.join(graphRoot, 'memory', '90-decisions'), { recursive: true });
  fs.mkdirSync(path.join(graphRoot, 'packages', 'policy', 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(graphRoot, 'memory', '90-decisions', '0099-isolamento.md'),
    '# ADR-0099: Isolamento de policy\n\n- **Status**: accepted\n\n## Decision\n\nblá.\n\n## Constraints\n\n- packages/policy não depende de better-sqlite3\n',
  );
  const importLine = violating ? "import Database from 'better-sqlite3';\n" : "import { thing } from '../../contracts/src/index.ts';\n";
  fs.writeFileSync(path.join(graphRoot, 'packages', 'policy', 'src', 'index.ts'), importLine);
  git(['init', '-q'], graphRoot);
  git(['config', 'user.email', 'forja-test@example.invalid'], graphRoot);
  git(['config', 'user.name', 'Forja Test'], graphRoot);
  git(['add', '.'], graphRoot);
  git(['commit', '-qm', 'fixture'], graphRoot);
  return graphRoot;
}

function run(args, graphRoot, workspace) {
  return spawnSync(process.execPath, ['scripts/architecture.ts', ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, FORJA_GRAPH_ROOT: graphRoot, FORJA_WORKSPACE: workspace, FORJA_RUNTIME_DB: path.join(workspace, 'universal.db') },
  });
}

function cleanup(graphRoot, workspace) {
  fs.rmSync(graphRoot, { recursive: true, force: true });
  fs.rmSync(workspace, { recursive: true, force: true });
}

test('architecture:compile + :check — linha de base limpa não acusa violação', () => {
  const graphRoot = createFixture({ violating: false });
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-architecture-workspace-'));
  try {
    const compile = run(['compile'], graphRoot, workspace);
    assert.equal(compile.status, 0, compile.stderr);
    assert.match(compile.stdout, /1 active/);
    assert.ok(fs.existsSync(path.join(graphRoot, '.context', 'architecture', 'constitution.json')));

    const check = run(['check'], graphRoot, workspace);
    assert.equal(check.status, 0, check.stderr);
    assert.match(check.stdout, /Nenhuma violação/);
  } finally {
    cleanup(graphRoot, workspace);
  }
});

test('architecture:check detecta uma violação real injetada na fixture', () => {
  const graphRoot = createFixture({ violating: true });
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-architecture-workspace-'));
  try {
    run(['compile'], graphRoot, workspace);
    const check = run(['check'], graphRoot, workspace);
    assert.equal(check.status, 1, 'violação encontrada deve sair com status != 0');
    assert.match(check.stdout, /VIOLATIONS/);
    assert.match(check.stdout, /packages\/policy\/src\/index\.ts/);
    assert.match(check.stdout, /better-sqlite3/);
  } finally {
    cleanup(graphRoot, workspace);
  }
});

test('architecture:status / :explain / :approve — ciclo completo de aprovação', () => {
  const graphRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-architecture-fixture-'));
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-architecture-workspace-'));
  try {
    fs.mkdirSync(path.join(graphRoot, 'memory', '90-decisions'), { recursive: true });
    fs.writeFileSync(
      path.join(graphRoot, 'memory', '90-decisions', '0100-ambigua.md'),
      '# ADR-0100\n\n## Constraints\n\n- deveríamos pensar melhor nisso\n',
    );
    git(['init', '-q'], graphRoot);
    git(['config', 'user.email', 'forja-test@example.invalid'], graphRoot);
    git(['config', 'user.name', 'Forja Test'], graphRoot);
    git(['add', '.'], graphRoot);
    git(['commit', '-qm', 'fixture'], graphRoot);

    run(['compile'], graphRoot, workspace);
    const status = run(['status'], graphRoot, workspace);
    assert.match(status.stdout, /0 regra\(s\) active, 1 proposed\./);
    const ruleId = /proposed\s+(\S+)/.exec(status.stdout)?.[1];
    assert.ok(ruleId, `esperava encontrar um rule id proposed em: ${status.stdout}`);

    const explain = run(['explain', ruleId], graphRoot, workspace);
    assert.equal(explain.status, 0, explain.stderr);
    assert.match(explain.stdout, /deveríamos pensar melhor nisso/);

    const approve = run(['approve', ruleId], graphRoot, workspace);
    assert.equal(approve.status, 0, approve.stderr);
    assert.match(approve.stdout, /promovido a active/);

    const statusAfter = run(['status'], graphRoot, workspace);
    assert.match(statusAfter.stdout, /1 regra\(s\) active, 0 proposed\./);
  } finally {
    cleanup(graphRoot, workspace);
  }
});
