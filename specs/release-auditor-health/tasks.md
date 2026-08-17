# Tasks: release-auditor-health

- **Spec**: ./spec.md
- **Plan**: ./plan.md
- **Status**: done
- **Criado em**: 2026-08-17

> Decomposição executável. A sequência preserva o contrato antes de atualizar a documentação.

---

## T1 — Fixar o contrato do Release Auditor

- **Owner**: Worker
- **Estimativa**: P
- **Depende de**: —
- **Paths**: `test/release-auditor.test.js`
- **Done quando**:
  - [x] O teste lê `.claude/agents/release-auditor.md` como contrato operacional.
  - [x] Reprova se `npm run tools:doctor` estiver ausente ou depois de
        `npm run release:check -- --publish` (AC-1, AC-6).
  - [x] Reprova se o gate do tarball perder `--publish` (AC-4, AC-6).
  - [x] Reprova se o procedimento autorizar ou executar `npm publish` (AC-5).
  - [x] Não compara o prompt inteiro nem fica acoplado a texto editorial fora desses invariantes.

## T2 — Migrar o procedimento do agente

- **Owner**: Worker
- **Estimativa**: P
- **Depende de**: T1
- **Paths**: `.claude/agents/release-auditor.md`
- **Done quando**:
  - [x] O procedimento executa `npm run tools:doctor` antes do gate do tarball (AC-1).
  - [x] Falha crítica do doctor interrompe a auditoria e produz parecer reprovado com o `fix` do
        check; avisos são lidos e relatados sem serem promovidos a falha (AC-2).
  - [x] `npm run release:check -- --publish` permanece obrigatório (AC-4).
  - [x] Não há probe, heurística de saúde ou lista duplicada de checks no prompt (AC-3).
  - [x] A regra de nunca executar `npm publish` permanece explícita (AC-5).

## T3 — Alinhar a topologia e a sprint

- **Owner**: Worker
- **Estimativa**: P
- **Depende de**: T2
- **Paths**: `AGENTS.md`, `memory/40-delivery/current-sprint.md`
- **Done quando**:
  - [x] A descrição canônica do Release Auditor cita os dois gates, na ordem correta, e mantém a
        publicação como ato humano (AC-5).
  - [x] O candidato obsoleto de migração do Release Auditor sai de "Próximos candidatos" e a
        SPEC-022 aparece como item da sprint.
  - [x] A informação de que `tools:doctor` ainda não roda no CI é removida, pois `.github/workflows/ci.yml`
        já executa o gate.

## T4 — Validação e handoff de governança

- **Owner**: Governance
- **Estimativa**: P
- **Depende de**: T1, T2, T3
- **Paths**: `specs/release-auditor-health/spec.md`, `specs/release-auditor-health/tasks.md`
- **Done quando**:
  - [x] Teste direcionado do Release Auditor passa.
  - [x] `npm run types:check`, `npm run project:check`, `npm run tools:doctor` e
        `npm run spec:check -- release-auditor-health` passam.
  - [x] AC-1 a AC-6 são marcados somente após evidência verificável.
  - [x] Handoff `review` é registrado; Governance emite parecer antes de concluir a spec.

---

## Handoffs entre agentes

Após aprovação destas tasks, registrar `npm run gsd:handoff -- implement release-auditor-health`.
Ao concluir T1-T3, registrar `npm run gsd:handoff -- review release-auditor-health` para Governance.
