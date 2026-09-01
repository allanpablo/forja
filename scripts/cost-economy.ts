#!/usr/bin/env node
/**
 * cost-economy — SPEC-029 AC-5: `token:economy` mede tokens; isto mede o que realmente importa pra
 * quem paga a conta, dólar. Novo comando (em vez de estender `token:economy` in-place) porque os
 * dois eixos medem coisas diferentes: `token:economy` compara CENÁRIOS sintéticos de fixture
 * (arquitetura clean vs flat, memória quente vs fria — nunca rodou um LLM de verdade). `cost:economy`
 * agrega OBSERVAÇÕES REAIS já gravadas por `forja llm:run` (mesmo `ObservationStore` de `llm:eval`),
 * multiplicadas pela tabela de preço local (`lib/core/model-pricing.json`, AC-3). Reaproveitar o
 * comando de fixture faria "economia de token" parecer "economia de custo" sobre dados que nunca
 * geraram custo real — daí o comando irmão em vez de uma seção dentro de `token:economy`.
 *
 * Escopo por projeto/domínio: cada projeto tem seu próprio workspace/DB (FORJA_WORKSPACE), então
 * rodar `forja cost:economy` dentro do workspace de um projeto já reporta o custo DAQUELE projeto —
 * sem precisar de um campo `projectId` novo em `Observation` (fora do escopo deste spec).
 *
 * Estimativa, não fatura: nomeado explicitamente nos dois formatos de saída (mitigação de risco do
 * SPEC-029 — "confundir custo estimado com custo real cobrado").
 */
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { SqliteMigrationRunner, SqliteObservationStore } from '../packages/adapter-sqlite/src/index.ts';
import { getWorkspaceDbDir, getWorkspaceDbPath, getWorkspaceInfo } from '../lib/workspace.ts';
import { loadPricingTable, lookupPrice } from '../lib/core/model-pricing.ts';

interface ModelSummary {
  count: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  priceKnown: boolean;
}

function main(): void {
  const info = getWorkspaceInfo();
  fs.mkdirSync(getWorkspaceDbDir(), { recursive: true });
  const db = new Database(process.env.FORJA_RUNTIME_DB ?? getWorkspaceDbPath());
  new SqliteMigrationRunner(db).apply();
  const store = new SqliteObservationStore(db);
  const observations = store.list();
  db.close();

  const table = loadPricingTable();
  const byModel = new Map<string, ModelSummary>();
  let totalCostUsd = 0;
  let unknownPricingCount = 0;

  for (const observation of observations) {
    const model = observation.model ?? '(sem modelo)';
    const priceKnown = lookupPrice(table, observation.model) !== undefined;
    const entry = byModel.get(model) ?? { count: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, priceKnown };
    entry.count += 1;
    entry.inputTokens += observation.inputTokens;
    entry.outputTokens += observation.outputTokens;
    entry.costUsd += observation.cost ?? 0;
    entry.priceKnown = entry.priceKnown || priceKnown;
    byModel.set(model, entry);
    totalCostUsd += observation.cost ?? 0;
    if (!priceKnown) unknownPricingCount += 1;
  }

  console.log(`\nCost economy — custo real acumulado (SPEC-029) — workspace: ${info.root}\n`);
  console.log('Estimativa baseada na tabela local de preços (lib/core/model-pricing.json), NÃO a fatura do provider.\n');

  if (observations.length === 0) {
    console.log('Nenhuma observação registrada ainda. Rode `forja llm:run --profile <perfil> --prompt <texto>` para gerar execuções.');
  } else {
    const rows = [...byModel.entries()].sort((left, right) => right[1].costUsd - left[1].costUsd);
    for (const [model, entry] of rows) {
      const flag = entry.priceKnown ? '' : '  (preço desconhecido nesta execução — custo pode estar subestimado)';
      console.log(`■ ${model}${flag}`);
      console.log(`  execuções: ${entry.count}  tokens: ${entry.inputTokens + entry.outputTokens} (in ${entry.inputTokens} / out ${entry.outputTokens})`);
      console.log(`  custo estimado: $${entry.costUsd.toFixed(4)}\n`);
    }
    console.log(`Total: $${totalCostUsd.toFixed(4)} estimado em ${observations.length} execução(ões).`);
    if (unknownPricingCount > 0) {
      console.log(`Aviso: ${unknownPricingCount} execução(ões) usaram modelo(s) sem preço na tabela local — custo real total pode ser maior que o mostrado. Atualize lib/core/model-pricing.json (\`forja llm:doctor\` lista os gaps).`);
    }
  }

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({
      workspace: info.root,
      currency: table.currency,
      totalCostUsd,
      observationCount: observations.length,
      unknownPricingCount,
      byModel: Object.fromEntries(byModel),
    }, null, 2));
  }
}

main();
