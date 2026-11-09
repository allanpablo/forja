#!/usr/bin/env node
/**
 * tools-doctor — raio-x do núcleo (SPEC-009) e das ferramentas de processo (ADR-0018).
 *
 * Duas seções, dois contratos distintos:
 *
 *   Núcleo       O que impede o framework de trabalhar. Falha crítica → exit 1.
 *   Ferramentas  Binários opcionais que potencializam o harness. Ausência nunca trava.
 *
 * A separação é o ponto. Este comando auditava só as ferramentas — sobre as quais ele mesmo
 * dizia "o fluxo nunca trava por elas" — e era cego para tudo que trava. Quando o better-sqlite3
 * ficou com ABI de outra major do Node e a memória universal morreu inteira, o doctor reportou
 * "2/5 ferramentas disponíveis" e saiu com 0.
 *
 * Diagnostica e prescreve; não conserta. Rodar `npm rebuild` sem consentimento é a classe de
 * risco oposta à que este comando existe para fechar.
 *
 * Uso: forja tools:doctor
 */

import { spawnSync } from 'node:child_process';

import fs from 'node:fs';
import path from 'node:path';
import { runChecks, worstStatus, bucketFor, BUCKET_LABEL } from '../lib/core/health.ts';
import { emitError, emitOk } from '../lib/cli-output.ts';
import type { Result } from '../lib/core/checks.ts';
import { COMMANDS } from '../lib/core/registry.ts';
import { checkProjectWiring } from '../lib/project-wiring.ts';
import { isInsideFrameworkRepo } from '../lib/workspace.ts';

const TOOLS = [
  {
    name: 'codegraph',
    probe: ['codegraph', ['--version']],
    role: 'Code intelligence: chamadores, blast radius, mapa de impacto (ADR-0017).',
    install: 'npm i -g @codegraph/cli',
    gate: 'forja code:check / code:impact',
  },
  {
    name: 'gitleaks',
    probe: ['gitleaks', ['version']],
    role: 'Varredura de segredos antes de merge/release.',
    install: 'https://github.com/gitleaks/gitleaks (binario) ou: brew install gitleaks',
    gate: 'gitleaks detect --no-banner (gate de Governance)',
  },
  {
    name: 'ast-grep',
    probe: ['ast-grep', ['--version']],
    role: 'Busca e codemod estrutural por AST — refactor seguro do Worker.',
    install: 'npm i -g @ast-grep/cli  (binarios: ast-grep / sg)',
    gate: 'ast-grep run -p "<pattern>" -r "<rewrite>"',
  },
  {
    name: 'lefthook',
    probe: ['lefthook', ['version']],
    role: 'Pre-commit rodando project:check / spec:check automaticamente.',
    install: 'npm i -g lefthook  (depois: lefthook install)',
    gate: '.lefthook.yml (pre-commit)',
  },
  {
    name: 'markdownlint',
    probe: ['markdownlint-cli2', ['--version']],
    role: 'Lint da documentacao (docs e memory sao centrais aqui).',
    install: 'npm i -g markdownlint-cli2',
    gate: 'markdownlint-cli2 "docs/**/*.md"',
  },
];

function detect(cmd: any, args: any) {
  const res = spawnSync(cmd, args, { encoding: 'utf8' });
  if (res.error && (res.error as any).code === 'ENOENT') return { ok: false, version: null };
  const version = (res.stdout || res.stderr || '').trim().split('\n')[0] || 'instalado';
  return { ok: true, version };
}

export interface ToolState {
  readonly name: string;
  readonly role: string;
  readonly gate: string;
  readonly install: string;
  readonly ok: boolean;
  readonly version: string | null;
}

/** Sondar e imprimir eram uma coisa só; o ramo `--json` precisa do resultado sem o texto. */
function detectTools(): ToolState[] {
  return TOOLS.map((tool) => {
    const [cmd, args] = tool.probe;
    const { ok, version } = detect(cmd, args);
    return { name: tool.name, role: tool.role, gate: tool.gate, install: tool.install, ok, version };
  });
}

const TAG = {
  ok: 'OK   ',
  warn: 'AVISO',
  fail: 'FALHA',
  skipped: '—    ',
};

function printCore(results: any) {
  console.log('Núcleo — o que impede o framework de trabalhar (SPEC-009)\n');

  for (const bucket of ['blocking', 'first-run'] as const) {
    const group = results.filter((r: any) => bucketFor(r.id) === bucket);
    if (group.length === 0) continue;
    console.log(`— ${BUCKET_LABEL[bucket]} —`);
    for (const r of group) {
      console.log(`${(TAG as any)[r.status]} ${r.id.padEnd(13)} ${r.detail}`);
      if (r.fix) console.log(`      corrigir: ${r.fix}`);
    }
    if (bucket === 'first-run') console.log('      (ou rode tudo de uma vez: forja setup)');
    console.log('');
  }
}

