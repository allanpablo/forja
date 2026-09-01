/**
 * lib/drift-sentinel.ts — drift:check (SPEC-030): "verified" é um instantâneo, não uma garantia
 * eterna.
 *
 * `GraphIndexer.sync`/`GraphLoop.apply` já são idempotentes por checksum de fonte: quando o
 * conteúdo de um documento não muda, `apply()` pula. O que faltava era o outro lado — quando o
 * conteúdo MUDA, nada compara o que a extração determinística produzia antes com o que produz
 * agora, e uma aresta `verified` que a extração atual não reproduz mais fica `verified` para
 * sempre, sem que nada sinalize que ela pode ter apodrecido.
 *
 * Este módulo fecha essa lacuna reaproveitando `GraphLoop`, `GraphStore` e
 * `extractDeterministicRelations` exatamente como estão — nenhum dos três ganha contrato novo
 * (SPEC-030 §5). Em particular, `GraphEdge` (packages/contracts) **não** ganha um campo de
 * proveniência (`sourceKey`): esse seria um jeito mais direto de descobrir "quais arestas este
 * documento produziu da última vez", mas mudaria um contrato versionado por uma informação que já
 * está — indiretamente — no grafo. `extractDeterministicRelations` grava, em toda evidência, um
 * `locator` no formato `${document.locator}:${line}` (o `sourceKey` é o próprio `document.locator`
 * do extrator). Filtrar `store.listEdges()` pelas arestas com ao menos uma evidência cujo
 * `locator` comece com `${sourceKey}:` deriva a proveniência sem duplicar estado nem arriscar as
 * duas representações divergirem entre si.
 *
 * Staleness reaproveita `validTo` (AC-2): `GraphLoop.active()`/`activeEdges()` já tratam uma
 * aresta com `validTo` no passado como inativa para `query()`/`path()`/`impact()`/
 * `contradictions()`/`contextRecords()`, mas ela continua inspecionável historicamente via o
 * parâmetro `at`. Isso é deliberadamente diferente de `status: 'contradicted'` (que já existe e
 * significa "conflito ativo entre duas afirmações", não "ficou desatualizada") — ver riscos do
 * spec.
 */

import type { Evidence, GraphEdge, ISO8601 } from '../packages/contracts/src/index.ts';
import { extractDeterministicRelations, type DeterministicDocument, type GraphDocumentSource, type GraphLoop, type GraphStore } from '../packages/graph/src/index.ts';

export interface StaleRelation {
  readonly from: string;
  readonly to: string;
  readonly type: string;
}

export interface DocumentDrift {
  readonly sourceKey: string;
  readonly stale: readonly StaleRelation[];
}

export interface DriftReport {
  readonly documents: number;
  readonly unchanged: number;
  readonly changed: number;
  readonly drifted: number;
  readonly details: readonly DocumentDrift[];
  readonly durationMs: number;
}

export interface DriftCheckOptions {
  /** Restringe a checagem aos documentos cujo locator tem `<domain>` como um segmento de path. */
  readonly domain?: string;
}

/**
 * Assinatura estável de uma relação (from|to|type|validFrom) — não é `GraphLoop.edgeKey` (privado),
 * mas o mesmo formato: arestas do extrator determinístico nunca fixam `validFrom`, então a chave
 * sempre colapsa em `from|to|type|`. Usada só para comparar "existia antes" com "existe agora".
 */
function relationSignature(relation: { readonly from: string; readonly to: string; readonly type: string; readonly validFrom?: string }): string {
  return `${relation.from}|${relation.to}|${relation.type}|${relation.validFrom ?? ''}`;
}

/**
 * `${document.locator}:${line}` → `document.locator`. Assume-se que o locator do documento em si
 * nunca contém `:` (paths de arquivo não têm), o que vale para todo `GraphDocumentSource` do
 * repositório (git, in-memory de teste).
 */
function sourceKeyFromEvidenceLocator(locator: string): string | undefined {
  return /^(.*):\d+$/.exec(locator)?.[1];
}

/**
 * Agrupa `store.listEdges()` por `sourceKey` (derivado do locator da evidência — ver cabeçalho do
 * módulo) numa **única** passada, restrita às chaves em `allowed`. Existe para não repetir
 * `store.listEdges()`/`store.getEvidence()` por documento: `drift:check` roda sobre o workspace
 * inteiro, e um `listEdges()` (desserializa toda aresta) dentro de um laço por documento é
 * O(documentos × arestas) — no dogfooding deste comando contra o próprio monorepo (930 documentos,
 * ~27 mil arestas) isso levava >100s contra ~7s do `graph:sync` equivalente, violando o NFR de
 * "não mais caro que rodar code:index duas vezes". Uma única passada é O(arestas).
 */
