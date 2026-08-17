import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { createDemoWorkspace } from '../scripts/demo-workspace.ts';

test('demo workspace is isolated, labeled and idempotent', async () => {
  const workspace = path.join(os.tmpdir(), `forja-demo-workspace-${Date.now()}`);
  const previous = process.env.FORJA_WORKSPACE;
  try {
    const created = await createDemoWorkspace(['--path', workspace]);
    assert.equal(created.project, 'atlas-pay');
    assert.equal(created.handoffs, 3);
    assert.ok(fs.existsSync(path.join(workspace, '.context', 'forja-demo.json')));
    assert.ok(fs.existsSync(path.join(workspace, 'specs', 'atlas-pay', 'spec.md')));
    const db = new Database(path.join(workspace, 'memory', 'sqlite', 'universal.db'), { readonly: true });
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM handoffs WHERE spec_slug = ?').get('atlas-pay').total, 3);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM forja_records WHERE collection = 'observation'").get().total, 3);
    db.close();
    await createDemoWorkspace(['--path', workspace]);
    const repeated = new Database(path.join(workspace, 'memory', 'sqlite', 'universal.db'), { readonly: true });
    assert.equal(repeated.prepare('SELECT COUNT(*) AS total FROM handoffs WHERE spec_slug = ?').get('atlas-pay').total, 3);
    repeated.close();
  } finally {
    if (previous === undefined) delete process.env.FORJA_WORKSPACE;
    else process.env.FORJA_WORKSPACE = previous;
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('demo workspace refuses to write into an existing non-demo directory', async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-not-demo-'));
  const previous = process.env.FORJA_WORKSPACE;
  try {
    await assert.rejects(createDemoWorkspace(['--path', workspace]), /não é um workspace demo/);
  } finally {
    if (previous === undefined) delete process.env.FORJA_WORKSPACE;
    else process.env.FORJA_WORKSPACE = previous;
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});
