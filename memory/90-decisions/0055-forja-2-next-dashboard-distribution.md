# ADR-0055 — Dashboard Next.js como adaptador de distribuição

- **Status**: accepted
- **Data**: 2026-07-31
- **Contexto**: O ForjaJS precisa de uma interface oficial operacional sem deslocar autorização, execução ou GraphLoop para o cliente.
- **Decisão**: `apps/dashboard` usa Next.js 15.5.9, React 19.2 e App Router. A página consulta métricas/observações por REST, reage a SSE e mantém ações críticas fora do cliente, delegadas ao Control Plane boundary.
- **Regras**:
  - cliente não acessa SQLite nem conhece persistência;
  - cliente não decide Policy nem executa capability;
  - dados remotos são tratados como estado operacional, não como fonte de autorização;
  - `outputFileTracingRoot` aponta para a raiz do monorepo;
  - a versão do Next deve permanecer em linha corrigida de segurança.
- **Alternativas rejeitadas**: dashboard com regras próprias; polling como único canal; importação direta de adapters.
- **Consequências**: Existe uma distribuição visual compilável e offline quanto ao bundle. Autenticação real, TanStack Query, filtros avançados e GraphLoop visual continuam incrementos posteriores sobre o mesmo boundary.
- **Risco conhecido**: npm reportou vulnerabilidades altas transitivas no conjunto instalado; o release gate deve executar auditoria e não usar `audit fix --force` automaticamente.
- **Evidências**: `apps/dashboard/app/page.tsx`, `apps/dashboard/app/dashboard-client.tsx`, `apps/dashboard/next.config.mjs`, `npm run dashboard:build`.
