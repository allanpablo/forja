# Tasks: Learning Loop — Registro de Incidentes + Sugestão por Similaridade

- **Spec**: ./spec.md
- **Plan**: ./plan.md
- **Status**: approved
- **Criado em**: 2026-09-01

---

## T1 — `scripts/incident.ts`: record/list/similar
- **Owner**: worker
- **Estimativa**: M
- **Depende de**: —
- **Paths**: `scripts/incident.ts`, `lib/core/registry.ts`
- **Done quando**:
  - [ ] `incident:record` grava nó `Incident` + evidência (`source: 'forja.cli'`) via `GraphLoop`,
        sem migration nova
  - [ ] `incident:list` lista mais recentes primeiro
  - [ ] `incident:similar` implementa o matching de D1, nunca aplica nada (AC-4)
  - [ ] `forja tools:doctor` continua verde

## T2 — prova sobre incidentes reais/sintéticos documentados
- **Owner**: worker
- **Estimativa**: P
- **Depende de**: T1
- **Paths**: `test/incident-cli.test.js` (novo)
- **Done quando**:
  - [ ] 3 incidentes registrados (2 parecidos, 1 diferente), `incident:similar` ordena
        corretamente
  - [ ] `incident:similar` sem nenhum incidente registrado devolve vazio, não erro (AC-5)

---

## Handoffs entre agentes

T1 → T2 sequencial. Sem handoff de papel.
