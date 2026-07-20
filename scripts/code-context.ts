#!/usr/bin/env node
/**
 * code:context — entrega o pacote de contexto mínimo de um domínio (SPEC-016, ADR-0009).
 *
 *   forja code:context <domínio>            só o mapa (context.md) — o contexto barato
 *   forja code:context <domínio> --code     + o código da fatia (para editar)
 *   forja code:context <domínio> --project <path>   aponta para outro projeto
 *
 * O −61% do `token:economy` virado ferramenta: o mapa que substitui a exploração, pronto para colar.
 * Para o blast radius de um símbolo específico, componha com `forja code:impact <símbolo>`.
 */

import path from 'node:path';
import { buildContextPack, domainsOf } from '../lib/code-context.ts';

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

function main() {
  // Positionals = tudo que não é flag nem valor de flag. `--project` consome o próximo arg.
  const argv = process.argv.slice(2);
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--project') {
      i += 1; // pula o valor
      continue;
    }
    if (argv[i].startsWith('--')) continue;
    positional.push(argv[i]);
  }
  const domain = positional[0];
  const projectRoot = path.resolve(arg('--project') || process.cwd());
  const includeCode = process.argv.includes('--code');

  const available = domainsOf(projectRoot);

  if (!domain) {
    if (!available.length) {
      console.error(`Nenhum domínio em ${path.join(projectRoot, 'memory/30-domains')}.`);
      console.error('Rode dentro de um projeto gerado, ou aponte com --project <path>.');
      process.exit(1);
    }
    console.log('Uso: forja code:context <domínio> [--code] [--project <path>]\n');
    console.log(`Domínios disponíveis: ${available.join(', ')}`);
    return;
  }

  const pack = buildContextPack({ projectRoot, domain, includeCode });

  if (!pack.found) {
    console.error(`Domínio "${domain}" não tem context.md em ${projectRoot}.`);
    if (available.length) console.error(`Disponíveis: ${available.join(', ')}`);
    process.exit(1);
  }

  // O pacote em si — pronto para colar no contexto de um agente.
  console.log(`# Contexto do domínio: ${domain}\n`);
  console.log(`> Mapa: ${pack.mapPath} (${pack.mapTokens} tokens)\n`);
  console.log(pack.map);

  if (includeCode) {
    for (const c of pack.code) {
      console.log(`\n\n---\n\n## ${c.path} (${c.tokens} tokens)\n`);
      console.log('```ts');
      console.log(c.content);
      console.log('```');
    }
  }

  // Rodapé de economia — o custo à mostra (dogfood do token:economy).
  console.error(''); // separa do stdout colável
  if (includeCode) {
    console.error(`— pacote completo: ${pack.totalTokens} tokens (mapa ${pack.mapTokens} + código ${pack.codeTokens}, ${pack.code.length} arquivos).`);
  } else {
    console.error(`— só o mapa: ${pack.mapTokens} tokens. Para editar, adicione o código com --code, ou o blast radius com \`forja code:impact <símbolo>\`.`);
  }
}

main();
