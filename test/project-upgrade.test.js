import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { planUpgrade, applyUpgrade, listFiles } from '../lib/project-upgrade.ts';

function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-upg-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return root;
}
const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const clean = (...roots) => roots.forEach((r) => fs.rmSync(r, { recursive: true, force: true }));

test('listFiles ignora node_modules/.git/.memory/.context/dist', () => {
  const root = tree({
    'AGENTS.md': 'x',
    'memory/00-global/mission.md': 'x',
    'node_modules/lib/a.js': 'x',
    '.memory/sqlite/db': 'x',
    '.context/run.jsonl': 'x',
  });
  assert.deepEqual(listFiles(root).sort(), ['AGENTS.md', 'memory/00-global/mission.md']);
  clean(root);
});

test('planUpgrade lista só o que falta no alvo (aditivo)', () => {
  const fresh = tree({ 'AGENTS.md': 'v2', 'agents/novo.md': 'novo', 'memory/70-summaries/x.md': 'novo' });
  const target = tree({ 'AGENTS.md': 'v1 editado' });
  const plan = planUpgrade(fresh, target);
  assert.deepEqual(plan.newFiles.sort(), ['agents/novo.md', 'memory/70-summaries/x.md']);
  assert.equal(plan.existing, 1, 'AGENTS.md existe nos dois → não é peça nova');
  clean(fresh, target);
});

test('applyUpgrade copia as peças novas e NÃO sobrescreve o existente', () => {
  const fresh = tree({ 'AGENTS.md': 'SCAFFOLD NOVO', 'agents/novo.md': 'conteúdo novo' });
  const target = tree({ 'AGENTS.md': 'EDIT DO USUARIO' });
  const plan = planUpgrade(fresh, target);
  const applied = applyUpgrade(fresh, target, plan);

  assert.deepEqual(applied, ['agents/novo.md']);
  assert.equal(read(target, 'agents/novo.md'), 'conteúdo novo', 'peça nova copiada');
  assert.equal(read(target, 'AGENTS.md'), 'EDIT DO USUARIO', 'edição do usuário intocada');
  clean(fresh, target);
});

test('projeto já em dia: nenhuma peça nova', () => {
  const fresh = tree({ 'AGENTS.md': 'x', 'a.md': 'y' });
  const target = tree({ 'AGENTS.md': 'x', 'a.md': 'y', 'user-code.ts': 'meu' });
  const plan = planUpgrade(fresh, target);
  assert.deepEqual(plan.newFiles, []);
  clean(fresh, target);
});
