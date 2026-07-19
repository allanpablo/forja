import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { syncAudit, queryAudit, auditSummary, lastExit } from '../lib/audit.mjs';

/** Ambiente descartável: um jsonl de fixture + um db temporário. Sem tocar o workspace real. */
function tmpEnv(lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-audit-'));
  const jsonlPath = path.join(dir, 'forja-runs.jsonl');
  fs.writeFileSync(jsonlPath, lines.join('\n') + '\n');
  return { fs, dbPath: path.join(dir, 'test.db'), jsonlPath };
}

const run = (cmd, exitCode = 0, durationMs = 10, ts = '2026-07-18T12:00:00.000Z') =>
  JSON.stringify({ ts, cmd, args: [], exitCode, durationMs });

test('syncAudit ingere o jsonl e conta', async () => {
  const env = tmpEnv([run('tools:doctor'), run('release:check', 1, 4800)]);
  const r = await syncAudit(env);
  assert.equal(r.ingested, 2);
  assert.equal(r.total, 2);
});

test('syncAudit é idempotente — re-sync não duplica (AC-1)', async () => {
  const env = tmpEnv([run('tools:doctor'), run('release:check')]);
  await syncAudit(env);
  const second = await syncAudit(env);
  assert.equal(second.ingested, 0, 'nada novo na 2ª passada');
  assert.equal(second.total, 2);
});

test('syncAudit pula linha corrompida sem derrubar o resto', async () => {
  const env = tmpEnv([run('tools:doctor'), '{ not json', run('spec:check')]);
  const r = await syncAudit(env);
  assert.equal(r.ingested, 2);
  assert.equal(r.skipped, 1);
});

test('syncAudit sem jsonl não estoura (AC-6)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-audit-'));
  const r = await syncAudit({ fs, dbPath: path.join(dir, 'x.db'), jsonlPath: path.join(dir, 'nao-existe.jsonl') });
  assert.deepEqual(r, { ingested: 0, total: 0, skipped: 0 });
});

test('queryAudit --failed traz só as reprovações', async () => {
  const env = tmpEnv([run('a:ok', 0), run('b:fail', 1), run('c:ok', 0)]);
  await syncAudit(env);
  const failed = await queryAudit(env, { failed: true });
  assert.equal(failed.length, 1);
  assert.equal(failed[0].cmd, 'b:fail');
});

test('queryAudit --cmd filtra por comando', async () => {
  const env = tmpEnv([run('release:check', 1), run('tools:doctor', 0), run('release:check', 0)]);
  await syncAudit(env);
  const rc = await queryAudit(env, { cmd: 'release:check' });
  assert.equal(rc.length, 2);
});

test('queryAudit --since corta pela janela de tempo', async () => {
  const old = new Date(Date.now() - 10 * 864e5).toISOString();
  const recent = new Date(Date.now() - 1 * 36e5).toISOString();
  const env = tmpEnv([run('a', 0, 10, old), run('b', 0, 10, recent)]);
  await syncAudit(env);
  const last7d = await queryAudit(env, { since: '7d' });
  assert.deepEqual(last7d.map((r) => r.cmd), ['b']);
});

test('auditSummary agrega total, falhas e por comando', async () => {
  const env = tmpEnv([run('doctor', 0, 100), run('doctor', 1, 200), run('release', 0, 5000)]);
  await syncAudit(env);
  const s = await auditSummary(env);
  assert.equal(s.total, 3);
  assert.equal(s.fails, 1);
  const doctor = s.byCmd.find((c) => c.cmd === 'doctor');
  assert.equal(doctor.runs, 2);
  assert.equal(doctor.fails, 1);
});

test('lastExit devolve o exit mais recente de um comando (D4)', async () => {
  const env = tmpEnv([
    run('release:check', 1, 10, '2026-07-18T10:00:00.000Z'),
    run('release:check', 0, 10, '2026-07-18T11:00:00.000Z'),
  ]);
  await syncAudit(env);
  const last = await lastExit(env, 'release:check');
  assert.equal(last.exitCode, 0, 'o mais recente, não o primeiro');
});
