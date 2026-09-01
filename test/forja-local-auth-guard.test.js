import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('ForjaLocalAuthGuard: sem token cai para loopback-only (fail-closed), com token exige Bearer', async () => {
  const child = spawn(process.execPath, ['--import', 'tsx', 'test/forja-local-auth-guard-probe.mjs'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const exitCode = await new Promise((resolve) => child.once('exit', (code) => resolve(code)));
  assert.equal(exitCode, 0, `probe failed: ${stdout}\n${stderr}`);
  assert.match(stdout, /OK/);
});
