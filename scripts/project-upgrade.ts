#!/usr/bin/env node
/**
 * project:upgrade — traz peças novas de scaffold para um projeto já gerado (SPEC-018).
 *
 *   forja project:upgrade                    dry-run: lista o que falta (cwd)
 *   forja project:upgrade --apply            copia as peças novas
 *   forja project:upgrade --project <path>   aponta para outro projeto
 *
 * Aditivo, nunca sobrescreve: só traz arquivos que o projeto não tem. O código do usuário é intocável.
 * Desde a v5 também religa o projeto à inteligência do Forja (project:wire): instruções nativas,
 * hooks, sub-agents e MCP — a migração de projetos gerados antes da v5 (ADR-0086).
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planUpgrade, applyUpgrade } from '../lib/project-upgrade.ts';
import { COMMANDS } from '../lib/core/registry.ts';
import { wireProject, checkProjectWiring, detectWiredAi } from '../lib/project-wiring.ts';
import { script } from '../lib/paths.ts';

const __filename = fileURLToPath(import.meta.url);

function main() {
  const i = process.argv.indexOf('--project');
  const target = path.resolve(i >= 0 ? process.argv[i + 1] : process.cwd());
  const apply = process.argv.includes('--apply');

  if (!fs.existsSync(path.join(target, 'AGENTS.md'))) {
    console.error(`${target} não parece um projeto Forja (sem AGENTS.md).`);
    console.error('Rode dentro de um projeto gerado, ou aponte com --project <path>.');
    process.exit(1);
  }

  // Gera um scaffold fresco num tmp isolado, com o ambiente limpo (a lição do release:check).
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-upgrade-'));
  const fresh = path.join(tmp, 'fresh');
  try {
    const env = { ...process.env };
    delete env.NODE_PATH;
    for (const k of Object.keys(env)) if (k.startsWith('npm_')) delete env[k];
    // resolveScript acha .ts em dev e dist/bin/create-memory-nest-kit.js no publicado — cravar .ts
    // quebrava o comando instalado com module-not-found (o dist não tem .ts).
    const generator = script('bin/create-memory-nest-kit');
    try {
      execFileSync(process.execPath, [generator, fresh, '--force'], { cwd: tmp, env, stdio: 'pipe' });
    } catch (e: any) {
      const out = `${e.stdout ?? ''}${e.stderr ?? ''}`.trim().split('\n').slice(-15).join('\n');
      console.error(`O gerador de referência falhou — nada foi alterado no projeto.\n${out}`);
      process.exitCode = 1;
      return;
    }

    const plan = planUpgrade(fresh, target);
    const ai = detectWiredAi(target);
    const wiringGaps = checkProjectWiring(target, { commands: COMMANDS, ai: ai.length ? ai : undefined })
      .filter((c) => c.status === 'fail');

    if (!plan.newFiles.length && !wiringGaps.length) {
      console.log(`Projeto já em dia — ${plan.existing} arquivo(s) de scaffold presentes e conexão com a IA completa.`);
      return;
    }

    if (plan.newFiles.length) {
      console.log(`${plan.newFiles.length} peça(s) de scaffold nova(s) que este projeto ainda não tem:\n`);
      for (const rel of plan.newFiles) console.log(`  + ${rel}`);
    }
    if (wiringGaps.length) {
      console.log(`\nConexão com a IA a refazer (project:wire${ai.length ? `, IAs: ${ai.join(', ')}` : ''}):`);
      for (const c of wiringGaps) console.log(`  ~ ${c.id}: ${c.detail}`);
    }

    if (!apply) {
      console.log(`\nDry-run. Rode com --apply para aplicar. Arquivos do usuário não são sobrescritos; nos de instrução só o bloco forja:begin/end muda.`);
      return;
    }

    const applied = applyUpgrade(fresh, target, plan);
    const wired = wireProject(target, { ai: ai.length ? ai : undefined }).filter((c) => c.action !== 'unchanged');
    console.log(`\n✓ ${applied.length} arquivo(s) copiado(s), ${wired.length} de conexão escrito(s). Revise o diff antes de commitar.`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main();
