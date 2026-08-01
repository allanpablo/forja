# Handoff — Dashboard proxy, autenticação e estado remoto

- **from**: control-plane-ui-engineer
- **to**: graphloop-ui-release-auditor
- **intent**: implement
- **context**: `apps/dashboard/app/api/forja/[...path]/route.ts`; `apps/dashboard/app/providers.tsx`; `apps/dashboard/app/dashboard-client.tsx`; `packages/adapter-nest/src/index.ts`; `apps/server/src/main.ts`; ADR-0056
- **acceptance**: token fica server-side; proxy aplica allowlist; TanStack Query cacheia métricas/observações; SSE invalida snapshot; pausa/cancelamento delegam ao Control Plane; Bearer inválido é rejeitado.
- **constraints**: não expor `FORJA_AUTH_TOKEN`; não usar proxy genérico; não autorizar no cliente; manter Policy e persistência fora do dashboard.
- **return**: implementar GraphLoop visual, approvals e demais áreas operacionais; executar auditoria de segurança, packaging e release gates.

## Evidências

- `npm run types:check`: passou.
- `npm run build`: passou.
- `npm run dashboard:build`: passou com Next 15.5.9.
- `npm test -- --test-concurrency=1`: 265 testes passaram.
- `npm test` paralelo: instável em testes legados que alteram PATH/processos; investigar no harness antes do release.
- `git diff --check`: passou.

## Métricas de tokens

- consumo de LLM: não aplicável;
- dashboard usa cache remoto com `staleTime` de 5 segundos;
- SSE invalida a query sem reenviar histórico ao cliente.
