/**
 * forja context:smart — pack de contexto mínimo-suficiente nos 3 modos da ADR-0003.
 *
 *   forja context:smart                         global (missão, padrões, ADRs)
 *   forja context:smart --mode domain           + visão/design/regras do projeto
 *   forja context:smart --mode task --task pix  + nós do projeto que casam com a tarefa (FTS5)
 *   forja context:smart <projeto> [keyword]     forma posicional antiga (studio) — ainda aceita
 *
 * O projeto é inferido de onde o comando roda: no modo embedded é o próprio projeto; no studio,
 * o projeto do workspace em que o cwd está. A lógica de montagem vive em lib/context-builder.ts —
 * este script só resolve argumentos, projeto e destino. Antes da v5 o comando apontava para um
 * script que ignorava `--mode` e exigia `<projeto>`, embora o help prometesse os três modos.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ContextBuilder } from '../lib/context-builder.ts';
import { getDbPath, ensureSchema } from './memory-schema.ts';
import { getForjaMode, getProjectsDir, getWorkspaceContextDir, getWorkspaceRoot, initWorkspace, resolveProject } from '../lib/workspace.ts';

const MODES = ['global', 'domain', 'task'] as const;
type Mode = typeof MODES[number];

function fail(msg: string): never {
  console.error(msg);
  console.error('Uso: forja context:smart [--mode global|domain|task] [--task <termo>] [--project <nome>]');
  process.exit(1);
}

export function parseArgs(argv: readonly string[]) {
  const opts: { mode?: string; task?: string; project?: string; positional: string[] } = { positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { const v = argv[++i]; if (v === undefined || v.startsWith('--')) fail(`${a} exige um valor`); return v; };
    if (a === '--mode') opts.mode = val();
    else if (a === '--task' || a === '--domain' || a === '--keyword') opts.task = val();
    else if (a === '--project') opts.project = val();
    else if (a.startsWith('--')) fail(`Opção desconhecida: ${a}`);
    else opts.positional.push(a);
  }
  return opts;
}

/** Projeto do workspace que contém `cwd` (studio), ou null. */
function projectFromCwd(cwd: string): string | null {
  const rel = path.relative(getProjectsDir(), cwd);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return rel.split(path.sep)[0] || null;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const embedded = getForjaMode() === 'embedded';
  const [posProject, posKeyword] = opts.positional;

  const project = opts.project
    ?? (embedded ? path.basename(getWorkspaceRoot()) : posProject ?? projectFromCwd(process.cwd()))
    ?? null;
  const keyword = opts.task ?? (embedded ? posProject : posKeyword) ?? '';
  const mode = (opts.mode ?? (keyword ? 'task' : project ? 'domain' : 'global')) as Mode;
  if (!MODES.includes(mode)) fail(`Modo inválido: ${mode} (use ${MODES.join(' | ')})`);
  if (mode === 'task' && !keyword) fail('Modo task exige --task <termo>.');
  if (mode !== 'global' && !project) fail('Modos domain/task exigem um projeto: rode dentro dele ou passe --project <nome>.');

  initWorkspace();
  ensureSchema({ silent: true });
  const builder = new ContextBuilder(process.cwd(), getDbPath());
  try {
    const content = builder.build(mode, project ?? 'global', keyword);
    const outDir = embedded
      ? path.join(getWorkspaceRoot(), '.context')
      : project ? path.join(resolveProject(project), '.context') : getWorkspaceContextDir();
    if (!embedded && project && !fs.existsSync(resolveProject(project))) fail(`Projeto não encontrado no workspace: ${project}`);
    const outFile = path.join(outDir, 'smart-context.md');
    builder.save(content, outFile);
    const files = (content.match(/^\*\*Path\*\*:/gm) || []).length;
    console.log(`✓ contexto ${mode}${keyword ? ` ("${keyword}")` : ''}${project ? ` de ${project}` : ''}: ${outFile}`);
    console.log(`  ${files} arquivo(s) · ~${Math.round(content.length / 4)} tokens`);
    if (files === 0) console.log('  nada indexado ainda — rode: forja sync:universal');
  } catch (e) {
    fail(`Erro ao gerar contexto: ${(e as Error).message}`);
  } finally {
    builder.close();
  }
}

main();
