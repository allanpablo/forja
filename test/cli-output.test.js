import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const probe = path.join(__dirname, 'fixtures', 'emit-probe.ts');

function run(which) {
  const r = spawnSync(process.execPath, [probe, which], { encoding: 'utf8' });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

test('emitOk: {status:"ok", ...fields}, exit 0, uma linha JSON', () => {
  const r = run('ok');
  assert.equal(r.code, 0);
  const lines = r.stdout.trim().split('\n');
  assert.equal(lines.length, 1);
  const d = JSON.parse(lines[0]);
  assert.equal(d.status, 'ok');
  assert.equal(d.foo, 1);
});

test('emitError: {status:"error", error:{message,code}}, exit 1, detail no stderr', () => {
  const r = run('error');
  assert.equal(r.code, 1);
  const d = JSON.parse(r.stdout.trim());
  assert.equal(d.status, 'error');
  assert.equal(d.error.message, 'deu ruim');
  assert.equal(d.error.code, 'BOOM');
  assert.match(r.stderr, /rastro no stderr/);
  assert.doesNotMatch(r.stdout, /rastro no stderr/);
});

test('emitRejected: {status:"rejected", ...fields}, exit 2', () => {
  const r = run('rejected');
  assert.equal(r.code, 2);
  const d = JSON.parse(r.stdout.trim());
  assert.equal(d.status, 'rejected');
  assert.equal(d.recommendation, 'discard');
});
