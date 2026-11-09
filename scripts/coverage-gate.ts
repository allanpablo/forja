#!/usr/bin/env node
/**
 * quality:coverage — roda a suíte com a cobertura nativa do Node e cobra o piso versionado (SPEC-056).
 *
 * Sem c8/istanbul de propósito: `node --test --experimental-test-coverage` já produz a tabela, e o
 * trabalho aqui é ler a linha "all files" e comparar com `coverageLineFloor` de
 * `lib/core/quality-budget.json`. É o ratchet gêmeo do check `type-debt`: o piso só desce em commit
 * explícito, e a suíte continua sendo a mesma — não há segunda máquina de teste.
 *
 * A saída do filho é capturada e reimpressa inteira: o CI precisa ver cada teste, e o parsing precisa
 * da tabela. Piso abaixo do combinado → exit 2 (`emitRejected`): gate negativo, não falha operacional.
 *
 * Ler a tabela, ler o piso e decidir o código de saída vive em `lib/core/coverage-gate.ts` — aqui só
 * a coleta e a emissão, porque um teste deste script rodaria a suíte dentro da suíte (AC-3).
 *
 * A régua só vale se se repetir: `test/isolate-workspace.mjs` retira `NODE_V8_COVERAGE` do ambiente para
 * que os CLIs filhos não despejem blocos parciais na agregação do Node — antes disso o `all files`
 * variava 1,6pp entre execuções idênticas e o piso era sorteio (ver Evidências da SPEC-056).
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { emitError, emitOk, emitRejected } from '../lib/cli-output.ts';
import { asErrno } from '../lib/core/checks.ts';
import { coverageFloorFrom, coverageSummary, decideCoverage, parseCoverageTotal } from '../lib/core/coverage-gate.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUDGET_LABEL = 'lib/core/quality-budget.json';
const BUDGET = path.join(ROOT, 'lib', 'core', 'quality-budget.json');
const asJson = process.argv.includes('--json');

function floor(): number {
  let text: string;
  try {
    text = fs.readFileSync(BUDGET, 'utf8');
  } catch (err) {
    throw new Error(`orçamento ilegível (${BUDGET_LABEL}): ${asErrno(err).message}`);
  }
  return coverageFloorFrom(text, BUDGET_LABEL);
}

function testFiles(): string[] {
  const dir = path.join(ROOT, 'test');
  return fs.readdirSync(dir).filter((f) => f.endsWith('.test.js')).sort().map((f) => path.join('test', f));
}

let piso: number;
try {
  piso = floor();
} catch (err) {
  const mensagem = asErrno(err).message;
  if (asJson) emitError(mensagem, { code: 'EBUDGET' });
  console.error(mensagem);
  process.exit(1);
}

const files = testFiles();
if (files.length === 0) {
  if (asJson) emitError('nenhum test/*.test.js encontrado', { code: 'ENOTEST' });
  console.error('nenhum test/*.test.js encontrado');
  process.exit(1);
}

const run = spawnSync(
  process.execPath,
  ['--test', '--experimental-test-coverage', '--import', './test/isolate-workspace.mjs', ...files],
  { cwd: ROOT, encoding: 'utf8' },
);
process.stdout.write(run.stdout ?? '');
process.stderr.write(run.stderr ?? '');

const total = parseCoverageTotal(run.stdout ?? '');
const outcome = decideCoverage({
  spawnError: run.error !== undefined ? run.error.message : null,
  total,
  suiteStatus: run.status,
  floor: piso,
});

if (run.error !== undefined) {
  if (asJson) emitError(`suíte não rodou: ${run.error.message}`, { code: outcome.code });
  process.exit(outcome.exitCode);
}

if (total === null) {
  if (asJson) emitError('tabela de cobertura não encontrada na saída da suíte', { code: outcome.code });
  console.error('não achei a linha "all files" da cobertura — o formato do Node mudou?');
  process.exit(outcome.exitCode);
}

const payload = { lines: total.lines, branches: total.branches, funcs: total.funcs, floor: piso };
const resumo = coverageSummary(total, piso);

if (outcome.kind === 'suite-failed') {
  if (asJson) emitRejected({ ...payload, suiteExitCode: run.status ?? 'sinal' });
  console.error(`suíte falhou (exit ${run.status ?? 'sinal'}) — ${resumo}`);
  process.exit(outcome.exitCode);
}

if (outcome.kind === 'below-floor') {
  if (asJson) emitRejected({ ...payload, gap: Number((piso - total.lines).toFixed(2)) });
  console.error(`ABAIXO DO PISO: ${resumo}`);
  console.error('cubra o que o PR descobriu, ou desça o piso num commit próprio e justificado.');
  process.exit(outcome.exitCode);
}

if (asJson) emitOk(payload);
console.log(`OK ${resumo}`);
