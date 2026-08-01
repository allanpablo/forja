# ADR-0054 — Worker e dashboard como adaptadores do Control Plane

- **Status**: accepted
- **Data**: 2026-07-31
- **Contexto**: O processamento assíncrono e a interface operacional precisam consumir o núcleo sem duplicar suas regras.
- **Decisão**: `apps/worker` compõe Event Bus, Scheduler, Observability e Evaluation Engine. `apps/dashboard` expõe um view model de snapshot e ações delegadas ao `ControlPlanePort`; a futura casca Next/React consumirá esse view model por transporte remoto.
- **Regras**:
  - worker não executa capabilities diretamente nem bypassa Policy;
  - dashboard não autoriza, executa agente ou calcula GraphLoop;
  - ações críticas são delegadas a portas do Control Plane;
  - ausência de serviço é erro explícito;
  - a camada atual permanece compilável offline sem instalar framework visual prematuramente.
- **Alternativas rejeitadas**: regra de negócio dentro de componentes React; worker com executor próprio; dashboard chamando SQLite diretamente.
- **Consequências**: A fronteira operacional pode ser testada sem navegador. Next/React, TanStack Query e SSE real serão ligados na etapa de distribuição visual, sem mudar o domínio.
- **Evidências**: `apps/worker/src/main.ts`, `apps/dashboard/src/index.ts`, `test/dashboard-worker.test.js`, `npm run types:check`, `npm run build`.
