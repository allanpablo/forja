/**
 * forja project:wire — conecta (ou verifica) o projeto do cwd à inteligência do Forja (ADR-0086).
 *
 *   forja project:wire                    escreve/atualiza instruções, hooks, sub-agents, MCP
 *   forja project:wire --ai claude,codex  escolhe as IAs (padrão: as já conectadas, ou todas)
 *   forja project:wire --check [--json]   só verifica; exit 1 se algo essencial está desligado
 */

import process from 'node:process';
import { COMMANDS } from '../lib/core/registry.ts';
import { wireProject, checkProjectWiring, detectWiredAi } from '../lib/project-wiring.ts';
import { isInsideFrameworkRepo } from '../lib/workspace.ts';

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

const argv = process.argv.slice(2);
const check = argv.includes('--check');
const json = argv.includes('--json');
const aiIdx = argv.indexOf('--ai');
const ai = aiIdx >= 0 ? (argv[aiIdx + 1] ?? fail('--ai exige uma lista: claude,codex,gemini,copilot')).split(',') : undefined;
const dir = process.cwd();

if (isInsideFrameworkRepo(dir)) {
  fail('project:wire opera um projeto, não o repositório do framework. Rode dentro do projeto (ou use forja project:new).');
}

if (!check) {
  let changes;
  try {
    changes = wireProject(dir, { ai: ai ?? (detectWiredAi(dir).length ? detectWiredAi(dir) : undefined) });
  } catch (e) {
    fail((e as Error).message);
  }
  if (json) {
    console.log(JSON.stringify({ changes }, null, 2));
  } else {
    for (const c of changes) if (c.action !== 'unchanged') console.log(`${c.action === 'created' ? '+' : '~'} ${c.file}`);
    const touched = changes.filter((c) => c.action !== 'unchanged').length;
    console.log(touched ? `✓ projeto conectado (${touched} arquivo(s))` : '✓ projeto já estava conectado');
  }
}

const checks = checkProjectWiring(dir, { commands: COMMANDS, ai });
const failed = checks.filter((c) => c.status === 'fail');
if (json && check) {
  console.log(JSON.stringify({ ok: failed.length === 0, checks }, null, 2));
} else if (check || failed.length) {
  for (const c of checks) console.log(`${c.status === 'ok' ? 'OK  ' : c.status === 'warn' ? 'WARN' : 'FAIL'}  ${c.id.padEnd(14)} ${c.detail}`);
  if (failed.length) console.log('\nCorrija com: forja project:wire');
}
process.exit(failed.length ? 1 : 0);
