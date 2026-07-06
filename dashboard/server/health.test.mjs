import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from './index.mjs';

test('GET /api/health → 200 ok=true', async () => {
  const app = buildServer({ logger: false });
  const res = await app.inject({ method: 'GET', url: '/api/health' });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.ok, true);
  assert.equal(body.service, 'agent-dashboard');
  assert.ok(body.repoRoot, 'repoRoot deve ser exposto');
  assert.ok(body.time, 'time deve ser ISO string');
  await app.close();
});

test('rota desconhecida → 404', async () => {
  const app = buildServer({ logger: false });
  const res = await app.inject({ method: 'GET', url: '/api/nao-existe' });
  assert.equal(res.statusCode, 404);
  await app.close();
});
