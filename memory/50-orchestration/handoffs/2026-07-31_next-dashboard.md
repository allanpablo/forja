# Handoff — Distribuição Next.js inicial

- **from**: next-distribution-engineer
- **to**: control-plane-ui-engineer
- **intent**: implement
- **context**: `apps/dashboard/app/page.tsx`; `apps/dashboard/app/dashboard-client.tsx`; `apps/dashboard/app/globals.css`; `apps/dashboard/next.config.mjs`; ADR-0055; `apps/dashboard/src/index.ts`
- **acceptance**: dashboard Next compila em produção, carrega métricas/observações via REST, reage a SSE e não contém regra crítica ou acesso direto à persistência.
- **constraints**: manter Next em versão corrigida; não autorizar no cliente; não usar `audit fix --force`; preservar boundary do Control Plane.
- **return**: implementar autenticação local, TanStack Query, ações de aprovação/pausa/cancelamento, áreas de Sprints/Tasks/Agents/GraphLoop e testes de UI/contrato.

## Evidências

- `npm run types:check`: passou.
- `npm run dashboard:build`: passou com Next 15.5.9.
- `npm test`: pendente após esta unidade.
- `git diff --check`: pendente após esta unidade.

## Métricas de tokens

- consumo de LLM: não aplicável;
- página inicial: métricas e observações carregadas deterministicamente;
- eventos: atualização por SSE, sem reprocessamento de histórico no cliente.
