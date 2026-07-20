#!/usr/bin/env node
/**
 * project:upgrade — traz peças novas de scaffold para um projeto já gerado (SPEC-018).
 *
 *   forja project:upgrade                    dry-run: lista o que falta (cwd)
 *   forja project:upgrade --apply            copia as peças novas
 *   forja project:upgrade --project <path>   aponta para outro projeto
 *
 * Aditivo, nunca sobrescreve: só traz arquivos que o projeto não tem. O código do usuário é intocável.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planUpgrade, applyUpgrade } from '../lib/project-upgrade.ts';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');

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
    execFileSync(process.execPath, [path.join(repoRoot, 'bin', 'create-memory-nest-kit.ts'), fresh, '--force'], {
      cwd: tmp,
      env,
      stdio: 'pipe',
    });

    const plan = planUpgrade(fresh, target);

    if (!plan.newFiles.length) {
      console.log(`Projeto já em dia — ${plan.existing} arquivo(s) de scaffold presentes, nenhuma peça nova.`);
      return;
    }

    console.log(`${plan.newFiles.length} peça(s) de scaffold nova(s) que este projeto ainda não tem:\n`);
    for (const rel of plan.newFiles) console.log(`  + ${rel}`);

    if (!apply) {
      console.log(`\nDry-run. Rode com --apply para copiar. Aditivo: nada existente é sobrescrito.`);
      return;
    }

    const applied = applyUpgrade(fresh, target, plan);
    console.log(`\n✓ ${applied.length} arquivo(s) copiado(s). Revise o diff antes de commitar.`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main();
