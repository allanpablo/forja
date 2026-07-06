import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildServer } from '../index.mjs';

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-proj-'));
  process.env.FORJA_WORKSPACE = root;
  const projDir = path.join(root, 'projects');
  fs.mkdirSync(path.join(projDir, 'alpha', 'memory'), { recursive: true });
  fs.writeFileSync(path.join(projDir, 'alpha', 'memory', 'mission.md'), 'x'.repeat(1234));
  fs.mkdirSync(path.join(projDir, 'beta'), { recursive: true });
  // diretório oculto não conta
  fs.mkdirSync(path.join(projDir, '.cache'), { recursive: true });
  // arquivo solto também não
  fs.writeFileSync(path.join(projDir, 'README.md'), 'no');
  return root;
}

test('GET /api/projects lista projetos válidos', async () => {
  const root = makeFixture();
  const app = buildServer({ logger: false, repoRoot: root });
  const res = await app.inject({ method: 'GET', url: '/api/projects' });
  await app.close();
  assert.equal(res.statusCode, 200);
  const body = res.json();
  const names = body.map(b => b.name).sort();
  assert.deepEqual(names, ['alpha', 'beta']);
});

test('GET /api/projects calcula memory_bytes apenas para quem tem memory/', async () => {
  const root = makeFixture();
  const app = buildServer({ logger: false, repoRoot: root });
  const res = await app.inject({ method: 'GET', url: '/api/projects' });
  await app.close();
  const body = res.json();
  const alpha = body.find(b => b.name === 'alpha');
  const beta = body.find(b => b.name === 'beta');
  assert.ok(alpha.memory_bytes >= 1234, `alpha bytes=${alpha.memory_bytes}`);
  assert.equal(beta.memory_bytes, 0);
});

test('GET /api/projects last_commit é null sem .git', async () => {
  const root = makeFixture();
  const app = buildServer({ logger: false, repoRoot: root });
  const res = await app.inject({ method: 'GET', url: '/api/projects' });
  await app.close();
  const body = res.json();
  assert.ok(body.every(b => b.last_commit === null));
});

test('GET /api/projects sem projects/ devolve []', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-empty-'));
  process.env.FORJA_WORKSPACE = root;
  const app = buildServer({ logger: false, repoRoot: root });
  const res = await app.inject({ method: 'GET', url: '/api/projects' });
  await app.close();
  assert.deepEqual(res.json(), []);
});

test('GET /api/projects handoffs_breakdown tem schema esperado', async () => {
  const root = makeFixture();
  const app = buildServer({ logger: false, repoRoot: root });
  const res = await app.inject({ method: 'GET', url: '/api/projects' });
  await app.close();
  const body = res.json();
  for (const p of body) {
    assert.equal(typeof p.handoffs_open, 'number');
    assert.deepEqual(Object.keys(p.handoffs_breakdown).sort(), ['cancelled', 'done', 'in_progress', 'open']);
  }
});

test('POST /api/projects/:name/status persiste estado administrativo', async () => {
  const root = makeFixture();
  const app = buildServer({ logger: false, repoRoot: root });
  const res = await app.inject({
    method: 'POST',
    url: '/api/projects/alpha/status',
    payload: { status: 'paused' },
  });
  await app.close();
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.admin.status, 'paused');
  const adminFile = path.join(root, 'projects', 'alpha', 'project-admin.json');
  assert.ok(fs.existsSync(adminFile));
  const saved = JSON.parse(fs.readFileSync(adminFile, 'utf8'));
  assert.equal(saved.status, 'paused');
});
