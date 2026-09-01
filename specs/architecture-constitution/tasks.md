# Tasks: Architecture Constitution

- **Spec**: ./spec.md
- **Plan**: ./plan.md
- **Status**: approved
- **Criado em**: 2026-09-01

---

## T1 — engine puro: parser + compile + check
- **Owner**: worker
- **Estimativa**: G
- **Depende de**: —
- **Paths**: `packages/engineering/architecture/src/index.ts`
- **Done quando**:
  - [ ] `parseConstraintLine` reconhece os 3 padrões (D2 do plan) e retorna `undefined`/confiança
        baixa para qualquer coisa fora do vocabulário
  - [ ] `compileConstitution` produz `ArchitectureRule[]` a partir de ADRs reais com
        `## Constraints`
  - [ ] `checkConstitution` compara regras contra `DependencyEdge[]` e reporta violações com
        severidade e remediação
  - [ ] testes unitários (sem `fs`/rede) cobrindo: padrão reconhecido → confidence 1; padrão
        ambíguo → confidence baixa, nunca `active`; violação injetada é detectada; ausência de
        violação é reportada como `compliant`

## T2 — `scripts/architecture.ts`: compile/check/status/explain/approve
- **Owner**: worker
- **Estimativa**: M
- **Depende de**: T1
- **Paths**: `scripts/architecture.ts`, `lib/core/registry.ts`
- **Done quando**:
  - [ ] `architecture:compile` lê `memory/90-decisions/*.md` reais e grava
        `.context/architecture/constitution.json`
  - [ ] `architecture:check` roda sobre o grafo real (reindexado como `adr:*`/`drift:check` já
        fazem) e reporta zero violação na linha de base deste repositório
  - [ ] `architecture:status`/`architecture:explain <rule-id>` funcionais
  - [ ] `architecture:approve <rule-id>` reaproveita `ApprovalLedger` (`packages/policy`), sem
        sistema de aprovação paralelo
  - [ ] `forja tools:doctor` continua verde (comandos documentados no README)

## T3 — prova sobre dado real + violação injetada em teste
- **Owner**: worker
- **Estimativa**: P
- **Depende de**: T2
- **Paths**: `memory/90-decisions/0078-forjajs-3-engineering-control-plane.md` (`## Constraints`
  já adicionado), `test/architecture-constitution-cli.test.js` (novo)
- **Done quando**:
  - [ ] `architecture:compile` + `architecture:check` reais sobre este repositório: 1 regra
        ativa, zero violação
  - [ ] teste de CLI com fixture isolada prova que uma violação real (arquivo importando o que a
        regra proíbe) é detectada com exit code ≠ 0

---

## Handoffs entre agentes

T1→T2→T3 sequencial. Sem handoff de papel — spec e plan já aprovados cobrem as decisões de
produto/arquitetura.
