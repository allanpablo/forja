# ADR-0057 — GraphLoop e approvals no dashboard por portas do Control Plane

- **Status**: accepted
- **Data**: 2026-08-01
- **Contexto**: A interface precisava tornar relações e aprovações operacionais sem reproduzir algoritmos do domínio nem criar decisões no cliente.
- **Decisão**: O adapter Nest expõe consulta de nós, impacto e listagem de approvals; o dashboard renderiza nós/status e impacto sob demanda, além de listar decisões pendentes/finais. GraphLoop continua no pacote de domínio e Policy continua no backend.
- **Regras**:
  - toda relação exibida vem da API e preserva status/evidência do GraphLoop;
  - impacto exige um ID de origem explícito;
  - approvals são somente leitura nesta fatia; decisão deve usar identidade/aprovador configurado;
  - nenhuma heurística de grafo é executada no React;
  - endpoints entram na allowlist do proxy, nunca em proxy genérico.
- **Alternativas rejeitadas**: importar GraphLoop para o browser; renderizar arestas inventadas; aprovar sem identidade explícita; consultar SQLite no dashboard.
- **Consequências**: A UI já permite inspeção operacional básica offline/remota. Visualização espacial avançada, evidências detalhadas e fluxo de aprovação autenticado continuam etapas posteriores.
- **Evidências**: `packages/adapter-nest/src/index.ts`, `packages/policy/src/index.ts`, `apps/dashboard/app/dashboard-client.tsx`, `apps/dashboard/app/api/forja/[...path]/route.ts`, 265 testes.
