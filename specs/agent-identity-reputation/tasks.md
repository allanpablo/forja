# Tasks: Agent Identity & Reputation

- **Spec**: ./spec.md
- **Plan**: ./plan.md
- **Status**: approved
- **Criado em**: 2026-09-01

---

## T1 — contrato + engine puro (`computeReputationScore`)
- **Owner**: worker
- **Estimativa**: M
- **Depende de**: —
- **Paths**: `packages/contracts/src/index.ts`, `packages/engineering/identity/src/index.ts`
- **Done quando**:
  - [ ] `AgentProfile2` aditivo, `trustLevel`/`autonomyLevel`/`lastScoredAt` opcionais
  - [ ] `computeReputationScore` implementa a fórmula de D1 do plan
  - [ ] amostra abaixo de `minSampleSize` força `autonomyLevel: 'human_in_the_loop'` (AC-3)
  - [ ] testes unitários (sem `fs`/rede): fórmula com dado real vs. sintético, cold start,
        thresholds customizados, `evidenceIds` passthrough do `EvaluationReport.observationIds`

## T2 — persistência (`SqliteAgentProfileStore`) + `scripts/agent.ts`
- **Owner**: worker
- **Estimativa**: G
- **Depende de**: T1
- **Paths**: `packages/adapter-sqlite/src/index.ts`, `scripts/agent.ts`, `lib/core/registry.ts`
- **Done quando**:
  - [ ] `SqliteAgentProfileStore` reaproveita `SqliteJsonRepository`, sem migration nova (D3)
  - [ ] `agent:register` não tem flag de `trust-level`/`autonomy-level` (D2)
  - [ ] `agent:score` computa e persiste `trustLevel`/`autonomyLevel`/`lastScoredAt`, filtro por
        `--domain` funcional (D4)
  - [ ] `agent:list`/`:show`/`:history` funcionais
  - [ ] `forja tools:doctor` continua verde

## T3 — prova sobre dado real/sintético documentado
- **Owner**: worker
- **Estimativa**: P
- **Depende de**: T2
- **Paths**: `test/agent-cli.test.js` (novo)
- **Done quando**:
  - [ ] fixture isolada: registrar agente, seed de `Observation`s sintéticas (documentadas como
        tal — sem `Observation` real suficiente neste workspace), `agent:score` produz resultado
        coerente
  - [ ] cold start (sem `Observation`) produz `human_in_the_loop`, não erro

---

## Handoffs entre agentes

T1 → T2 → T3 sequencial. Sem handoff de papel — spec e plan já aprovados cobrem as decisões de
produto/arquitetura.
