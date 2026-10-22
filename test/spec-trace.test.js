import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isTestFile, parseCriteria, traceSpecs, strictFailures } from '../lib/spec-trace.ts';

// SPEC-053 (criterios-ligados-a-testes): estes testes citam os próprios critérios — `forja spec:trace
// criterios-ligados-a-testes` no repo deve mostrar todos cobertos.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const forja = path.join(root, 'bin/forja.ts');

// spec-trace:off — as specs e testes abaixo são de exemplo (SPEC-001…003 do fixture, não do Forja)
function spec(dir, slug, id, status, acs) {
  fs.mkdirSync(path.join(dir, 'specs', slug), { recursive: true });
  fs.writeFileSync(path.join(dir, 'specs', slug, 'spec.md'), [
    `# Spec: ${slug}`, '', `- **ID**: ${id}`, `- **Status**: ${status}`, '', '## 4. Critérios de aceite',
    ...acs.map((a, i) => `- [ ] AC-${i + 1}: ${a}`), '',
  ].join('\n'));
}

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-trace-'));
  spec(dir, 'pagamentos', 'SPEC-001', 'approved', ['cobra no cartão', 'estorna', 'emite recibo']);
  spec(dir, 'cadastro', 'SPEC-002', 'done', ['cria conta', 'valida e-mail']);
  spec(dir, 'rascunho', 'SPEC-003', 'draft', ['algo']);
  const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
  w('test/pagamentos.test.js', "test('SPEC-001 AC-1/AC-2: cobra e estorna', () => {});\ntest('SPEC-001 AC-9: critério que sumiu', () => {});\n");
  w('src/cadastro/cadastro.spec.ts', "// specs/cadastro/\nit('AC-1: cria conta', () => {});\nit('AC-7 solto que não existe', () => {});\n");
  w('tests/test_recibo.py', 'def test_recibo():  # pagamentos AC-3\n    pass\n');
  w('test/misto.test.js', "// SPEC-001 e SPEC-002\ntest('AC-2 sem dono', () => {});\n");
  w('node_modules/lib/x.test.js', "test('SPEC-002 AC-2', () => {});\n");
  w('test/fixtures/dados.test.js', "test('SPEC-002 AC-2', () => {});\n");
  return dir;
}
// spec-trace:on

const bySlug = (r, slug) => r.specs.find((s) => s.slug === slug);

test('SPEC-053 AC-1: cada critério lista os testes que o citam (arquivo:linha)', () => {
  const r = traceSpecs(fixture());
  const pag = bySlug(r, 'pagamentos');
  assert.deepEqual(pag.criteria.map((c) => [c.id, c.tests.map((t) => `${t.file}:${t.line}`)]), [
    ['AC-1', ['test/pagamentos.test.js:1']],
    ['AC-2', ['test/pagamentos.test.js:1']],
    ['AC-3', ['tests/test_recibo.py:1']],
  ]);
  assert.deepEqual(pag.uncovered, []);
});

test('SPEC-053 AC-2: lista, slug, AC solto com uma spec no arquivo; solto ambíguo não conta', () => {
  const r = traceSpecs(fixture());
  const cad = bySlug(r, 'cadastro');
  assert.deepEqual(cad.criteria.find((c) => c.id === 'AC-1').tests.map((t) => t.file), ['src/cadastro/cadastro.spec.ts']);
  assert.deepEqual(cad.uncovered, ['AC-2'], 'AC-2 do misto.test.js cita duas specs: não pode contar');
  const reasons = r.ambiguous.map((a) => `${a.ref.file} ${a.ac}: ${a.reason}`);
  assert.ok(reasons.includes('test/misto.test.js AC-2: arquivo cita 2 specs'), reasons.join('\n'));
  assert.ok(reasons.some((x) => x.startsWith('src/cadastro/cadastro.spec.ts AC-7: AC-7 não existe em cadastro')), 'solto inexistente é ambíguo, não órfão');
});

test('SPEC-053 AC-2: o nome do arquivo associa o teste à spec', () => {
  const dir = fixture();
  fs.writeFileSync(path.join(dir, 'test', 'cadastro.test.js'), "test('AC-2: valida e-mail', () => {});\n");
  assert.deepEqual(bySlug(traceSpecs(dir), 'cadastro').uncovered, []);
});

test('SPEC-053 AC-3: citação qualificada de critério inexistente é órfã', () => {
  const pag = bySlug(traceSpecs(fixture()), 'pagamentos');
  assert.deepEqual(pag.orphans.map((o) => `${o.ac} ${o.ref.file}:${o.ref.line}`), ['AC-9 test/pagamentos.test.js:2']);
  assert.equal(bySlug(traceSpecs(fixture()), 'cadastro').orphans.length, 0);
});

