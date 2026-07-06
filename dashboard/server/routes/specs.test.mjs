import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildServer } from '../index.mjs';
import { parseSpec } from '../lib/spec-parser.mjs';

const realRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-specs-'));
  process.env.FORJA_WORKSPACE = root;
  const specsDir = path.join(root, 'specs');
  fs.mkdirSync(path.join(specsDir, 'feature-alpha'), { recursive: true });
  fs.mkdirSync(path.join(specsDir, 'feature-beta'), { recursive: true });
  fs.mkdirSync(path.join(specsDir, '_templates'), { recursive: true });

  fs.writeFileSync(path.join(specsDir, 'feature-alpha', 'spec.md'), `# Spec: feature-alpha

- **ID**: SPEC-100
- **Status**: approved
- **Owner**: alice
- **Criado em**: 2026-05-01
- **Sprint alvo**: S1
- **ADRs relacionadas**: ADR-0001

## 1. Problema
Lorem ipsum.
`);
  fs.writeFileSync(path.join(specsDir, 'feature-alpha', 'plan.md'), '# Plan: feature-alpha\n\n- **Status**: review\n');

  fs.writeFileSync(path.join(specsDir, 'feature-beta', 'spec.md'), `# Spec: feature-beta

- **ID**: SPEC-101
- **Status**: draft
- **Owner**: bob
- **Criado em**: 2026-05-02
`);

  // template não deve aparecer
  fs.writeFileSync(path.join(specsDir, '_templates', 'spec.md'), '# Spec: template');
  fs.writeFileSync(path.join(specsDir, '_templates', 'plan.md'), '# Plan: {{FEATURE}}\n\n- **Status**: draft\n');
  fs.writeFileSync(path.join(specsDir, '_templates', 'tasks.md'), '# Tasks: {{FEATURE}}\n\n- **Status**: draft\n');
  return root;
}

test('parseSpec extrai campos do cabeçalho', () => {
  const m = parseSpec(`# Spec: foo

- **ID**: SPEC-42
- **Status**: review
- **Owner**: alice
- **Criado em**: 2026-05-10
`);
  assert.equal(m.title, 'foo');
  assert.equal(m.id, 'SPEC-42');
  assert.equal(m.status, 'review');
  assert.equal(m.owner, 'alice');
  assert.equal(m.createdAt, '2026-05-10');
});

test('parseSpec ignora linha-template de status', () => {
  const m = parseSpec(`# Spec: x
- **Status**: draft | review | approved | implementing | done | abandoned
`);
  assert.equal(m.status, 'draft');
});

test('parseSpec marca status desconhecido como unknown', () => {
  const m = parseSpec('# Spec: x\n- **Status**: maravilhoso\n');
  assert.equal(m.status, 'unknown');
});

test('GET /api/specs lista 2 features e ignora _templates', async () => {
  const root = makeFixture();
  const app = buildServer({ logger: false, repoRoot: root });
  const res = await app.inject({ method: 'GET', url: '/api/specs' });
  await app.close();
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.length, 2);
  const slugs = body.map(b => b.slug).sort();
  assert.deepEqual(slugs, ['feature-alpha', 'feature-beta']);
  const alpha = body.find(b => b.slug === 'feature-alpha');
  assert.equal(alpha.status, 'approved');
  assert.equal(alpha.owner, 'alice');
  assert.equal(alpha.hasplan, true);
  assert.equal(alpha.hastasks, false);
  const beta = body.find(b => b.slug === 'feature-beta');
  assert.equal(beta.hasplan, false);
});

test('GET /api/specs/:slug devolve conteúdo cru', async () => {
  const root = makeFixture();
  const app = buildServer({ logger: false, repoRoot: root });
  const res = await app.inject({ method: 'GET', url: '/api/specs/feature-alpha' });
  await app.close();
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.slug, 'feature-alpha');
  assert.match(body.spec, /SPEC-100/);
  assert.ok(body.plan);
  assert.equal(body.tasks, null);
  assert.equal(body.meta.status, 'approved');
});

test('GET /api/specs/:slug recusa slug inválido', async () => {
  const app = buildServer({ logger: false });
  const tests = ['../etc', 'Foo', 'has spaces', '', 'a'.repeat(80)];
  for (const bad of tests) {
    const res = await app.inject({ method: 'GET', url: `/api/specs/${encodeURIComponent(bad)}` });
    assert.ok([400, 404].includes(res.statusCode), `${bad} → ${res.statusCode}`);
  }
  await app.close();
});

