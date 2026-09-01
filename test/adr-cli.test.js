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

/** ADR + spec fixture pequena e isolada — evita indexar o repo inteiro num teste rápido. */
function createFixture() {
  const graphRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-adr-fixture-'));
  fs.mkdirSync(path.join(graphRoot, 'memory', '90-decisions'), { recursive: true });
  fs.mkdirSync(path.join(graphRoot, 'specs', 'exemplo'), { recursive: true });
  fs.writeFileSync(
    path.join(graphRoot, 'memory', '90-decisions', '0099-exemplo.md'),
    '# ADR-0099: Exemplo de teste\n\n- **Status**: accepted\n- **Data**: 2026-01-01\n\n## Context\n\nTeste.\n\n## Decision\n\nTeste.\n\n## Constraints\n\n- billing não importa database diretamente\n- pagamentos usam PaymentGateway\n',
  );
  fs.writeFileSync(
    path.join(graphRoot, 'specs', 'exemplo', 'spec.md'),
    '# Spec: Exemplo\n\n- **ID**: SPEC-999\n- **Status**: draft\n\nReferencia ADR-0099.\n',
  );
  git(['init', '-q'], graphRoot);
  git(['config', 'user.email', 'forja-test@example.invalid'], graphRoot);
  git(['config', 'user.name', 'Forja Test'], graphRoot);
  git(['add', '.'], graphRoot);
  git(['commit', '-qm', 'fixture: ADR-0099 + SPEC-999'], graphRoot);
  return graphRoot;
}

function run(args, graphRoot, workspace) {
  return spawnSync(process.execPath, ['scripts/adr.ts', ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, FORJA_GRAPH_ROOT: graphRoot, FORJA_WORKSPACE: workspace, FORJA_RUNTIME_DB: path.join(workspace, 'universal.db') },
  });
}

test('adr:list / show / impact / graph operam sobre uma fixture isolada', () => {
  const graphRoot = createFixture();
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-adr-workspace-'));
  try {
    const list = run(['list'], graphRoot, workspace);
    assert.equal(list.status, 0, list.stderr);
    assert.match(list.stdout, /ADR-0099/);
    assert.match(list.stdout, /accepted/);

    const show = run(['show', '0099'], graphRoot, workspace);
    assert.equal(show.status, 0, show.stderr);
    assert.match(show.stdout, /ADR-0099 — accepted/);
    assert.match(show.stdout, /billing não importa database diretamente/);

    const impact = run(['impact', 'ADR-0099'], graphRoot, workspace);
    assert.equal(impact.status, 0, impact.stderr);
    // A própria ADR e a spec.md que a referencia devem aparecer como alcançáveis.
    assert.match(impact.stdout, /Document/);

    const graph = run(['graph'], graphRoot, workspace);
    assert.equal(graph.status, 0, graph.stderr);
    const parsed = JSON.parse(graph.stdout);
    const labels = parsed.nodes.map((node) => node.label);
    assert.ok(labels.includes('ADR-0099'));
    assert.ok(labels.includes('SPEC-999'));
    const adrNode = parsed.nodes.find((node) => node.label === 'ADR-0099');
    assert.equal(adrNode.documentStatus, 'accepted');
    const specNode = parsed.nodes.find((node) => node.label === 'SPEC-999');
    assert.equal(specNode.documentStatus, 'draft');
  } finally {
    fs.rmSync(graphRoot, { recursive: true, force: true });
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('adr:show recusa id inexistente com mensagem clara', () => {
  const graphRoot = createFixture();
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-adr-workspace-'));
  try {
    const show = run(['show', '9999'], graphRoot, workspace);
    assert.equal(show.status, 1);
    assert.match(show.stderr, /ADR não encontrada no grafo: ADR-9999/);
  } finally {
    fs.rmSync(graphRoot, { recursive: true, force: true });
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});
