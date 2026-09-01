# Plan: Engineering Evidence Ledger + `forja engineer` (façade)

- **Spec**: ./spec.md
- **Status**: approved
- **Criado em**: 2026-09-01

## 1. Abordagem técnica

Dois entregáveis pequenos, ambos composição pura sobre o que já existe — nenhuma tabela SQLite
nova, nenhuma lógica de decisão nova:

1. `packages/engineering/evidence` — `buildEvidenceLedger(input)`, função pura que recebe um
   `RuntimeRun` + `AuditRecord[]`/`ApprovalRequest[]` já filtrados + `ArchitectureCheckReport`/
   `ChangeRiskAssessment` opcionais e devolve o JSON agregado (`run/intent/agent/risk/
   architectureCheck/tests/approvals/commit`). `scripts/evidence.ts` é o adapter (`evidence:show
   <run-id>`) que busca esses dados reais via `SqliteRuntimeRunStore`/`SqliteAuditStore`/
   `ApprovalLedger`.
2. `scripts/engineer.ts` — `forja engineer "<objetivo>"`, façade que chama, nesta ordem:
   `ContextEngine.build()` (grafo, mesmo padrão de `scripts/demo-autonomy.ts`) →
   `GraphLoop.contextRecords(objetivo)` filtrado a nós ADR/SPEC (SPEC-032, reaproveitado, não uma
   busca nova) → `architecture:check` (não escopado — antes de haver diff, não há arquivo pra
   escopar; ver D1) → `RiskEngine.assess()` (só com `--ref`; ver D1) → fluxo recomendado, parseado
   de `docs/fluxo.md` (D2 — parser, não cópia hardcoded).

## 2. Módulos afetados

| Caminho | Mudança | Risco |
|---|---|---|
| `packages/engineering/evidence/src/index.ts` | novo — `buildEvidenceLedger` | Baixo — mapeamento puro |
| `scripts/evidence.ts` | novo — `evidence:show <run-id>` | Baixo |
| `scripts/engineer.ts` | novo — `engineer "<objetivo>" [--ref <ref>] [--json]` | Médio — orquestra 4 subsistemas, mas cada chamada já existe |
| `lib/core/registry.ts` | 2 comandos novos | Baixo |
| `test/evidence-ledger.test.js` (novo) | testes puros de `buildEvidenceLedger` | — |
| `test/engineer-cli.test.js` (novo) | fixture git isolada, `engineer` ponta a ponta | — |

## 3. Diagrama de fluxo

```text
forja engineer "<objetivo>" [--ref <ref>]
        │
        ├─► ContextEngine.build({ objective, graph: GraphContextSource(graph.contextRecords) })
        ├─► graph.contextRecords(objetivo) filtrado a nós ADR/SPEC (SPEC-032)
        ├─► architecture:check (constitution.json real, SPEC-033) — não escopado
        ├─► RiskEngine.assess() (SPEC-034) — só se --ref foi passado
        └─► fluxo recomendado — parseado da tabela "Etapa → papel → comando" de docs/fluxo.md
                │
                ▼
        saída de texto (default) ou --json (AC-3: nunca sintetiza além do que cada
        subsistema já disse)
```

## 4. Contratos (API/CLI/Schema)

```ts
// packages/engineering/evidence/src/index.ts
export interface EvidenceLedgerInput {
  readonly run: RuntimeRun;
  readonly auditRecords: readonly AuditRecord[];
  readonly approvals: readonly ApprovalRequest[];
  readonly architectureCheck?: ArchitectureCheckReport;
  readonly riskAssessment?: ChangeRiskAssessment;
  readonly commit?: string;
}
export interface EvidenceLedgerRecord {
  readonly run: { readonly runId: string; readonly state: string; readonly startedAt: string; readonly updatedAt: string; readonly steps: number; readonly changedFiles: readonly string[] };
  readonly intent: string;
  readonly agent: AgentIdentity;
  readonly architectureCheck?: ArchitectureCheckReport;
  readonly risk?: ChangeRiskAssessment;
  readonly tests?: EvaluationResult;
  readonly approvals: readonly ApprovalRequest[];
  readonly commit?: string;
}
export function buildEvidenceLedger(input: EvidenceLedgerInput): EvidenceLedgerRecord;
```

```bash
evidence:show <run-id>
engineer "<objetivo>" [--ref <ref>] [--json]
```

## 5. Decisões e alternativas

**D1**: `forja engineer` roda `architecture:check` **não escopado** (relatório completo, não
filtrado a arquivos) e só inclui `risk` quando `--ref` é passado explicitamente. A visão original
lista os dois como parte fixa da composição, mas `forja engineer` roda **antes** de existir um
diff (é a ferramenta que orienta o início do trabalho) — não há arquivos afetados ainda para
escopar nenhum dos dois. Alternativa rejeitada: inferir arquivos afetados a partir do texto do
objetivo (aí sim seria síntese/adivinhação, proibido por AC-3). Quando `--ref` é passado (ex.:
objetivo já tem uma branch com commits), o risco entra completo, exatamente como `risk:assess`
computaria.

**D2**: o "fluxo recomendado" é **parseado** da tabela "Etapa → papel → comando" existente em
`docs/fluxo.md`, não copiado/hardcoded em `scripts/engineer.ts`. Só uma fonte de verdade para os 6
passos SDD/GSD — se `docs/fluxo.md` mudar, `forja engineer` acompanha sem exigir sincronização
manual. Parser é uma regex sobre linhas de tabela markdown (determinístico, sem LLM).

**D3**: `EvidenceLedgerInput` não busca dado nenhum sozinho — é `scripts/evidence.ts`/
`scripts/engineer.ts` que buscam `RuntimeRun`/`AuditRecord`/`ApprovalRequest` reais e montam o
input. `buildEvidenceLedger` é só o mapeamento — igual ao par engine-puro/CLI-adapter já usado em
`packages/engineering/architecture` e `packages/engineering/risk`.

## 6. Dependências

- SPEC-032 (`GraphLoop.contextRecords`), SPEC-033 (`checkConstitution`), SPEC-034
  (`assessRisk`/`RiskEngine`) — todas já mergeadas/em PR quando este sprint começa.
- `packages/context.ContextEngine`/`GraphContextSource` (já existentes, mesmo padrão de
  `scripts/demo-autonomy.ts`).
- `packages/adapter-sqlite.SqliteRuntimeRunStore`/`SqliteAuditStore` (já existentes).

## 7. Rollout

- [ ] Feature flag necessária? Não.
- [ ] Migração de dados existentes? Não.
- [ ] Doc/persona impactada? README (comandos novos).

## 8. Sinais de fracasso (kill criteria)

Já registrado no apêndice de `specs/engineering-intelligence/spec.md`, §8 deste spec: se a saída de
`forja engineer` sobre um objetivo real não for usável sem edição, o design da façade (não os
engines subjacentes, já validados nos Sprints 1-2) é revisado.
