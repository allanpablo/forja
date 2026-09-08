#!/usr/bin/env node
/**
 * forja setup — rotina de primeiro uso (SPEC-043 / cli-intuitiva-v1, T9).
 *
 * Roda, em ordem, uma allowlist FIXA de correções idempotentes e seguras. Não é configurável:
 * o valor do comando é ser previsível. Sem `--yes`, pede confirmação; sem TTY e sem `--yes`,
 * aborta sem executar nada — não há como confirmar com segurança num pipe.
 *
 * Cada passo é o próprio comando do core (`node bin/forja.ts <passo>`), então herda os gates e a
 * trilha de auditoria de cada um. Este script não escreve no workspace diretamente.
 *
 * Uso: forja setup [--yes]
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const forjaBin = path.resolve(__dirname, '..', 'bin', 'forja.ts');

// Allowlist fixa. Não ler de config, não aceitar via argv. Ordem importa: o índice precede a busca.
const STEPS: readonly string[] = ['workspace:init', 'sync:universal'];

function ask(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(/^s(im)?$/i.test(answer.trim()));
    });
  });
}

async function main(): Promise<number> {
  const yes = process.argv.slice(2).includes('--yes');

  console.log('forja setup — rotina de primeiro uso');
  console.log(`Passos (allowlist fixa): ${STEPS.join(', ')}\n`);

  if (!yes) {
    if (!process.stdin.isTTY) {
      console.error('Sem TTY para confirmar. Rode `forja setup --yes` para execução não-interativa.');
      return 1;
    }
    const ok = await ask('Executar estes passos agora? [s/N] ');
    if (!ok) {
      console.log('Cancelado. Nada foi executado.');
      return 1;
    }
  }

  for (const step of STEPS) {
    console.log(`\n→ ${step}`);
    const result = spawnSync('node', [forjaBin, step], { cwd: process.cwd(), stdio: 'inherit' });
    const code = result.status ?? 1;
    if (code !== 0) {
      console.error(`\nPasso "${step}" falhou (exit ${code}). Interrompendo — nada além deste ponto foi executado.`);
      return code;
    }
  }

  console.log('\nSetup concluído. Próximo: `forja project:new <nome>` ou `forja spec:new <slug>`.');
  return 0;
}

process.exit(await main());
