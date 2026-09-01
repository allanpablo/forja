# Tasks: `forja engineer` — compor recomendação de agente + incidentes parecidos

- **Spec**: ./spec.md
- **Plan**: ./plan.md
- **Status**: approved
- **Criado em**: 2026-09-01

---

## T1 — extrair matching de incidentes + compor em `forja engineer`
- **Owner**: worker
- **Estimativa**: M
- **Depende de**: —
- **Paths**: `scripts/incident.ts`, `scripts/engineer.ts`
- **Done quando**:
  - [ ] `rankIncidentsByQuery`/`incidentRecords` exportados, `incident:similar` inalterado em
        comportamento (testes existentes continuam verdes)
  - [ ] `forja engineer --role <role>` inclui agentes recomendados; sem `--role`, seção ausente
  - [ ] `forja engineer` sempre inclui incidentes parecidos (vazio, não erro, se nenhum)
  - [ ] `--json` estrutura as duas seções

## T2 — prova
- **Owner**: worker
- **Estimativa**: P
- **Depende de**: T1
- **Paths**: `test/engineer-cli.test.js`, `test/incident-cli.test.js` (verificação de não-regressão)
- **Done quando**:
  - [ ] teste com agente registrado + `--role` mostra a recomendação certa
  - [ ] teste com incidente registrado que casa com o objetivo aparece na seção
  - [ ] `test/incident-cli.test.js` continua 100% verde (prova do refactor D2)

---

## Handoffs entre agentes

T1 → T2 sequencial. Sem handoff de papel.
