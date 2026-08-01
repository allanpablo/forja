# ADR-0052 — Evaluation Engine determinístico sobre observações

- **Status**: accepted
- **Data**: 2026-07-31
- **Contexto**: Métricas de qualidade e custo não podem depender de declaração do agente nem de LLM.
- **Decisão**: `@forja/evals` recebe `ObservationStore` ou uma coleção explícita e produz `EvaluationReport` versionado. Sucesso, retrabalho/cache, tokens por task, etapas sem atividade, ausência de evidência, rollback e uso de contexto são calculados por regras determinísticas.
- **Regras**:
  - hash de entrada repetido conta como repetição/cache hit observável;
  - tokens por task usam tarefas distintas presentes nas observações;
  - ausência simultânea de `contextRefs` e `inputHash` é sinalizada como afirmação sem evidência;
  - rollback é identificado por `errorCode=ROLLBACK` e não inferido de texto livre;
  - relatório mantém IDs das observações como evidência.
- **Alternativas rejeitadas**: LLM para classificar sucesso; custo calculado sem observação; relatório sem referências auditáveis.
- **Consequências**: Resultados são reproduzíveis e offline. Métricas que exigirem semântica adicional devem ganhar campo contratual explícito, não heurística silenciosa.
- **Evidências**: `packages/evals/src/index.ts`, `packages/contracts/src/index.ts`, `test/evals.test.js`, `npm run types:check`, `npm run build`.
