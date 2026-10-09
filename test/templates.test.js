import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { listTemplates, resolveTemplate } from '../lib/templates.ts';
import { runProjectSmoke, worstStatus } from '../lib/core/project-smoke.ts';

// ADR-0088: "template": true é uma promessa (instala, compila, testa, lint). O CI cobra a promessa
// no job project-smoke-full; este teste garante que nenhum template fique fora da matriz.
test('todo template validado está na matriz project-smoke-full do CI', () => {
  const ci = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
  const block = ci.slice(ci.indexOf('project-smoke-full:'));
  for (const t of listTemplates().filter((x) => x.ready)) {
    assert.match(block, new RegExp(`- ${t.name.replace(/^\d+-/, '')}\\b`), `${t.name} sem smoke --full no CI`);
  }
});

test('resolveTemplate: aceita nome curto, recusa referência e desconhecido com a lista', () => {
  assert.equal(resolveTemplate('clean-arch').name, '06-clean-arch');
  assert.throws(() => resolveTemplate('saas-starter'), /arquitetura de referência.*Disponíveis: clean-arch/);
  assert.throws(() => resolveTemplate('nao-existe'), /template desconhecido/);
});

test('smoke (tier barato) aprova cada template validado', { timeout: 120_000 }, async () => {
  for (const t of listTemplates().filter((x) => x.ready)) {
    const results = await runProjectSmoke({ template: t.name });
    assert.notEqual(worstStatus(results), 'fail', `${t.name}: ${JSON.stringify(results.filter((r) => r.status === 'fail'))}`);
  }
});
