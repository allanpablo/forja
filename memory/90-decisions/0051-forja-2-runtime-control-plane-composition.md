# ADR-0051 — Runtime seguro no Control Plane

- **Status**: accepted
- **Data**: 2026-07-31
- **Contexto**: O backend precisava expor Runtime sem aceitar um executor vazio ou permitir que uma capability bypassasse Policy, budget e validação.
- **Decisão**: O bootstrap compõe `RuntimeEngine` com etapas de capability explícitas na requisição, planner determinístico, PolicyEngine com allowlist `read` em ambiente local, budget validado e validator independente que exige todos os resultados sucedidos com evidência.
- **Regras**:
  - Runtime exige ao menos uma etapa, objective, agent e TokenBudget válido;
  - categorias, arquivos, ambiente, approval e budget são transportados ao Registry;
  - ausência de capability ou Policy bloqueia/falha a execução;
  - conclusão só ocorre após validator independente;
  - cada operação de Control Plane gera Observation e evento SSE.
- **Alternativas rejeitadas**:
  - planner vazio: faria runs sem trabalho verificável;
  - permitir escrita por padrão: violaria autonomia supervisionada;
  - considerar handler bem-sucedido como conclusão: ignoraria validação e evidência.
- **Consequências**: O servidor local consegue executar fluxos read-only determinísticos. Capabilities de escrita exigirão regras/políticas explícitas e approval adequado.
- **Evidências**: `apps/server/src/main.ts`, `packages/runtime/src/index.ts`, `test/runtime.test.js`, smoke `runtime-control-plane-ok completed accepted 2`, `npm run types:check`, `npm run build`.
