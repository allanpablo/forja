# Plan: Engineering Graph extensions (ADR/SPEC como nós de primeira classe)

- **Spec**: ./spec.md
- **Status**: approved
- **Criado em**: 2026-09-01

## 1. Abordagem técnica

Estender `extractDeterministicRelations` (packages/graph) para ler o campo `Status` de ADR e de
Spec como propriedade dedicada (não `GraphNode.status`/`KnowledgeStatus` — ver AC-1, é um
vocabulário de domínio diferente). `GraphNodeSpec`/`GraphNode` (packages/contracts) ganham um campo
opcional `documentStatus?: string` — extensão aditiva, mesmo padrão já usado nesta mesma janela de
trabalho para `PolicyLimits.maxCostUsd`/`isPathWithinRoot`/`remoteAddress` em `HttpRequest`: nenhum
consumidor existente quebra, campo ausente = comportamento idêntico ao de hoje.

`adr:list`/`adr:show`/`adr:impact`/`adr:graph` são scripts novos (`scripts/adr.ts`), mesmo padrão
de `scripts/drift-check.ts`: comando de processo, não capability registrada — não escreve em
projeto, só lê o grafo.

## 2. Módulos afetados

| Caminho | Mudança | Risco |
|---|---|---|
| `packages/graph/src/index.ts` | `extractDeterministicRelations`: ler `- **Status**: <valor>` de ADR e `- **Status**: <valor>` de spec.md, embutir no label do nó | Baixo — aditivo, mesma função já testada |
| `scripts/adr.ts` | novo — `adr:list`/`adr:show`/`adr:impact`/`adr:graph` | Baixo — só leitura |
| `lib/core/registry.ts` | registrar os 4 comandos novos | Baixo |
| `test/graph.test.js` | testes para status de ADR/SPEC no extrator | — |
| `test/adr-cli.test.js` (novo) | testes de CLI para os 4 comandos | — |

## 3. Diagrama de fluxo

```text
memory/90-decisions/*.md  ──┐
specs/*/spec.md            ─┼─► extractDeterministicRelations (estendido)
                             │        │
                             │        ▼
                             │   GraphLoop.apply (existente, sem mudança)
                             │
                             ▼
                   scripts/adr.ts (list/show/impact/graph)
                             │
                             ▼
                   GraphLoop.query()/impact() (existente, sem mudança)
```

## 4. Contratos (API/CLI/Schema)

```ts
// packages/contracts/src/index.ts (aditivo)
export interface GraphNode extends AuditFields {
  // ...campos existentes inalterados...
  readonly documentStatus?: string; // 'accepted'|'proposed'|'superseded'|'deprecated'|'rejected' (ADR) ou 'draft'|'review'|'approved'|'implementing'|'done'|'abandoned' (SPEC) — vocabulário do documento, não confundir com KnowledgeStatus
}
export interface GraphNodeSpec {
  // ...campos existentes inalterados...
  readonly documentStatus?: string;
}
```

```bash
adr:list                 # lista ADRs com status
adr:show <id>            # mostra uma ADR: status, arquivo, resumo de constraints (se houver)
adr:impact <id>          # usa GraphLoop.impact() — nós/arestas alcançáveis
adr:graph                # exporta subgrafo (JSON) de nós ADR/SPEC + vizinhança
```
(sem prefixo `forja`/`npm run` aqui — comandos ainda não existem; ver convenção já usada em
`docs/architecture/FORJA-3-ENGINEERING-INTELLIGENCE-ARCHITECTURE.md`)

## 5. Decisões e alternativas

**D1**: `documentStatus?: string` como campo novo, aditivo, em `GraphNode`/`GraphNodeSpec`.
Alternativa rejeitada: usar `GraphNode.status` (`KnowledgeStatus`) — explicitamente proibido pela
spec (AC-1), mistura o ciclo de vida do documento com a epistemologia da aresta. Alternativa
descartada: embutir no `label` (string) — mais frágil (parse reverso, título com separador
colidindo) sem nenhuma economia real, já que extensão aditiva de contrato é o padrão já em uso
nesta mesma janela de trabalho para casos equivalentes.

## 6. Dependências

- Nenhuma spec bloqueadora. `packages/graph`, `scripts/`, `lib/core/registry.ts` já existentes.

## 7. Rollout

- [ ] Feature flag necessária? Não — leitura pura, sem side effect em projeto consumidor.
- [ ] Migração de dados existentes? Não — próxima reindexação (`code:sync`/`drift:check`) já
      popula o status ao reprocessar os documentos.
- [ ] Doc/persona impactada? `docs/architecture/`, README (comandos novos).

## 8. Sinais de fracasso (kill criteria)

Se o parse de `label` para extrair status de volta (D1) se mostrar frágil (ADRs com título contendo
" · ") isso é motivo para promover à alternativa (b) do D1 antes de expandir mais consumidores.
