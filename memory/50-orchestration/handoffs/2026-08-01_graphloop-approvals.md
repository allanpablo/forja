# Handoff — GraphLoop e approvals no dashboard

- **from**: graphloop-ui-engineer
- **to**: release-security-auditor
- **intent**: review
- **context**: `packages/graph/src/index.ts`; `packages/adapter-nest/src/index.ts`; `packages/policy/src/index.ts`; `packages/observability/src/index.ts`; `apps/server/src/main.ts`; `apps/dashboard/app/dashboard-client.tsx`; ADR-0057
- **acceptance**: dashboard consulta nós/impacto e lista approvals por API; GraphLoop permanece no domínio; Policy/approval não são decididos no cliente; proxy mantém allowlist; typecheck/build/testes passam.
- **constraints**: não inventar arestas/evidências; não aprovar sem identidade; não liberar acesso direto a SQLite; manter execução crítica no Control Plane.
- **return**: implementar visualização avançada/evidências e fluxo de aprovação autenticado, depois executar auditoria de segurança, packaging e release.

## Evidências

- `npm run types:check`: passou.
- `npm run build`: passou.
- `npm run dashboard:build`: passou.
- `npm test -- --test-concurrency=1`: 265 testes passaram.
- `git diff --check`: passou.

## Métricas de tokens

- consumo de LLM: não aplicável;
- GraphLoop e impacto: consultas determinísticas;
- approvals: listagem estruturada, sem decisão automática.
