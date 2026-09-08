#!/usr/bin/env node
/**
 * forja status / forja next (SPEC-044 / forja-status-caminho-feliz).
 *
 * `status` — retrato único do estado (workspace, sprint, corrida, specs, runs, handoffs).
 * `next`   — a próxima ação recomendada, uma linha, com o comando exato.
 *
 * Somente leitura. Sai 0 sempre que o modelo montou (subsistema indisponível não é falha do
 * comando). O dispatch por `status`/`next` vem do `args` do registry.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectStatus, recommendNext, type StatusModel, type Sub } from '../lib/status-model.ts';
import { emitOk } from '../lib/cli-output.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function sub<T>(s: Sub<T>, render: (v: T) => string[]): string[] {
  return s.available ? render(s.value) : [`  indisponível: ${s.reason}`];
}

function renderStatus(m: StatusModel): string {
  const L: string[] = ['forja status', ''];

  L.push('Workspace:');
  L.push(`  ${m.workspace.root}  (origem: ${m.workspace.source})`);
  L.push(
    `  existe: ${m.workspace.exists ? 'sim' : 'não'}  ·  memória indexada: ${m.workspace.memoryIndexed ? 'sim' : 'não'}`,
  );

  L.push('', 'Sprint:');
  L.push(
    ...sub(m.sprint, (s) =>
      s ? [`  ${s.title ?? '(sem título)'} — ${s.done}/${s.items} itens`] : ['  sem sprint ativa'],
    ),
  );

  L.push('', 'Corrida (orchestrate):');
  L.push(
    ...sub(m.orchestrate, ({ runs }) =>
      runs.length === 0
        ? ['  nenhuma corrida aberta']
        : runs.map((r) =>
            r.concluded
              ? `  ${r.slug} — concluída`
              : `  ${r.slug} — etapa ${r.openStage}${r.openVerdict ? ` [${r.openVerdict}]` : ''}`,
          ),
    ),
  );

  L.push('', 'Specs:');
  L.push(
    ...sub(m.specs, (specs) => {
      if (specs.length === 0) return ['  nenhuma spec'];
      const byStatus = new Map<string, string[]>();
      for (const s of specs) {
        if (!byStatus.has(s.status)) byStatus.set(s.status, []);
        byStatus.get(s.status)!.push(s.slug);
      }
      return [...byStatus.entries()].map(([st, slugs]) => `  ${st}: ${slugs.join(', ')}`);
    }),
  );

  L.push('', 'Últimos runs:');
  L.push(
    ...sub(m.recentRuns, (runs) =>
      runs.length
        ? runs.map((r) => `  ${r.exitCode === 0 ? '✓' : '✗'} ${r.cmd}  ${r.ts}`)
        : ['  nenhum run registrado'],
    ),
  );

  L.push('', 'Handoffs em aberto:');
  L.push(
    ...sub(m.handoffs, (hs) =>
      hs.length
        ? hs.map((h) => `  #${h.id} ${h.from} → ${h.to} (${h.intent})${h.slug ? ` — ${h.slug}` : ''}`)
        : ['  nenhum'],
    ),
  );

  return L.join('\n');
}

const argv = process.argv.slice(2);
const cmd = argv[0] === 'next' ? 'next' : 'status';
const json = argv.includes('--json');

const model = await collectStatus(repoRoot);

if (cmd === 'next') {
  const next = recommendNext(model);
  if (json) emitOk({ ...next });
  console.log(`→ ${next.command}`);
  console.log(`  ${next.reason}`);
  process.exit(0);
}

if (json) emitOk({ ...model });
console.log(renderStatus(model));
process.exit(0);
