# ADR-0056 — Proxy server-side, autenticação local e cache remoto do dashboard

- **Status**: accepted
- **Data**: 2026-08-01
- **Contexto**: O dashboard precisava consumir o backend local sem expor segredo no bundle, duplicar autorização ou refazer consultas a cada renderização.
- **Decisão**: `apps/dashboard` usa Route Handler server-side com allowlist de recursos, encaminha `FORJA_AUTH_TOKEN` somente ao backend e usa TanStack Query no cliente para cache/invalidação. SSE invalida a query; não transporta credenciais.
- **Regras**:
  - somente métricas, observações, eventos e transições de execução são encaminhados;
  - rotas fora da allowlist retornam 403;
  - token nunca usa prefixo `NEXT_PUBLIC_`;
  - backend valida Bearer com comparação de tamanho e `timingSafeEqual`;
  - cliente não decide Policy e não acessa SQLite;
  - pausa/cancelamento continuam comandos do Control Plane.
- **Alternativas rejeitadas**: token público no bundle; proxy genérico para qualquer URL; autorização no React; polling sem invalidação por evento.
- **Consequências**: Desenvolvimento local continua simples com `FORJA_API_URL` e `FORJA_AUTH_TOKEN`; autenticação sem token permanece compatibilidade de ambiente local, e implantação deve definir o token.
- **Evidências**: `apps/dashboard/app/api/forja/[...path]/route.ts`, `apps/dashboard/app/providers.tsx`, `apps/dashboard/app/dashboard-client.tsx`, `packages/adapter-nest/src/index.ts`, `apps/server/src/main.ts`, 265 testes.