function edgesBySource(store: GraphStore, allowed: ReadonlySet<string>): ReadonlyMap<string, readonly GraphEdge[]> {
  const bySource = new Map<string, GraphEdge[]>();
  if (allowed.size === 0) return bySource;
  for (const edge of store.listEdges()) {
    for (const id of edge.evidenceIds) {
      const item: Evidence | undefined = store.getEvidence(id);
      const sourceKey = item === undefined ? undefined : sourceKeyFromEvidenceLocator(item.locator);
      if (sourceKey === undefined || !allowed.has(sourceKey)) continue;
      const bucket = bySource.get(sourceKey);
      if (bucket === undefined) bySource.set(sourceKey, [edge]);
      else if (bucket[bucket.length - 1] !== edge) bucket.push(edge); // uma aresta pode citar >1 evidência da mesma fonte; não duplicar
    }
  }
  return bySource;
}

function matchesDomain(locator: string, domain: string): boolean {
  return locator.split('/').includes(domain);
}

/**
 * Reindexa via `extractDeterministicRelations` + `GraphLoop.apply` (o mesmo mecanismo de
 * `GraphIndexer.sync` — reimplementado aqui, não copiado, porque precisamos do "antes" de cada
 * documento cujo checksum mudou, que `sync()` não expõe) e, para cada relação `verified` que a
 * extração atual não reproduz mais, marca `validTo` = agora (AC-2). Determinístico e sem rede/LLM
 * (AC-4): a única entrada é `source.listDocuments()` e a única saída é o relatório + as mutações
 * de `validTo` no próprio `graph`.
 */
export async function checkDrift(graph: GraphLoop, store: GraphStore, source: GraphDocumentSource, options: DriftCheckOptions = {}): Promise<DriftReport> {
  const started = Date.now();
  const all: readonly DeterministicDocument[] = await source.listDocuments();
  const documents = options.domain === undefined ? all : all.filter((document) => matchesDomain(document.locator, options.domain as string));
  const now = new Date().toISOString() as ISO8601;

  // Passo 1: extrai tudo primeiro (barato — I/O + regex, sem tocar o índice de arestas) e classifica
  // por checksum. `apply()` ainda não roda aqui: o "antes" precisa ser capturado com o store como
  // estava antes desta rodada.
  const extracted = documents.map((document) => ({ document, mutation: extractDeterministicRelations(document), previousChecksum: store.getSourceChecksum(document.locator) }));
  const changedEntries = extracted.filter((entry) => entry.previousChecksum !== entry.mutation.sourceChecksum);
  const unchanged = extracted.length - changedEntries.length;

  // Passo 2: uma única passada pelas arestas existentes, restrita aos sourceKeys que de fato mudaram
  // (documento nunca antes indexado não tem "antes" para comparar — fica de fora do índice).
  const changedKeys = new Set(changedEntries.map((entry) => entry.document.locator));
  const priorEdgesBySource = edgesBySource(store, changedKeys);

  // Passo 3: aplica a extração atual (mesmo efeito de GraphIndexer.sync — idempotente por checksum).
  for (const entry of extracted) graph.apply(entry.mutation);

  // Passo 4: diff — só documentos que mudaram entram aqui, e o "antes" já está pronto do passo 2.
  const details: DocumentDrift[] = [];
  for (const entry of changedEntries) {
    const priorEdges = priorEdgesBySource.get(entry.document.locator) ?? [];
    if (priorEdges.length === 0) continue;
    const currentSignatures = new Set(entry.mutation.edges.map(relationSignature));

    const stale: StaleRelation[] = [];
    for (const edge of priorEdges) {
      // Só relação que existia como verified e ainda está ativa (validTo indefinido) pode "driftar":
      // uma já staleada por uma checagem anterior não deve ganhar um novo carimbo a cada rodada, e
      // 'inferred'/'hypothesis'/'contradicted' não são o que a spec chama de drift (AC-2).
      if (edge.status !== 'verified' || edge.validTo !== undefined) continue;
      if (currentSignatures.has(relationSignature(edge))) continue;
      graph.upsertEdge({ from: edge.from, to: edge.to, type: edge.type, status: edge.status, confidence: edge.confidence, evidenceIds: edge.evidenceIds, validFrom: edge.validFrom, validTo: now });
      stale.push({ from: edge.from, to: edge.to, type: edge.type });
    }
    if (stale.length > 0) details.push({ sourceKey: entry.document.locator, stale });
  }

  return { documents: documents.length, unchanged, changed: changedEntries.length, drifted: details.length, details, durationMs: Date.now() - started };
}
