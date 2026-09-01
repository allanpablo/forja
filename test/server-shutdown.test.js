import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('apps/server/src/main.ts fecha o banco sqlite em SIGTERM em vez de deixar o handle aberto', async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-shutdown-'));
  try {
    const child = spawn(process.execPath, ['--import', 'tsx', 'test/server-shutdown-probe.mjs'], {
      cwd: root,
      env: { ...process.env, FORJA_WORKSPACE: workspace },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`server never printed READY: ${stdout}\n${stderr}`)), 15_000);
      const check = (chunk) => { if (stdout.includes('READY')) { clearTimeout(timer); child.stdout.off('data', check); resolve(undefined); } };
      child.stdout.on('data', check);
      if (stdout.includes('READY')) { clearTimeout(timer); resolve(undefined); }
    });

    child.kill('SIGTERM');
    const exitCode = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`server did not exit within timeout after SIGTERM: ${stdout}\n${stderr}`)), 15_000);
      child.once('exit', (code) => { clearTimeout(timer); resolve(code); });
    });

    assert.equal(exitCode, 0, `expected clean exit, got ${exitCode}: ${stdout}\n${stderr}`);
    assert.match(stdout, /received SIGTERM, closing database and shutting down/);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});
