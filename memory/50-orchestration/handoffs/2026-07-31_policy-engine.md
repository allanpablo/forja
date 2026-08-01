# Handoff — policy engine

- **from**: worker
- **to**: runtime-engineer
- **intent**: implement
- **context**: `packages/policy/src/index.ts`; `packages/core/src/index.ts`; `packages/contracts/src/index.ts`; `memory/90-decisions/0037-forja-2-policy-engine-obrigatorio.md`; `docs/architecture/FORJA-2.0-IMPACT-FOUNDATION.md`
- **acceptance**: runtime deve consumir PolicyDecision; bloquear `DENY`/aprovação; impor limites de tokens, arquivos, tempo, retries e paralelismo; criar estado, checkpoint, pausa e retomada; retornar RuntimeRun auditável.
- **constraints**: domínio sem NestJS/Next/SQLite; não ignorar `ALLOW_WITH_LIMITS`; nenhuma execução crítica sem Policy Engine; persistência fica atrás de porta; manter CLI 1.x intacta.
- **return**: devolver estados, invariantes, testes de falha/retomada, evidências e próximo handoff.

## Resultado da etapa anterior

Policy Engine implementado com default deny, regras determinísticas, limites, aprovação para risco
crítico e ledger de aprovação em memória. Registry → Policy foi validado por teste de integração.
