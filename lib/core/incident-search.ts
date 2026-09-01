/**
 * lib/core/incident-search.ts — busca de incidentes por palavra-chave (SPEC-041, reaproveitada por
 * SPEC-042).
 *
 * Extraído pra `lib/core` (mesmo padrão de `risk-collect.ts`) em vez de ficar em
 * `scripts/incident.ts`: um script tem `main()` executado incondicionalmente ao ser importado — um
 * `import` de `scripts/engineer.ts` pra `scripts/incident.ts` rodaria o `main()` de `incident.ts`
 * como efeito colateral, processando o `argv` errado. Lógica compartilhada entre comandos sempre
 * vive em `lib/core`/`packages/*`, nunca em outro `scripts/*.ts`.
 */

import type { GraphNode } from '../../packages/contracts/src/index.ts';
import type { SqliteGraphStore } from '../../packages/adapter-sqlite/src/index.ts';

export function incidentRecords(store: SqliteGraphStore): readonly GraphNode[] {
  return store.listNodes().filter((node) => node.type === 'Incident').sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function titleOf(node: GraphNode): string {
  return node.label.split('\n')[0];
}

const STOPWORDS = new Set(['o', 'a', 'os', 'as', 'de', 'do', 'da', 'em', 'um', 'uma', 'e', 'que', 'para', 'com', 'não']);

function terms(text: string): readonly string[] {
  return text.toLowerCase().split(/[^a-z0-9áéíóúâêôãõç]+/).filter((term) => term.length > 1 && !STOPWORDS.has(term));
}

export interface RankedIncident {
  readonly record: GraphNode;
  readonly relevance: number;
}

export function rankIncidentsByQuery(records: readonly GraphNode[], query: string): readonly RankedIncident[] {
  const queryTerms = terms(query);
  return records
    .map((record) => {
      const recordTerms = new Set(terms(record.label));
      const matches = queryTerms.filter((term) => recordTerms.has(term)).length;
      return { record, matches, relevance: queryTerms.length === 0 ? 0 : matches / queryTerms.length };
    })
    .filter((item) => item.matches > 0)
    .map(({ record, relevance }) => ({ record, relevance }))
    .sort((left, right) => right.relevance - left.relevance || left.record.id.localeCompare(right.record.id));
}
