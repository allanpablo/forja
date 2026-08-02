import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('server oficial: runtime, approval, checkpoint, contexto, graph, evento e observabilidade sobrevivem ao restart', async () => {
  const child = spawn(process.execPath, ['--import', 'tsx', 'test/server-persistence-probe.mjs'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const exitCode = await new Promise((resolve) => child.once('exit', (code) => resolve(code)));
  assert.equal(exitCode, 0, `probe failed: ${stdout}\n${stderr}`);
  const result = JSON.parse(stdout.trim());
  assert.equal(result.ok, true);
  assert.equal(result.state, 'awaiting_approval');
  assert.equal(result.approvals, 1);
  assert.equal(result.context, 'evidence context');
  assert.equal(result.graphNodes, 1);
  assert.ok(result.events >= 1);
  assert.ok(result.observations >= 1);
});
