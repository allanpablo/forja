#!/usr/bin/env node
/**
 * eval:agents — avaliações com agentes reais em projeto descartável (SPEC-054, ADR-0093).
 *
 *   forja eval:agents --agent claude|codex [--case a,b] [--model m] [--budget-usd n]
 *                     [--timeout s] [--keep] [--list] [--json]
 *
 * Custa: cada caso é uma sessão real do agente. Exit 0 = todos passaram, 2 = algum falhou,
 * 1 = agente ausente, caso inexistente ou argumento inválido.
 */

import fs from 'node:fs';
import path from 'node:path';
import { emitError, emitOk, emitRejected } from '../lib/cli-output.ts';
import { ADAPTERS, appendHistory, compareRuns, loadCases, previousRun, runSuite, type CaseResult } from '../lib/agent-evals.ts';
import { asset, pkgRoot, script } from '../lib/paths.ts';
import { getWorkspaceContextDir, getWorkspaceInfo } from '../lib/workspace.ts';

const argv = process.argv.slice(2);
const json = argv.includes('--json');
const flag = (name: string) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const die = (msg: string, code = 'INVALID_ARGS'): never => {
  if (json) emitError(msg, { code });
  console.error(msg);
  process.exit(1);
};

const all = loadCases(asset('templates', 'evals', 'agents'));
if (argv.includes('--list')) {
  if (json) emitOk({ cases: all.map((c) => ({ id: c.id, title: c.title, checks: c.checks.length })) });
  for (const c of all) console.log(`${c.id.padEnd(20)} ${c.title} (${c.checks.length} checks)`);
  process.exit(0);
}

// Sem padrão de propósito: rodar custa dinheiro, então o agente é sempre uma escolha explícita.
const agentName: string = flag('--agent') ?? die(`escolha o agente: --agent ${Object.keys(ADAPTERS).join('|')} (cada caso é uma sessão real e paga)`, 'MISSING_ARG');
const make = ADAPTERS[agentName];
if (!make) die(`agente desconhecido: ${agentName} (suportados: ${Object.keys(ADAPTERS).join(', ')})`);
const adapter = make();
if (!adapter.version()) die(`${agentName} não está instalado ou não responde a --version`, 'AGENT_MISSING');

const wanted = flag('--case')?.split(',').map((s) => s.trim()).filter(Boolean);
const unknown = (wanted ?? []).filter((id) => !all.some((c) => c.id === id));
if (unknown.length) die(`caso desconhecido: ${unknown.join(', ')} (veja forja eval:agents --list)`, 'NOT_FOUND');
const cases = wanted ? all.filter((c) => wanted.includes(c.id)) : all;

const budgetUsd = Number(flag('--budget-usd') ?? 1);
const timeoutS = Number(flag('--timeout') ?? 300);
if (!(budgetUsd > 0) || !(timeoutS > 0)) die('--budget-usd e --timeout precisam ser positivos');
const model = flag('--model');
const version = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf8')).version;

if (!json) {
  console.log(`Avaliando ${agentName}${model ? ` (${model})` : ''} em ${cases.length} caso(s) — cada caso é uma sessão real do agente.`);
  if (agentName === 'claude') console.log(`Teto por caso: US$ ${budgetUsd.toFixed(2)} · timeout ${timeoutS} s\n`);
  else console.log(`Timeout por caso: ${timeoutS} s (o Codex não tem teto de custo por flag)\n`);
}

const line = (r: CaseResult) => {
  const cost = r.costUsd != null ? ` · US$ ${r.costUsd.toFixed(3)}` : '';
  console.log(`${r.pass ? '✓' : '✗'} ${r.id.padEnd(20)} ${(r.durationMs / 1000).toFixed(0)} s · ${r.commands} comando(s)${cost}`);
  for (const k of r.checks) if (!k.ok || !r.pass) console.log(`    ${k.ok ? '✓' : '✗'} ${k.desc} — ${k.detail}`);
  if (r.error) console.log(`    ✗ agente: ${r.error}`);
  if (!r.pass && r.answer) console.log(`    resposta: ${r.answer.replace(/\s+/g, ' ').slice(0, 200)}`);
};

const result = runSuite(cases, adapter, version, {
  forjaBin: script('bin/forja'), model, budgetUsd, timeoutMs: timeoutS * 1000, keep: argv.includes('--keep'),
  onCase: json ? undefined : (_c, r) => line(r),
});

const ws = getWorkspaceInfo();
const historyFile = ws.exists ? path.join(getWorkspaceContextDir(), 'agent-evals.jsonl') : null;
const prev = historyFile ? previousRun(historyFile, result.agent, result.model) : null;
const diff = compareRuns(prev, result);
if (historyFile) appendHistory(historyFile, result);

if (json) {
  const payload = { ...result, regressed: diff.regressed, fixed: diff.fixed, history: historyFile };
  if (result.passed < result.cases.length) emitRejected(payload);
  emitOk(payload);
}

console.log(`\n${result.passed}/${result.cases.length} caso(s) passaram${result.costUsd != null ? ` · custo total US$ ${result.costUsd.toFixed(3)}` : ''}`);
if (prev) {
  console.log(`Comparado com ${prev.ts.slice(0, 16).replace('T', ' ')} (Forja ${prev.forjaVersion}): ${prev.passed}/${prev.cases.length}`);
  if (diff.regressed.length) console.log(`  ✗ passaram a falhar: ${diff.regressed.join(', ')}`);
  if (diff.fixed.length) console.log(`  ✓ passaram a passar: ${diff.fixed.join(', ')}`);
}
console.log(historyFile ? `Histórico: ${historyFile}` : 'Sem workspace: o resultado não foi guardado (forja workspace:init).');
process.exit(result.passed === result.cases.length ? 0 : 2);
