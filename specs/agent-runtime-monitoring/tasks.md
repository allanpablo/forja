# Tasks: Agent Runtime Monitoring / Behavior Anomaly Engine

- **Spec**: ./spec.md
- **Plan**: ./plan.md
- **Status**: approved
- **Criado em**: 2026-09-01

---

## T1 — `detectAnomaly` (motor puro) + `PolicyEngine` extensão
- **Owner**: worker
- **Estimativa**: M
- **Depende de**: —
- **Paths**: `packages/engineering/monitoring/src/index.ts`, `packages/policy/src/index.ts`
- **Done quando**:
  - [ ] `detectAnomaly` implementa a fórmula de D1, `confidence` reflete o menor dos dois tamanhos
        de amostra (AC-2)
  - [ ] `PolicyScope.anomalyScoreRange`/`PolicyRequest.anomalyScore` (D2), `packages/policy`
        continua sem importar `packages/engineering/monitoring`
  - [ ] testes unitários: degradação clara sinaliza corretamente; comportamento estável não
        sinaliza; amostra pequena em qualquer um dos dois recortes reduz confidence
  - [ ] testes de `PolicyEngine.matches` com `anomalyScoreRange`

## T2 — `agent:monitor` (CLI) + prova
- **Owner**: worker
- **Estimativa**: M
- **Depende de**: T1
- **Paths**: `scripts/agent.ts`, `lib/core/registry.ts`, `test/agent-cli.test.js`
- **Done quando**:
  - [ ] `agent:monitor <id> [--window-hours <n>]` busca `Observation`s reais, monta os dois
        `EvaluationReport` (linha de base/recente), chama `detectAnomaly`
  - [ ] teste de CLI com amostra sintética documentada como tal (degradação clara)
  - [ ] `forja tools:doctor` continua verde

---

## Handoffs entre agentes

T1 → T2 sequencial. Sem handoff de papel.
