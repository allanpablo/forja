#!/usr/bin/env node
/**
 * token-economy — mede, não argumenta (fecha a dívida do ADR-0027).
 *
 * O ADR-0027 afirmou que o padrão em camadas de `orders/` "economiza tokens" — e foi honesto ao
 * admitir que a medida crua não *prova* nada. Este script fecha a dívida: compara a MESMA feature
 * (place + ship, com a invariante "não envia sem pagamento") em dois estilos, por cenário, com
 * file-sets EXPLÍCITOS. O número pode confirmar ou matar a claim — é o ponto de ser falsificável.
 *
 * Token ≈ bytes/4 (o mesmo proxy do resto do framework). Não é preciso; é reproduzível e honesto.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), '..');

const CLEAN = 'boilerplates/06-clean-arch/backend/src/modules/orders';
const CLEAN_CTX = 'boilerplates/06-clean-arch/memory/30-domains/orders/context.md';
const SHARED = 'boilerplates/06-clean-arch/backend/src/shared/result.ts';
const FLAT = 'benchmarks/clean-vs-flat/orders-flat';

interface Scenario {
  name: string;
  question: string;
  clean: string[];
  flat: string[];
}

const SCENARIOS: Scenario[] = [
  {
    name: 'entender a feature inteira',
    question: 'ler todo o código da fatia para entender o que ela faz',
    clean: [
      `${CLEAN}/domain/order.entity.ts`,
      `${CLEAN}/domain/order-status.vo.ts`,
      `${CLEAN}/domain/money.vo.ts`,
      `${CLEAN}/domain/order.repository.ts`,
      `${CLEAN}/application/place-order.usecase.ts`,
      `${CLEAN}/application/ship-order.usecase.ts`,
      `${CLEAN}/infrastructure/order.orm-entity.ts`,
      `${CLEAN}/infrastructure/typeorm-order.repository.ts`,
      `${CLEAN}/presentation/orders.controller.ts`,
      `${CLEAN}/presentation/orders.http.dto.ts`,
      `${CLEAN}/orders.module.ts`,
      SHARED,
    ],
    flat: [
      `${FLAT}/order.entity.ts`,
      `${FLAT}/orders.service.ts`,
      `${FLAT}/orders.controller.ts`,
    ],
  },
  {
    name: 'mudar a regra de envio',
    question: 'alterar a invariante "não envia sem pagamento" — o contexto mínimo suficiente',
    // Clean: o mapa (context.md) diz que a regra vive no agregado + na máquina de estados. O agente
    // NÃO carrega application/infra/presentation — a regra está isolada.
    clean: [CLEAN_CTX, `${CLEAN}/domain/order.entity.ts`, `${CLEAN}/domain/order-status.vo.ts`],
    // Flat: a regra é um `if` no meio do service gordo, misturada com orquestração e persistência.
    // Não há mapa; lê-se o service inteiro para achar e mudar a regra.
    flat: [`${FLAT}/orders.service.ts`],
  },
];

function tokensOf(rel: string): number {
  try {
    return Math.round(fs.readFileSync(path.join(root, rel), 'utf8').length / 4);
  } catch {
    return 0;
  }
}

function sum(files: string[]): { tokens: number; count: number } {
  let tokens = 0;
  for (const f of files) tokens += tokensOf(f);
  return { tokens, count: files.length };
}

const pct = (clean: number, flat: number) =>
  flat === 0 ? '—' : `${clean <= flat ? '−' : '+'}${Math.abs(Math.round(((clean - flat) / flat) * 100))}%`;

console.log('\nToken economy — clean-arch vs flat, mesma feature (ADR-0027)\n');
console.log('Token ≈ bytes/4. Mede o custo do CONTEXTO por cenário, não o tamanho do repo.\n');

const rows: any[] = [];
for (const s of SCENARIOS) {
  const c = sum(s.clean);
  const f = sum(s.flat);
  rows.push({ cenário: s.name, clean_tok: c.tokens, clean_files: c.count, flat_tok: f.tokens, flat_files: f.count, clean_vs_flat: pct(c.tokens, f.tokens) });
  console.log(`■ ${s.name}`);
  console.log(`  ${s.question}`);
  console.log(`  clean:  ${String(c.tokens).padStart(5)} tokens  (${c.count} arquivos)`);
  console.log(`  flat:   ${String(f.tokens).padStart(5)} tokens  (${f.count} arquivo${f.count > 1 ? 's' : ''})`);
  console.log(`  clean vs flat: ${pct(c.tokens, f.tokens)}\n`);
}

// Veredito honesto, derivado dos números — não uma afirmação.
const full = rows[0];
const change = rows[1];
console.log('Veredito (derivado dos números acima):');
console.log(`  • Para ENTENDER a feature inteira, o clean custa ${full.clean_vs_flat} vs o flat —`);
console.log(`    mais arquivos, mais tokens. A camada cobra adiantado.`);
console.log(`  • Para MUDAR a regra isolada, o contexto mínimo do clean é ${change.clean_vs_flat} vs o flat.`);
console.log(`    ${change.clean_tok <= change.flat_tok
  ? 'Aqui a localização paga: o mapa + o agregado isolado batem o service gordo.'
  : 'Aqui o flat ainda ganha: a feature é pequena demais para a camada compensar.'}`);
console.log('\n  A economia do clean-arch é uma função do TAMANHO da feature e do nº de casos de uso,');
console.log('  não do total de arquivos. Numa feature pequena, o flat é mais barato — e tudo bem.');
console.log('  É exatamente o critério do WHEN-CLEAN-WHEN-LEAN, agora medido em vez de afirmado.\n');

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(rows, null, 2));
}
