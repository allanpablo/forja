# Tasks: Engineering Graph extensions

- **Spec**: ./spec.md
- **Plan**: ./plan.md
- **Status**: approved
- **Criado em**: 2026-09-01

---

## T1 — `documentStatus` no contrato de grafo
- **Owner**: worker
- **Estimativa**: P
- **Depende de**: —
- **Paths**: `packages/contracts/src/index.ts`
- **Done quando**:
  - [ ] `GraphNode`/`GraphNodeSpec` ganham `documentStatus?: string`
  - [ ] `npx tsc --noEmit` limpo
  - [ ] nenhum teste existente quebra (campo opcional)

## T2 — extrator lê status de ADR e de SPEC
- **Owner**: worker
- **Estimativa**: M
- **Depende de**: T1
- **Paths**: `packages/graph/src/index.ts`
- **Done quando**:
  - [ ] `extractDeterministicRelations` popula `documentStatus` do nó ADR a partir de
        `- **Status**: <valor>` no corpo do documento (formato de `memory/90-decisions/_template.md`)
  - [ ] mesmo tratamento para nó `SPEC` a partir do campo `Status` de `specs/_templates/spec.md`
  - [ ] testes em `test/graph.test.js` cobrindo ADR com/sem status e SPEC com/sem status
  - [ ] testes passando

## T3 — `scripts/adr.ts`: list/show/impact/graph
- **Owner**: worker
- **Estimativa**: M
- **Depende de**: T2
- **Paths**: `scripts/adr.ts`, `lib/core/registry.ts`
- **Done quando**:
  - [ ] `adr:list` lista ADRs reais de `memory/90-decisions/` com status
  - [ ] `adr:show <id>` mostra status, arquivo, e (se houver) o texto de `## Constraints`
  - [ ] `adr:impact <id>` usa `GraphLoop.impact()` já existente, sem reimplementar BFS
  - [ ] `adr:graph` exporta subgrafo JSON de nós ADR/SPEC + vizinhança direta
  - [ ] `forja tools:doctor` (`docs-commands`/`commands-documented`) continua verde após os
        comandos novos serem documentados no README

## T4 — testes de CLI + integração com `code:sync`
- **Owner**: worker
- **Estimativa**: P
- **Depende de**: T3
- **Paths**: `test/adr-cli.test.js` (novo)
- **Done quando**:
  - [ ] `adr:impact 0020` (ADR real deste repositório) retorna componentes plausíveis
  - [ ] `npm test` verde, `npx tsc --noEmit` limpo

---

## Handoffs entre agentes

T1→T2→T3→T4 é sequencial (cada uma consome o contrato/dado da anterior); sem handoff de papel
(tudo cai em `worker`, sem etapa própria de product/architect — spec e plan já aprovados cobrem
essa decisão).
