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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUDGET = path.join(ROOT, 'lib', 'core', 'quality-budget.json');
const asJson = process.argv.includes('--json');

/** `all files | line % | branch % | funcs %` — a régua é a de linhas. */
const TOTAL_RE = /all files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|/;

function floor(): number {
  let value: unknown;
  try {
    value = JSON.parse(fs.readFileSync(BUDGET, 'utf8')).coverageLineFloor;
  } catch (err) {
    throw new Error(`orçamento ilegível (lib/core/quality-budget.json): ${asErrno(err).message}`);
  }
  if (typeof value !== 'number') throw new Error('lib/core/quality-budget.json sem coverageLineFloor numérico');
  return value;
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

if (run.error) {
  if (asJson) emitError(`suíte não rodou: ${run.error.message}`, { code: 'ESPAWN' });
  process.exit(1);
}

const total = TOTAL_RE.exec(run.stdout ?? '');
if (total === null) {
  if (asJson) emitError('tabela de cobertura não encontrada na saída da suíte', { code: 'EPARSE' });
  console.error('não achei a linha "all files" da cobertura — o formato do Node mudou?');
  process.exit(1);
}

const [lines, branches, funcs] = [total[1], total[2], total[3]].map(Number);
const resumo = `cobertura de linhas ${lines.toFixed(2)}% (piso ${piso}%) · branches ${branches.toFixed(2)}% · funções ${funcs.toFixed(2)}%`;

if (run.status !== 0) {
  if (asJson) emitRejected({ suiteExitCode: run.status, lines, branches, funcs, floor: piso });
  console.error(`suíte falhou (exit ${run.status}) — ${resumo}`);
  process.exit(run.status ?? 1);
}

if (lines < piso) {
  if (asJson) emitRejected({ lines, branches, funcs, floor: piso, gap: Number((piso - lines).toFixed(2)) });
  console.error(`ABAIXO DO PISO: ${resumo}`);
  console.error('cubra o que o PR descobriu, ou desça o piso num commit próprio e justificado.');
  process.exit(2);
}

if (asJson) emitOk({ lines, branches, funcs, floor: piso });
console.log(`OK ${resumo}`);