test('SPEC-053 AC-4: acha testes de qualquer stack e ignora node_modules, dist, fixtures', () => {
  for (const f of ['test/a.test.js', 'src/a.spec.ts', 'x/test_a.py', 'pkg/a_test.go', 'tests/helpers.py', 'src/__tests__/a.tsx', 'spec/a_spec.rb', 'src/FooTest.java'])
    assert.equal(isTestFile(f), true, f);
  for (const f of ['src/a.ts', 'node_modules/x/a.test.js', 'dist/a.spec.js', 'test/fixtures/a.test.js', 'coverage/a.test.js', 'test/README.md'])
    assert.equal(isTestFile(f), false, f);
  const r = traceSpecs(fixture());
  assert.equal(r.testFiles, 4);
});

// spec-trace:off
test('parseCriteria: aceita [ ], [x], negrito, travessão e (RF-NN); ignora AC citado no meio do texto', () => {
  const acs = parseCriteria('- [x] AC-1: feito\n- [ ] **AC-2** — negrito\n* AC-3: estrela\n- [ ] AC-4 (RF-01): ligado ao requisito\ntexto citando AC-9 no meio\n- [ ] AC-1: duplicado\n');
  assert.deepEqual(acs.map((a) => a.id), ['AC-1', 'AC-2', 'AC-3', 'AC-4']);
  assert.equal(acs[3].text, 'ligado ao requisito');
});
// spec-trace:on

function cli(dir, args) {
  return spawnSync(process.execPath, [forja, 'spec:trace', ...args], { cwd: dir, encoding: 'utf8' });
}

test('SPEC-053 AC-5: só informa sem --strict; --strict rejeita spec prometida com lacuna', () => {
  const dir = fixture();
  let r = cli(dir, []);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /SPEC-001 pagamentos \[approved\] — 3\/3 critérios com teste/);
  assert.match(r.stdout, /⚠ AC-9 não existe na spec/);

  r = cli(dir, ['--strict']);
  assert.equal(r.status, 2);
  assert.match(r.stdout, /--strict: 2 spec\(s\).*pagamentos.*cadastro|--strict: 2 spec\(s\).*cadastro.*pagamentos/);

  // rascunho (draft) sem teste não reprova: "pronto" ainda não foi prometido
  assert.deepEqual(strictFailures(traceSpecs(dir).specs).map((s) => s.slug).sort(), ['cadastro', 'pagamentos']);
});

test('SPEC-053 AC-5: --json segue o contrato (ok / rejected com exit 2)', () => {
  const dir = fixture();
  let r = cli(dir, ['--json']);
  assert.equal(r.status, 0);
  let d = JSON.parse(r.stdout);
  assert.equal(d.status, 'ok');
  assert.deepEqual(d.totals, { specs: 3, criteria: 6, covered: 4, testFiles: 4 });

  r = cli(dir, ['--strict', '--json']);
  assert.equal(r.status, 2);
  d = JSON.parse(r.stdout);
  assert.equal(d.status, 'rejected');
  assert.deepEqual(d.failing.sort(), ['cadastro', 'pagamentos']);

  r = cli(dir, ['nao-existe', '--json']);
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stdout).error.code, 'NOT_FOUND');
});

test('SPEC-053 AC-6: AGENTS.md do projeto e skill testing ensinam a convenção', () => {
  const agents = fs.readFileSync(path.join(root, 'templates/project/AGENTS.md'), 'utf8');
  assert.match(agents, /SPEC-NNN AC-N/);
  assert.match(agents, /forja spec:trace/);
  const skill = fs.readFileSync(path.join(root, 'templates/project/skills/testing/SKILL.md'), 'utf8');
  assert.match(skill, /SPEC-NNN AC-N/);
});

test('SPEC-053 NFR: o repo do Forja é rastreado em menos de 2 s', () => {
  const t0 = performance.now();
  const r = traceSpecs(root);
  assert.ok(performance.now() - t0 < 2000);
  assert.ok(r.testFiles > 50);
});

// Marcador montado por concatenação: escrito literal, desligaria a leitura deste próprio arquivo.
const OFF = 'spec-trace:' + 'off';
const ON = 'spec-trace:' + 'on';

test('SPEC-053 AC-2: lista separada só por espaço (AC-5 AC-6) e trechos entre marcadores ignorados', () => {
  const dir = fixture();
  fs.writeFileSync(path.join(dir, 'test', 'extra.test.js'), [
    "test('SPEC-002 AC-1 AC-2: cria e valida', () => {});",
    `// ${OFF}`,
    "const exemplo = 'SPEC-001 AC-9: citação de fixture';",
    `// ${ON}`,
  ].join('\n'));
  const r = traceSpecs(dir);
  assert.deepEqual(bySlug(r, 'cadastro').uncovered, [], 'AC-2 separado por espaço não contou');
  assert.ok(!bySlug(r, 'pagamentos').orphans.some((o) => o.ref.file === 'test/extra.test.js'), 'citação dentro do trecho desligado contou');
});
