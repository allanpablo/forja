import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildServer } from '../index.mjs';
import { estimateTokens, CHARS_PER_TOKEN } from '../lib/token-estimator.mjs';

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-tok-'));
  process.env.FORJA_WORKSPACE = root;
  fs.mkdirSync(path.join(root, '.context'), { recursive: true });
  fs.writeFileSync(path.join(root, '.context', 'pack.md'), 'x'.repeat(4000)); // ~1000 tokens

  fs.mkdirSync(path.join(root, 'projects', 'p1', '.context'), { recursive: true });
  fs.writeFileSync(path.join(root, 'projects', 'p1', '.context', 'a.md'), 'a'.repeat(8000));

  fs.mkdirSync(path.join(root, 'projects', 'p1', 'memory', '60-runs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'projects', 'p1', 'memory', '60-runs', 'r1.json'),
    JSON.stringify({ tokens_in: 500, tokens_out: 200 }));
  fs.writeFileSync(path.join(root, 'projects', 'p1', 'memory', '60-runs', 'r2.json'),
    JSON.stringify({ bytes_in: 4000, bytes_out: 800 }));

  fs.mkdirSync(path.join(root, 'projects', 'p2'), { recursive: true });
  return root;
}

test('estimateTokens agrega contexto e runs', async () => {
  const root = makeFixture();
  const r = await estimateTokens(root, { days: 30 });
  assert.equal(r.method, 'estimate');
  assert.ok(r.series.length > 0);
  const total = r.series.reduce((s, x) => s + x.tokens_in + x.tokens_out, 0);
  // framework: 1000 + projeto p1 ctx: 2000 + run1: 500+200 + run2: 1000+200 = 4900
  assert.equal(total, 4900);
});

test('estimateTokens filtra por projeto', async () => {
  const root = makeFixture();
  const r = await estimateTokens(root, { project: 'p1', days: 30 });
  for (const point of r.series) {
    assert.equal(point.project, 'p1');
  }
});

test('estimateTokens projeto inexistente → série vazia', async () => {
  const root = makeFixture();
  const r = await estimateTokens(root, { project: 'naoexiste', days: 30 });
  assert.deepEqual(r.series, []);
});

test('GET /api/tokens responde 200 com schema', async () => {
  const root = makeFixture();
  const app = buildServer({ logger: false, repoRoot: root });
  const res = await app.inject({ method: 'GET', url: '/api/tokens?days=30' });
  await app.close();
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.method, 'estimate');
  assert.equal(body.formula, 'bytes / 4');
  assert.equal(body.days, 30);
  assert.ok(Array.isArray(body.series));
});

test('GET /api/tokens?project=p1 filtra', async () => {
  const root = makeFixture();
  const app = buildServer({ logger: false, repoRoot: root });
  const res = await app.inject({ method: 'GET', url: '/api/tokens?project=p1' });
  await app.close();
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(body.series.every(s => s.project === 'p1'));
});

test('GET /api/tokens valida project', async () => {
  const root = makeFixture();
  const app = buildServer({ logger: false, repoRoot: root });
  const res = await app.inject({ method: 'GET', url: '/api/tokens?project=..%2Fetc' });
  await app.close();
  assert.equal(res.statusCode, 400);
});

test('GET /api/tokens valida days', async () => {
  const root = makeFixture();
  const app = buildServer({ logger: false, repoRoot: root });
  const res = await app.inject({ method: 'GET', url: '/api/tokens?days=9999' });
  await app.close();
  assert.equal(res.statusCode, 400);
});

test('NFR: GET /api/tokens < 500ms com fixture vazia + projeto real', async () => {
  // sem fixture; usa repoRoot real (que tem alguns projetos)
  const app = buildServer({ logger: false });
  const t0 = Date.now();
  const res = await app.inject({ method: 'GET', url: '/api/tokens?days=30' });
  const dt = Date.now() - t0;
  await app.close();
  assert.equal(res.statusCode, 200);
  assert.ok(dt < 500, `tokens endpoint demorou ${dt}ms (NFR < 500ms)`);
});