test('GET /api/specs/:slug 404 para slug inexistente', async () => {
  const root = makeFixture();
  const app = buildServer({ logger: false, repoRoot: root });
  const res = await app.inject({ method: 'GET', url: '/api/specs/nao-existe' });
  await app.close();
  assert.equal(res.statusCode, 404);
});

test('POST /api/specs/:slug/status valida stage', async () => {
  const root = makeFixture();
  const app = buildServer({ logger: false, repoRoot: root });
  const res = await app.inject({
    method: 'POST', url: '/api/specs/feature-alpha/status',
    payload: { stage: 'bogus', status: 'review' },
  });
  await app.close();
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().code, 'INVALID_STAGE');
});

test('POST /api/specs/:slug/status valida status', async () => {
  const root = makeFixture();
  const app = buildServer({ logger: false, repoRoot: root });
  const res = await app.inject({
    method: 'POST', url: '/api/specs/feature-alpha/status',
    payload: { stage: 'spec', status: 'maravilhoso' },
  });
  await app.close();
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().code, 'INVALID_STATUS');
});

test('POST /api/specs/:slug/status muda status via spec-cli', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-stat-'));
  process.env.FORJA_WORKSPACE = root;
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'specs', 'foo'), { recursive: true });
  fs.copyFileSync(path.join(realRepoRoot, 'scripts/spec-cli.mjs'), path.join(root, 'scripts/spec-cli.mjs'));
  fs.writeFileSync(path.join(root, 'specs/foo/spec.md'), '# Spec: foo\n\n- **Status**: draft\n');

  const app = buildServer({ logger: false, repoRoot: root });
  const res = await app.inject({
    method: 'POST', url: '/api/specs/foo/status',
    payload: { stage: 'spec', status: 'review' },
  });
  await app.close();
  assert.equal(res.statusCode, 200, res.body);
  const body = res.json();
  assert.equal(body.from, 'draft');
  assert.equal(body.to, 'review');
  const content = fs.readFileSync(path.join(root, 'specs/foo/spec.md'), 'utf8');
  assert.match(content, /- \*\*Status\*\*: review/);
});

test('POST /api/specs/:slug/generate/:stage cria plan via spec-cli', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-generate-'));
  process.env.FORJA_WORKSPACE = root;
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'specs', '_templates'), { recursive: true });
  fs.mkdirSync(path.join(root, 'specs', 'foo'), { recursive: true });
  fs.copyFileSync(path.join(realRepoRoot, 'scripts/spec-cli.mjs'), path.join(root, 'scripts/spec-cli.mjs'));
  fs.copyFileSync(path.join(realRepoRoot, 'specs/_templates/plan.md'), path.join(root, 'specs/_templates/plan.md'));
  fs.writeFileSync(path.join(root, 'specs/foo/spec.md'), '# Spec: foo\n\n- **Status**: approved\n');

  const app = buildServer({ logger: false, repoRoot: root });
  const res = await app.inject({
    method: 'POST', url: '/api/specs/foo/generate/plan',
    payload: {},
  });
  await app.close();
  assert.equal(res.statusCode, 200, res.body);
  assert.ok(fs.existsSync(path.join(root, 'specs/foo/plan.md')));
  assert.match(fs.readFileSync(path.join(root, 'specs/foo/plan.md'), 'utf8'), /# Plan: foo/);
});

test('POST /api/specs/:slug/generate/:stage retorna 409 se gate falhar', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-generate-fail-'));
  process.env.FORJA_WORKSPACE = root;
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'specs', '_templates'), { recursive: true });
  fs.mkdirSync(path.join(root, 'specs', 'foo'), { recursive: true });
  fs.copyFileSync(path.join(realRepoRoot, 'scripts/spec-cli.mjs'), path.join(root, 'scripts/spec-cli.mjs'));
  fs.copyFileSync(path.join(realRepoRoot, 'specs/_templates/plan.md'), path.join(root, 'specs/_templates/plan.md'));
  fs.writeFileSync(path.join(root, 'specs/foo/spec.md'), '# Spec: foo\n\n- **Status**: draft\n');

  const app = buildServer({ logger: false, repoRoot: root });
  const res = await app.inject({
    method: 'POST', url: '/api/specs/foo/generate/plan',
    payload: {},
  });
  await app.close();
  assert.equal(res.statusCode, 409, res.body);
  assert.equal(res.json().code, 'SPEC_CLI_FAILED');
  assert.match(res.json().error, /Precisa de "approved"/);
});

test('GET /api/specs sem specs/ devolve array vazio', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-empty-'));
  process.env.FORJA_WORKSPACE = root;
  const app = buildServer({ logger: false, repoRoot: root });
  const res = await app.inject({ method: 'GET', url: '/api/specs' });
  await app.close();
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), []);
});
