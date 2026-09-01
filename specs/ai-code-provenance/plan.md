# Plan: AI Code Provenance + AI-SBOM

- **Spec**: ./spec.md
- **Status**: approved
- **Criado em**: 2026-09-01

## 1. Abordagem técnica

Novo sub-domínio `packages/engineering/provenance` (autorizado por ADR-0078), puro: só
`extractProvenance(run)`, mapeamento de `RuntimeRun.changedFiles` para `ProvenanceRecord[]`.
Persistência via `SqliteProvenanceStore` (reaproveita `SqliteJsonRepository`, mesmo padrão zero-
migration de `SqliteAgentProfileStore`/`SqliteRuntimeRunStore`). `scripts/provenance.ts` é o
adapter: `provenance:record <run-id>` (lê o `RuntimeRun` via `SqliteRuntimeRunStore.get`, já
existente), `blame <file>`, `sbom`.

## 2. Módulos afetados

| Caminho | Mudança | Risco |
|---|---|---|
| `packages/engineering/provenance/src/index.ts` | novo — `extractProvenance` | Baixo — mapeamento puro |
| `packages/adapter-sqlite/src/index.ts` | `SqliteProvenanceStore` novo (reaproveita `SqliteJsonRepository`) | Baixo |
| `scripts/provenance.ts` | novo — `provenance:record`/`blame`/`sbom` | Baixo |
| `lib/core/registry.ts` | 3 comandos novos | Baixo |
| `test/provenance.test.js` (novo) | unit + CLI | — |

## 3. Contratos

```ts
// packages/engineering/provenance/src/index.ts
export interface ProvenanceRecord {
  readonly file: string;
  readonly runId: string;
  readonly agentId: string;
  readonly model?: string;
  readonly lines?: readonly [number, number][]; // sempre undefined nesta spec — ver AC-2
  readonly recordedAt: string;
}
export function extractProvenance(run: RuntimeRun): readonly ProvenanceRecord[];
```

```bash
provenance:record <run-id>
blame <file>
sbom [--json]
```

## 4. Decisões

**D1**: `blame`/`sbom` são comandos de topo (não `provenance:blame`/`provenance:sbom`) — a visão
original e o CLI plan (`docs/architecture/...` §12) já citam `provenance:blame`/`:generate`, mas
"blame" e "sbom" como conceitos são suficientemente autoexplicativos e usados fora do namespace
`provenance:` em outras ferramentas (`git blame`, SBOM genérico) — manter `provenance:record` (a
ação de escrita, menos ambígua com prefixo) e deixar as duas leituras mais usadas sem prefixo,
espelhando `engineer`/`simulate` (façades/comandos de leitura frequente também sem prefixo de
domínio).

**D2**: `SqliteRuntimeRunStore` não ganha `list()` nesta spec — `blame`/`sbom` enumeram via
`SqliteProvenanceStore.list()` (nova, mas só ela é necessária); `SqliteRuntimeRunStore.get(runId)`
já existente basta pra `provenance:record <run-id>` (busca um run específico por id). Adicionar
`list()` a `SqliteRuntimeRunStore` sem um consumidor real seria antecipar uso hipotético — evitado
por princípio (CLAUDE.md/instruções da sessão: não adicionar abstração além do que a tarefa exige).

## 5. Rollout

Sem migração, sem feature flag.

## 6. Kill criteria

Já coberto pelo mesmo princípio das specs anteriores — se `blame`/`sbom` confundirem usuários por
prometerem granularidade de linha, revisar a UX (não os dados, que já são honestos por construção
via AC-2) antes de qualquer extensão futura.
