import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  coverageFloorFrom,
  coverageSummary,
  decideCoverage,
  parseCoverageTotal,
} from '../lib/core/coverage-gate.ts';

// ---------------------------------------------------------------------------
// SPEC-056 AC-3: `forja quality:coverage` roda a MESMA suíte com --experimental-test-coverage, lê a
// linha `all files` da tabela e cobra o `coverageLineFloor` versionado — exit 2 abaixo do piso, exit 1
// se a suíte falhar, `--json` no contrato do ADR-0082. O script não tem como ser testado de ponta a
// ponta (ele rodaria a suíte dentro da suíte), então a leitura da tabela e a tabela de decisão vivem
// em lib/core/coverage-gate.ts e a prova do critério é aqui.
// ---------------------------------------------------------------------------

const RAIZ = path.resolve(import.meta.dirname, '..');

/**
 * Saída real do Node 24. A ordem das colunas está no cabeçalho e os três valores são distintos de
 * propósito: se alguém trocar `lines` de lugar, o teste cai em vez de devolver o número do vizinho.
 */
function tabela({ lines, branches, funcs }) {
  const [l, b, f] = [lines, branches, funcs].map((n) => n.toFixed(2).padStart(7));
  return [
    'ℹ start of coverage report',
    'ℹ -----------------------------------------------------------------',
    'ℹ file             | line % | branch % | funcs % | uncovered lines',
    'ℹ -----------------------------------------------------------------',
    'ℹ lib              |        |          |         |',
    'ℹ  coverage-gate.ts|  100.00|    92.30 |  100.00 |',
    'ℹ -----------------------------------------------------------------',
    `ℹ all files        |${l} |${b} |${f} |`,
    'ℹ -----------------------------------------------------------------',
    'ℹ end of coverage report',
  ].join('\n');
}

const TOTAL = { lines: 91.8, branches: 79.85, funcs: 87.99 };

test('AC-3: lê a linha "all files" na ordem do cabeçalho do Node (line, branch, funcs)', () => {
  assert.deepEqual(parseCoverageTotal(tabela(TOTAL)), TOTAL);
});

test('AC-3: saída sem tabela devolve null, não zero — número inventado é pior que erro', () => {
  assert.equal(parseCoverageTotal('# Subtest: boom\nnot ok 1 - x\n'), null);
  assert.equal(parseCoverageTotal(''), null);
});

test('AC-3: o piso sai do orçamento versionado, e orçamento quebrado reprova com o caminho', () => {
  assert.equal(coverageFloorFrom('{"anyCeiling": 357, "coverageLineFloor": 90}', 'lib/core/quality-budget.json'), 90);

  assert.throws(
    () => coverageFloorFrom('{"anyCeiling": 357}', 'lib/core/quality-budget.json'),
    /lib\/core\/quality-budget\.json sem coverageLineFloor numérico/,
  );
  assert.throws(
    () => coverageFloorFrom('{ não é json', 'lib/core/quality-budget.json'),
    /orçamento ilegível \(lib\/core\/quality-budget\.json\)/,
  );
});

test('AC-3: o orçamento do repo continua legível pela régua (o gate roda contra ele mesmo)', () => {
  const texto = fs.readFileSync(path.join(RAIZ, 'lib/core/quality-budget.json'), 'utf8');
  const piso = coverageFloorFrom(texto, 'lib/core/quality-budget.json');
  assert.ok(piso > 0 && piso <= 100, `piso ${piso} fora do intervalo de percentual`);
});

test('AC-3: suíte verde sem tabela é falha operacional (exit 1), nunca OK', () => {
  // O formato do Node já mudou uma vez; se a linha some, o gate tem que dizer que não mediu.
  const r = decideCoverage({ spawnError: null, total: null, suiteStatus: 0, floor: 90 });
  assert.equal(r.kind, 'table-missing');
  assert.equal(r.exitCode, 1);
  assert.equal(r.code, 'EPARSE');
});

test('AC-3: não rodar a suíte vence qualquer outro veredito', () => {
  const r = decideCoverage({ spawnError: 'ENOENT', total: TOTAL, suiteStatus: 0, floor: 0 });
  assert.deepEqual(r, { kind: 'spawn-failed', exitCode: 1, code: 'ESPAWN' });
});

test('AC-3: suíte vermelha repassa o código dela, mesmo com cobertura acima do piso', () => {
  const r = decideCoverage({ spawnError: null, total: TOTAL, suiteStatus: 1, floor: 0 });
  assert.deepEqual(r, { kind: 'suite-failed', exitCode: 1, code: 'ESUITE' });

  // Morta por sinal não tem status: sair 0 aqui seria o gate aprovar um crash.
  const sinal = decideCoverage({ spawnError: null, total: TOTAL, suiteStatus: null, floor: 0 });
  assert.equal(sinal.kind, 'suite-failed');
  assert.equal(sinal.exitCode, 1);
});

test('AC-3: abaixo do piso é exit 2; no piso exato passa (ratchet, não folga)', () => {
  const abaixo = decideCoverage({ spawnError: null, total: { ...TOTAL, lines: 89.99 }, suiteStatus: 0, floor: 90 });
  assert.deepEqual(abaixo, { kind: 'below-floor', exitCode: 2, code: 'EFLOOR' });

  const noPiso = decideCoverage({ spawnError: null, total: { ...TOTAL, lines: 90 }, suiteStatus: 0, floor: 90 });
  assert.deepEqual(noPiso, { kind: 'ok', exitCode: 0, code: 'OK' });

  const acima = decideCoverage({ spawnError: null, total: TOTAL, suiteStatus: 0, floor: 90 });
  assert.deepEqual(acima, { kind: 'ok', exitCode: 0, code: 'OK' });
});

test('AC-3: o resumo humano tem a mesma forma nos três desfechos — o CI grepa um formato só', () => {
  assert.equal(
    coverageSummary(TOTAL, 90),
    'cobertura de linhas 91.80% (piso 90%) · branches 79.85% · funções 87.99%',
  );
});

test('AC-3: o script continua sendo a coleta + emissão, sem reinlinear a régua', () => {
  // Se alguém voltar a decidir código de saída à mão no script, a prova acima passa a valer para um
  // caminho que o CI não executa.
  const fonte = fs.readFileSync(path.join(RAIZ, 'scripts/coverage-gate.ts'), 'utf8');
  assert.match(fonte, /from '\.\.\/lib\/core\/coverage-gate\.ts'/);
  assert.match(fonte, /decideCoverage\(\{/);
  assert.match(fonte, /--experimental-test-coverage/, 'é a mesma suíte, só instrumentada');
  assert.ok(!fonte.includes('TOTAL_RE'), 'a régua não pode ter uma segunda casa');
});
