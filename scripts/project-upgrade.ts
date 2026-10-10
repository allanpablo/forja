#!/usr/bin/env node
/**
 * project:upgrade — traz peças novas de scaffold para um projeto já gerado (SPEC-018).
 *
 *   forja project:upgrade                    dry-run: lista o que falta (cwd)
 *   forja project:upgrade --apply            copia as peças novas
 *   forja project:upgrade --project <path>   aponta para outro projeto
 *   forja project:upgrade --all [--apply]    todos os projetos do workspace, com relatório
 *
 * Aditivo, nunca sobrescreve: só traz arquivos que o projeto não tem. O código do usuário é intocável.
 * Desde a v5 também religa o projeto à inteligência do Forja (project:wire): instruções nativas,
 * hooks, sub-agents e MCP — a migração de projetos gerados antes da v5 (ADR-0086).
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { planUpgrade, applyUpgrade } from '../lib/project-upgrade.ts';
import { COMMANDS } from '../lib/core/registry.ts';
import { wireProject, checkProjectWiring, detectWiredAi } from '../lib/project-wiring.ts';
import { getProjectsDir, listProjects } from '../lib/workspace.ts';
import { script } from '../lib/paths.ts';

interface UpgradeReport {
  readonly target: string;
  readonly status: 'em-dia' | 'pendente' | 'aplicado' | 'nao-forja' | 'erro';
  readonly newFiles: string[];
  readonly wiringGaps: string[];
  readonly applied: number;
  readonly wired: number;
  readonly error?: string;
}

/**
 * Scaffold de referência num tmp isolado (ambiente limpo, a lição do release:check). Sempre sem
 * backend: o upgrade traz a camada do Forja (memória, agentes, prompts, skills, scripts) e nunca
 * toca `backend/`, que é código do usuário — e pode nem ser NestJS (um backend Python receberia um
 * app Nest inteiro com o critério antigo "tem pasta backend → traz o scaffold do backend").
 */
function freshScaffold(tmp: string): string {
  const fresh = path.join(tmp, 'fresh');
  const env = { ...process.env };
  delete env.NODE_PATH;
  for (const k of Object.keys(env)) if (k.startsWith('npm_')) delete env[k];
  const args = [script('bin/create-memory-nest-kit'), fresh, '--only-memory', '--force'];
  try {
    execFileSync(process.execPath, args, { cwd: tmp, env, stdio: 'pipe' });
  } catch (e: any) {
    const out = `${e.stdout ?? ''}${e.stderr ?? ''}`.trim().split('\n').slice(-15).join('\n');
    throw new Error(`o gerador de referência falhou — nada foi alterado.\n${out}`);
  }
  return fresh;
}

export function upgradeProject(target: string, apply: boolean): UpgradeReport {
  const base = { target, newFiles: [] as string[], wiringGaps: [] as string[], applied: 0, wired: 0 };
  if (!fs.existsSync(path.join(target, 'AGENTS.md'))) {
    return { ...base, status: 'nao-forja', error: 'ainda não usa o Forja (sem AGENTS.md) — entre nele e rode forja project:wire' };
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-upgrade-'));
  try {
    const fresh = freshScaffold(tmp);
    const plan = planUpgrade(fresh, target);
    const ai = detectWiredAi(target);
    const wiringGaps = checkProjectWiring(target, { commands: COMMANDS, ai: ai.length ? ai : undefined })
      .filter((c) => c.status === 'fail')
      .map((c) => `${c.id}: ${c.detail}`);
    if (!plan.newFiles.length && !wiringGaps.length) return { ...base, status: 'em-dia' };
    if (!apply) return { ...base, status: 'pendente', newFiles: plan.newFiles, wiringGaps };
    const applied = applyUpgrade(fresh, target, plan).length;
    const wired = wireProject(target, { ai: ai.length ? ai : undefined }).filter((c) => c.action !== 'unchanged').length;
    return { ...base, status: 'aplicado', newFiles: plan.newFiles, wiringGaps, applied, wired };
  } catch (e) {
    return { ...base, status: 'erro', error: (e as Error).message };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function printOne(r: UpgradeReport, apply: boolean) {
  if (r.status === 'erro' || r.status === 'nao-forja') { console.error(`${r.target}: ${r.error}`); return; }
  if (r.status === 'em-dia') { console.log('Projeto já em dia — scaffold completo e conexão com a IA em ordem.'); return; }
  if (r.newFiles.length) {
    console.log(`${r.newFiles.length} peça(s) de scaffold nova(s) que este projeto ainda não tem:\n`);
    for (const rel of r.newFiles) console.log(`  + ${rel}`);
  }
  if (r.wiringGaps.length) {
    console.log('\nConexão com a IA a refazer (project:wire):');
    for (const g of r.wiringGaps) console.log(`  ~ ${g}`);
  }
  if (!apply) console.log('\nDry-run. Rode com --apply para aplicar. Arquivos do usuário não são sobrescritos; nos de instrução só o bloco forja:begin/end muda.');
  else console.log(`\n✓ ${r.applied} arquivo(s) copiado(s), ${r.wired} de conexão escrito(s). Revise o diff antes de commitar.`);
}

function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const json = argv.includes('--json');

  if (argv.includes('--all')) {
    const names = listProjects();
    if (!names.length) { console.log(`Nenhum projeto em ${getProjectsDir()}.`); return; }
    const reports = names.map((n) => ({ name: n, ...upgradeProject(path.join(getProjectsDir(), n), apply) }));
    if (json) { console.log(JSON.stringify(reports, null, 2)); }
    else {
      console.log(`${apply ? 'Upgrade' : 'Dry-run'} de ${names.length} projeto(s) em ${getProjectsDir()}:\n`);
      for (const r of reports) {
        const what = r.status === 'erro' || r.status === 'nao-forja' ? r.error
          : r.status === 'em-dia' ? 'em dia'
          : r.status === 'pendente' ? `${r.newFiles.length} peça(s) nova(s), ${r.wiringGaps.length} lacuna(s) de conexão`
          : `${r.applied} copiada(s), ${r.wired} de conexão`;
        console.log(`  ${r.status.padEnd(9)} ${r.name.padEnd(32)} ${what}`);
      }
      if (!apply && reports.some((r) => r.status === 'pendente')) console.log('\nDry-run. Detalhe de um: cd <projeto> && forja project:upgrade · aplicar em todos: --all --apply');
    }
    process.exit(reports.some((r) => r.status === 'erro') ? 1 : 0);
  }

  const i = argv.indexOf('--project');
  const target = path.resolve(i >= 0 ? argv[i + 1] : process.cwd());
  const report = upgradeProject(target, apply);
  if (json) console.log(JSON.stringify(report, null, 2));
  else printOne(report, apply);
  process.exit(report.status === 'erro' || report.status === 'nao-forja' ? 1 : 0);
}

main();
