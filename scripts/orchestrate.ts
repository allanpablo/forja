#!/usr/bin/env node
/**
 * orchestrate — a cadeia SDD/GSD como máquina de estados guardada por gates (SPEC-021, ADR-0031).
 *
 *   forja orchestrate "<objetivo>" --slug <slug>   decompõe e abre a 1ª etapa (handoff ADR-0005)
 *   forja orchestrate:status <slug>                o estado da máquina
 *   forja orchestrate:advance <slug>               roda o gate da etapa; verde → próxima; vermelho → trava
 *
 * O motor orquestra e guarda; o agente (IA ou humano) que pega o handoff executa. Roda onde você
 * invocar: no framework (dogfood) ou num projeto gerado — o estado vive em `<cwd>/.context/`.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startRun, advance, loadState, chainFor, handoffFor } from '../lib/orchestrate.ts';
import { resolveScript } from '../lib/core/registry.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, '..');
const targetRoot = process.cwd();

function forjaBin(): string {
  return resolveScript(pkgRoot, 'bin/forja');
}

/** Registra o handoff da etapa via agent-router. Falha de workspace não derruba a corrida. */
function registerHandoff(slug: string, goal: string, stageIndex: number): void {
  const payload = handoffFor(slug, goal, stageIndex);
  const router = resolveScript(pkgRoot, 'scripts/agent-router');
  const res = spawnSync(process.execPath, [router, 'append', JSON.stringify(payload)], {
    cwd: targetRoot,
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    console.log(`  (handoff não registrado: ${String(res.stderr || '').trim().split('\n')[0] || 'workspace indisponível'} — a corrida segue)`);
  } else {
    console.log(`  handoff → ${payload.to} (${payload.intent}) registrado`);
  }
}

function printStatus(slug: string): void {
  const state = loadState(targetRoot, slug);
  if (!state) {
    console.error(`Nenhuma corrida para "${slug}". Comece com: forja orchestrate "<objetivo>" --slug ${slug}`);
    process.exit(1);
  }
  const ICON = { done: '✓', open: '▶', pending: '·' } as Record<string, string>;
  console.log(`\nCorrida: ${state.slug} — ${state.goal}\n`);
  for (const s of state.stages) {
    const marca = ICON[s.status] ?? '?';
    const veredito = s.verdict ? `  [${s.verdict}]` : '';
    console.log(`  ${marca} ${s.id.padEnd(10)} ${s.owner.padEnd(14)} gate: forja ${s.gate}${veredito}`);
  }
  if (state.current >= state.stages.length) {
    console.log('\nCorrida CONCLUÍDA — todas as transições passaram pelos gates.');
  } else {
    const aberta = state.stages[state.current];
    console.log(`\nEtapa aberta: ${aberta.id} (dono: ${aberta.owner}). Feito o trabalho: forja orchestrate:advance ${slug}`);
  }
}

function main(): void {
  const [mode, ...argv] = process.argv.slice(2);

  if (mode === 'status') {
    const slug = argv[0];
    if (!slug) { console.error('Uso: forja orchestrate:status <slug>'); process.exit(1); }
    printStatus(slug);
    return;
  }

  if (mode === 'advance') {
    const slug = argv[0];
    if (!slug) { console.error('Uso: forja orchestrate:advance <slug>'); process.exit(1); }
    const state = loadState(targetRoot, slug);
    if (!state) { console.error(`Nenhuma corrida para "${slug}".`); process.exit(1); }

    const result = advance({
      root: targetRoot,
      slug,
      runGate: (gateArgv) => {
        console.log(`Rodando o gate da etapa: forja ${gateArgv.join(' ')}\n`);
        const res = spawnSync(process.execPath, [forjaBin(), ...gateArgv], { cwd: targetRoot, encoding: 'utf8' });
        const output = `${res.stdout || ''}${res.stderr || ''}`;
        process.stdout.write(output);
        return { code: res.status ?? 1, output };
      },
    });

    if (!result.advanced && result.finished) {
      console.log('\nA corrida já estava concluída.');
      return;
    }
    if (!result.advanced) {
      console.log(`\nBLOQUEADO — a etapa "${result.stage.id}" não avança: ${result.stage.verdict}.`);
      console.log('A máquina não pula etapa. Corrija o que o gate apontou e rode advance de novo.');
      process.exit(1);
    }
    console.log(`\n✓ etapa "${result.stage.id}" fechada (gate verde).`);
    if (result.finished) {
      console.log('Corrida CONCLUÍDA — todas as transições passaram pelos gates.');
      return;
    }
    console.log(`▶ etapa aberta: "${result.next!.id}" (dono: ${result.next!.owner}).`);
    registerHandoff(slug, state.goal, chainFor(slug).findIndex((s) => s.id === result.next!.id));
    return;
  }

  // start: forja orchestrate "<objetivo>" --slug <slug>  (o dispatcher injeta o modo 'start').
  // Parse POSICIONAL: `--slug` consome o próximo token; o resto é o objetivo. Filtrar por valor
  // corromperia objetivos que contêm a palavra do slug (objetivo "pix" + --slug pix → vazio).
  const tokens = mode === 'start' ? argv : [mode, ...argv];
  let slug: string | null = null;
  const goalWords: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i] === '--slug') { slug = tokens[i + 1] ?? null; i += 1; continue; }
    goalWords.push(tokens[i]);
  }
  const goal = goalWords.join(' ').trim();
  if (!slug || !goal) {
    console.error('Uso: forja orchestrate "<objetivo>" --slug <slug>');
    process.exit(1);
  }

  const state = startRun({ root: targetRoot, slug, goal });
  console.log(`Corrida aberta: ${slug} — ${goal}`);
  console.log(`Cadeia: ${state.stages.map((s) => s.id).join(' → ')} (cada transição guardada por gate)\n`);
  console.log(`▶ etapa aberta: "${state.stages[0].id}" (dono: ${state.stages[0].owner}).`);
  registerHandoff(slug, goal, 0);
  console.log(`\nEstado: .context/orchestrate-${slug}.json · status: forja orchestrate:status ${slug}`);
}

main();