function printTools(tools: readonly ToolState[]) {
  console.log(`— ${BUCKET_LABEL.optional} —  potencializam o harness, nunca travam (ADR-0018)\n`);

  let installed = 0;
  for (const tool of tools) {
    if (tool.ok) installed += 1;
    console.log(`${tool.ok ? TAG.ok : 'FALTA'} ${tool.name.padEnd(13)} ${tool.ok ? tool.version : '(ausente)'}`);
    console.log(`      papel: ${tool.role}`);
    console.log(`      gate:  ${tool.gate}`);
    if (!tool.ok) console.log(`      instalar: ${tool.install}`);
    console.log('');
  }

  console.log(`${installed}/${tools.length} ferramentas disponíveis.`);
  console.log('Ferramentas ausentes apenas desativam seus gates — o fluxo nunca trava por elas.\n');
}

export interface ProjectWiring {
  readonly status: 'ok' | 'warn' | 'fail';
  readonly checks: readonly { id: string; status: string; detail: string }[];
}

/** Num projeto (fora do repo do framework): a IA, os hooks e o MCP estão ligados a ele? */
function collectProject(): ProjectWiring | null {
  const cwd = process.cwd();
  if (isInsideFrameworkRepo(cwd) || !fs.existsSync(path.join(cwd, 'AGENTS.md'))) return null;
  const checks = checkProjectWiring(cwd, { commands: COMMANDS });
  return { status: checks.some((c) => c.status === 'fail') ? 'fail' : checks.some((c) => c.status === 'warn') ? 'warn' : 'ok', checks };
}

function printProject(project: ProjectWiring | null): 'ok' | 'warn' | 'fail' | null {
  if (project === null) return null;
  console.log('Projeto — a IA enxerga o Forja aqui? (forja project:wire --check)\n');
  for (const c of project.checks) console.log(`${(TAG as any)[c.status]} ${c.id.padEnd(13)} ${c.detail}`);
  console.log('');
  return project.status;
}

async function main() {
  const asJson = process.argv.includes('--json');
  const core = await runChecks();
  const tools = detectTools();
  const project = collectProject();

  if (asJson) emitJson(core, project, tools);

  console.log('\nForja doctor\n');

  printCore(core);
  const projectVerdict = printProject(project);
  printTools(tools);

  if (projectVerdict === 'fail') {
    console.log('Projeto desconectado da IA — corrija com: forja project:wire');
    process.exit(1);
  }

  // Só o núcleo decide o exit code. Ferramenta ausente nunca reprova — o contrato do ADR-0018
  // é preservado à risca.
  const verdict = worstStatus(core);

  if (verdict === 'fail') {
    const raiz = core.filter((r) => r.status === 'fail' && r.severity === 'critical');
    console.log(`Núcleo quebrado — ${raiz.length} ${raiz.length === 1 ? 'falha' : 'falhas'} crítica(s).`);
    for (const r of raiz) console.log(`  ${r.id}: ${r.fix || 'sem correção automática'}`);
    process.exit(1);
  }

  if (verdict === 'warn') {
    console.log('Núcleo operante, com ressalvas. Nada trava o fluxo.');
    return;
  }

  console.log('Núcleo saudável.');
}

/**
 * O registry anuncia `tools:doctor [--json]` e o script ignorava a flag: quem pedia JSON recebia o
 * texto humano de volta. Mesmo contrato do ADR-0082 (um objeto no stdout, diagnóstico no stderr) e
 * os mesmos exit codes do ramo de texto — 1 para núcleo quebrado ou projeto desconectado.
 */
function emitJson(core: readonly Result[], project: ProjectWiring | null, tools: readonly ToolState[]): never {
  if (project?.status === 'fail') return emitError('Projeto desconectado da IA — corrija com: forja project:wire', { code: 'PROJECT_UNWIRED' });
  const criticas = core.filter((r) => r.status === 'fail' && r.severity === 'critical');
  if (criticas.length > 0) {
    return emitError(`Núcleo quebrado — ${criticas.length} ${criticas.length === 1 ? 'falha' : 'falhas'} crítica(s)`, {
      code: 'CORE_UNHEALTHY',
      detail: criticas.map((r) => `${r.id}: ${r.fix || 'sem correção automática'}`).join('\n'),
    });
  }
  return emitOk({
    verdict: worstStatus(core),
    core: core.map((r) => ({ id: r.id, status: r.status, severity: r.severity ?? null, detail: r.detail ?? null, fix: r.fix ?? null })),
    ...(project === null ? {} : { project: { status: project.status, checks: project.checks } }),
    tools,
    toolsAvailable: tools.filter((tool) => tool.ok).length,
    toolsTotal: tools.length,
  });
}

main();
