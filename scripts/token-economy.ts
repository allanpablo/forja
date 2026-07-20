#!/usr/bin/env node
/**
 * token-economy — mede, não argumenta (fecha a dívida do ADR-0027; ADR-0009 e ADR-0003).
 *
 * Dois eixos, porque a economia de token do Forja tem dois eixos e eles são diferentes:
 *
 *   1. ARQUITETURA (clean vs flat) — camadas custam tokens. Numa feature pequena, o flat é mais
 *      barato. É honesto, e desmente a versão ingênua de "Clean Architecture economiza tokens".
 *
 *   2. MEMÓRIA (frio vs quente) — o `context.md` é o mapa. Sem ele, um agente varre o código da
 *      fatia para localizar a regra; com ele, vai direto ao agregado. AQUI está a economia real do
 *      framework (ADR-0009), e ela COMPÕE: paga-se o scaffold uma vez, e o mapa economiza a cada
 *      tarefa futura pela vida do projeto.
 *
 * O `token:economy` sozinho não captura o custo de gerar do zero (isso é custo líquido, único). Ele
 * captura o regime permanente — o projeto já levantado, onde a memória persistente paga de volta.
 *
 * Token ≈ bytes/4 (o mesmo proxy do resto do framework). Não é preciso; é reproduzível e honesto.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { domainsOf, buildContextPack } from '../lib/code-context.ts';

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), '..');

/**
 * Modo `--project <path>`: mede o eixo memória nos domínios REAIS do usuário, não na fixture. Para
 * cada domínio, o mapa (`context.md`) vs ler todo o código da fatia — o número fica dele.
 */
function projectMode(projectRoot: string): void {
  const domains = domainsOf(projectRoot);
  console.log(`\nToken economy — eixo memória nos domínios de ${projectRoot} (ADR-0009)\n`);
  if (!domains.length) {
    console.log(`Nenhum domínio em ${path.join(projectRoot, 'memory/30-domains')}. Rode dentro de um projeto gerado.`);
    return;
  }
  console.log('Para cada domínio: ler o mapa (context.md) vs ler todo o código da fatia.\n');
  const rows: any[] = [];
  for (const domain of domains) {
    const pack = buildContextPack({ projectRoot, domain, includeCode: true });
    const economy = pack.codeTokens === 0 ? '—' : `−${Math.round(((pack.codeTokens - pack.mapTokens) / pack.codeTokens) * 100)}%`;
    rows.push({ domínio: domain, mapa_tok: pack.mapTokens, código_tok: pack.codeTokens, mapa_vs_código: economy });
    console.log(`■ ${domain}`);
    console.log(`  mapa (context.md):  ${String(pack.mapTokens).padStart(5)} tok`);
    console.log(`  código da fatia:    ${String(pack.codeTokens).padStart(5)} tok  (${pack.code.length} arq.)`);
    console.log(`  o mapa custa ${economy} do código — é o resumo que substitui a leitura da árvore\n`);
  }
  console.log('O mapa é o resumo do domínio: lê-lo custa uma fração de ler a fatia inteira. Essa é a');
  console.log('economia da memória, medida no SEU projeto. (Sem mapa? rode `forja memory:audit`.)\n');
  if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 2));
}

const CLEAN = 'boilerplates/06-clean-arch/backend/src/modules/orders';
const CLEAN_CTX = 'boilerplates/06-clean-arch/memory/30-domains/orders/context.md';
const SHARED = 'boilerplates/06-clean-arch/backend/src/shared/result.ts';
const FLAT = 'benchmarks/clean-vs-flat/orders-flat';

/** Todo o código da fatia Orders (clean) — o que se varre "no frio", sem mapa. */
const CLEAN_CODE = [
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
];

interface Variant {
  label: string;
  files: string[];
}
interface Scenario {
  axis: 'arquitetura' | 'memória';
  name: string;
  question: string;
  a: Variant; // o candidato "mais estruturado" (clean / quente)
  b: Variant; // o "mais simples" (flat / frio)
}

