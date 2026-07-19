import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { collect, renderHtml } from '../lib/governance-report.mjs';

/** Repo de fixture: specs com status + ADRs. Sem tocar o repo real. */
function fixtureRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-gov-'));
  fs.mkdirSync(path.join(root, 'specs', 'feat-a'), { recursive: true });
  fs.writeFileSync(path.join(root, 'specs', 'feat-a', 'spec.md'), '# Spec\n- **Status**: done\n');
  fs.writeFileSync(path.join(root, 'specs', 'feat-a', 'plan.md'), '# Plan\n- **Status**: approved\n');
  fs.mkdirSync(path.join(root, 'specs', '_templates'), { recursive: true });
  fs.writeFileSync(path.join(root, 'specs', '_templates', 'spec.md'), '- **Status**: draft\n');
  fs.mkdirSync(path.join(root, 'memory', '90-decisions'), { recursive: true });
  fs.writeFileSync(path.join(root, 'memory', '90-decisions', '0001-x.md'), '# ADR');
  fs.writeFileSync(path.join(root, 'memory', '90-decisions', '_template.md'), '# tpl');
  return root;
}

test('collect lê specs reais e ignora _templates', async () => {
  const d = await collect({ root: fixtureRepo() });
  assert.equal(d.specs.length, 1);
  assert.equal(d.specs[0].slug, 'feat-a');
  assert.equal(d.specs[0].spec, 'done');
  assert.equal(d.specs[0].plan, 'approved');
  assert.equal(d.specs[0].tasks, null, 'sem tasks.md → null');
});

test('collect conta ADRs (só NNNN-*.md, sem _template)', async () => {
  const d = await collect({ root: fixtureRepo() });
  assert.equal(d.metrics.adrs, 1);
});

test('collect degrada sem specs/ADRs — repo vazio não quebra', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-gov-empty-'));
  const d = await collect({ root });
  assert.equal(d.specs.length, 0);
  assert.equal(d.metrics.adrs, 0);
  assert.ok(Array.isArray(d.gates), 'gates sempre presentes (dos catálogos)');
});

test('renderHtml é self-contained — zero asset externo (AC-4)', async () => {
  const html = renderHtml(await collect({ root: fixtureRepo() }));
  assert.doesNotMatch(html, /https?:\/\//, 'sem http(s) externo');
  assert.doesNotMatch(html, /<script/i, 'sem <script>');
  assert.doesNotMatch(html, /src\s*=/i, 'sem src= (imagem/asset)');
  assert.doesNotMatch(html, /@import/, 'sem @import de CSS');
  assert.match(html, /<!doctype html>/i);
});

test('renderHtml mostra "sem atividade" quando não há auditoria (AC-5)', async () => {
  const d = await collect({ root: fixtureRepo() });
  const html = renderHtml({ ...d, audit: null });
  assert.match(html, /Sem atividade registrada/);
});

test('renderHtml escapa conteúdo (sem injeção via slug)', async () => {
  const d = await collect({ root: fixtureRepo() });
  const html = renderHtml({ ...d, specs: [{ slug: '<img src=x>', spec: 'done', plan: null, tasks: null }] });
  assert.doesNotMatch(html, /<img src=x>/);
  assert.match(html, /&lt;img/);
});
