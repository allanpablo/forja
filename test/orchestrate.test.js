import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { startRun, advance, loadState, chainFor, handoffFor, artifactReady } from '../lib/orchestrate.ts';

function tmpRoot(files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-orch-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return root;
}
const clean = (root) => fs.rmSync(root, { recursive: true, force: true });
const green = () => ({ code: 0, output: 'ok' });
const red = () => ({ code: 1, output: 'reprovado' });
const SPEC_OK = '# Spec\n- **Status**: approved\n';

test('startRun abre a cadeia SDD/GSD com a 1ª etapa aberta', () => {
  const root = tmpRoot();
  const state = startRun({ root, slug: 'x', goal: 'objetivo' });
  assert.deepEqual(state.stages.map((s) => s.id), ['spec', 'plan', 'tasks', 'implement', 'review']);
  assert.equal(state.stages[0].status, 'open');
  assert.ok(state.stages.slice(1).every((s) => s.status === 'pending'));
  assert.ok(loadState(root, 'x'), 'estado persistido em .context/');
  clean(root);
});

test('startRun recusa sobrescrever uma corrida existente', () => {
  const root = tmpRoot();
  startRun({ root, slug: 'x', goal: 'a' });
  assert.throws(() => startRun({ root, slug: 'x', goal: 'b' }), /já existe/);
  clean(root);
});

test('advance sem o artefato da etapa BLOQUEIA antes mesmo do gate (o furo do test-drive)', () => {
  const root = tmpRoot();
  startRun({ root, slug: 'x', goal: 'g' });
  let gateRodou = false;
  const r = advance({ root, slug: 'x', runGate: () => { gateRodou = true; return green(); } });
  assert.equal(r.advanced, false);
  assert.match(r.stage.verdict, /spec\.md não existe/);
  assert.equal(gateRodou, false, 'sem artefato, o gate nem roda — trabalho não feito');
  clean(root);
});

test('advance com artefato draft bloqueia (existe não é aprovado)', () => {
  const root = tmpRoot({ 'specs/x/spec.md': '# Spec\n- **Status**: draft\n' });
  startRun({ root, slug: 'x', goal: 'g' });
  const r = advance({ root, slug: 'x', runGate: green });
  assert.equal(r.advanced, false);
  assert.match(r.stage.verdict, /"draft"/);
  clean(root);
});

test('advance com artefato ok mas gate vermelho bloqueia com o parecer', () => {
  const root = tmpRoot({ 'specs/x/spec.md': SPEC_OK });
  startRun({ root, slug: 'x', goal: 'g' });
  const r = advance({ root, slug: 'x', runGate: red });
  assert.equal(r.advanced, false);
  assert.match(r.stage.verdict, /gate reprovou/);
  const persisted = loadState(root, 'x');
  assert.equal(persisted.current, 0, 'a máquina não anda com gate vermelho');
  clean(root);
});

test('advance verde fecha a etapa e abre a próxima', () => {
  const root = tmpRoot({ 'specs/x/spec.md': SPEC_OK });
  startRun({ root, slug: 'x', goal: 'g' });
  const r = advance({ root, slug: 'x', runGate: green });
  assert.equal(r.advanced, true);
  assert.equal(r.stage.id, 'spec');
  assert.equal(r.next.id, 'plan');
  assert.equal(r.next.status, 'open');
  clean(root);
});

test('a corrida termina após a última etapa e advance extra é inócuo', () => {
  const root = tmpRoot({
    'specs/x/spec.md': SPEC_OK,
    'specs/x/plan.md': SPEC_OK,
    'specs/x/tasks.md': SPEC_OK,
  });
  startRun({ root, slug: 'x', goal: 'g' });
  let r;
  for (let i = 0; i < 5; i += 1) r = advance({ root, slug: 'x', runGate: green });
  assert.equal(r.finished, true, '5 etapas verdes → concluída');
  const extra = advance({ root, slug: 'x', runGate: green });
  assert.equal(extra.advanced, false);
  assert.equal(extra.finished, true);
  clean(root);
});

test('handoffFor produz os 7 campos do ADR-0005 para o dono certo', () => {
  const h = handoffFor('x', 'objetivo', 3); // implement
  for (const campo of ['from', 'to', 'intent', 'context', 'acceptance', 'constraints', 'return']) {
    assert.ok(h[campo], `campo ${campo} presente`);
  }
  assert.equal(h.to, 'worker');
  assert.equal(h.intent, 'implement');
  assert.match(h.return, /orchestrate:advance x/);
});

test('artifactReady: os três estados', () => {
  const root = tmpRoot({ 'specs/x/spec.md': SPEC_OK, 'specs/x/plan.md': '- **Status**: review\n' });
  assert.equal(artifactReady(root, 'x', 'spec').ok, true);
  assert.equal(artifactReady(root, 'x', 'plan').ok, false, 'review não basta');
  assert.equal(artifactReady(root, 'x', 'tasks').ok, false, 'ausente');
  clean(root);
});

test('a cadeia usa donos que a topologia conhece (SPEC-019)', () => {
  const owners = new Set(chainFor('x').map((s) => s.owner));
  for (const o of owners) {
    assert.ok(['product', 'sdd-architect', 'worker', 'governance'].includes(o), `${o} é papel da topologia`);
  }
});