const SCENARIOS: Scenario[] = [
  {
    axis: 'arquitetura',
    name: 'entender a feature inteira',
    question: 'ler todo o código da fatia para entender o que ela faz',
    a: { label: 'clean', files: CLEAN_CODE },
    b: {
      label: 'flat',
      files: [`${FLAT}/order.entity.ts`, `${FLAT}/orders.service.ts`, `${FLAT}/orders.controller.ts`],
    },
  },
  {
    axis: 'arquitetura',
    name: 'mudar a regra de envio',
    question: 'alterar a invariante "não envia sem pagamento" — o contexto mínimo suficiente',
    a: { label: 'clean', files: [CLEAN_CTX, `${CLEAN}/domain/order.entity.ts`, `${CLEAN}/domain/order-status.vo.ts`] },
    b: { label: 'flat', files: [`${FLAT}/orders.service.ts`] },
  },
  {
    axis: 'memória',
    name: 'trabalhar no domínio — com vs sem o mapa da memória',
    question: 'localizar e mexer na regra numa fatia já existente (ADR-0009) — o regime permanente',
    // Quente: a memória (context.md) aponta o agregado + a máquina de estados. Vai direto.
    a: { label: 'quente (memória)', files: [CLEAN_CTX, `${CLEAN}/domain/order.entity.ts`, `${CLEAN}/domain/order-status.vo.ts`] },
    // Frio: sem mapa, varre o código da fatia para descobrir onde a regra vive.
    b: { label: 'frio (sem memória)', files: CLEAN_CODE },
  },
];

const tokensOf = (rel: string): number => {
  try {
    return Math.round(fs.readFileSync(path.join(root, rel), 'utf8').length / 4);
  } catch {
    return 0;
  }
};
const sum = (files: string[]) => files.reduce((acc, f) => acc + tokensOf(f), 0);
const pct = (a: number, b: number) => (b === 0 ? '—' : `${a <= b ? '−' : '+'}${Math.abs(Math.round(((a - b) / b) * 100))}%`);

// `--project <path>`: mede o eixo memória no projeto real e sai. Sem ele, o benchmark de fixture.
const projIdx = process.argv.indexOf('--project');
if (projIdx >= 0) {
  projectMode(path.resolve(process.argv[projIdx + 1] || process.cwd()));
  process.exit(0);
}

console.log('\nToken economy — o custo do CONTEXTO por cenário (ADR-0027, ADR-0009)\n');
console.log('Token ≈ bytes/4. Não mede o custo de gerar do zero (custo único); mede o regime permanente.\n');

const out: any[] = [];
for (const s of SCENARIOS) {
  const a = sum(s.a.files);
  const b = sum(s.b.files);
  out.push({ eixo: s.axis, cenário: s.name, [s.a.label]: a, [s.b.label]: b, a_vs_b: pct(a, b) });
  console.log(`■ [${s.axis}] ${s.name}`);
  console.log(`  ${s.question}`);
  console.log(`  ${s.a.label.padEnd(18)} ${String(a).padStart(5)} tok  (${s.a.files.length} arq.)`);
  console.log(`  ${s.b.label.padEnd(18)} ${String(b).padStart(5)} tok  (${s.b.files.length} arq.)`);
  console.log(`  ${s.a.label} vs ${s.b.label}: ${pct(a, b)}\n`);
}

const arch = out[1]; // mudar a regra, clean vs flat
const mem = out[2]; // frio vs quente
console.log('Veredito (derivado dos números):');
console.log(`  • EIXO ARQUITETURA: numa feature pequena, camadas custam MAIS token (${arch.a_vs_b} para`);
console.log(`    a mudança isolada). "Clean Architecture economiza tokens" não se sustenta nessa escala —`);
console.log(`    a justificativa das camadas é isolamento e testabilidade, não token.`);
console.log(`  • EIXO MEMÓRIA: o mapa (context.md) faz o contexto mínimo custar ${mem.a_vs_b} vs varrer`);
console.log(`    a fatia no frio. É AQUI que a economia mora — e ela COMPÕE: o scaffold é custo único,`);
console.log(`    o mapa economiza a cada tarefa futura. Depois do projeto levantado, a memória paga de volta.\n`);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(out, null, 2));
}
