import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// A suíte não pode gravar na trilha de auditoria real do usuário (~/forja-workspace/.context).
test('suíte roda com workspace isolado: FORJA_WORKSPACE aponta para fora do workspace real', () => {
  const ws = process.env.FORJA_WORKSPACE;
  assert.ok(ws, 'test/isolate-workspace.mjs não foi pré-carregado (veja o script "test" do package.json)');
  assert.ok(ws.startsWith(os.tmpdir()), `workspace de teste fora do tmp: ${ws}`);
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(pkg.scripts.test, /--import \.\/test\/isolate-workspace\.mjs/);
});

test('CLI chamado com o env da suíte não audita em lugar nenhum', (t) => {
  // Sem isolamento, chamar o CLI gravaria justamente na trilha real que este teste protege.
  if (!process.env.FORJA_WORKSPACE?.startsWith(os.tmpdir())) return t.skip('workspace não isolado (veja o teste anterior)');
  const r = spawnSync(process.execPath, [path.join(root, 'bin/forja.ts'), 'spec:new'], { cwd: root, encoding: 'utf8', env: process.env });
  assert.equal(r.status, 1);
  assert.equal(fs.existsSync(process.env.FORJA_WORKSPACE), false, 'o CLI criou o workspace de teste');
});
