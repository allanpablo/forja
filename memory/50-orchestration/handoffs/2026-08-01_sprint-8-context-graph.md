# Handoff — Sprint 8: Context Engine e GraphLoop

- **from**: Orchestrator
- **to**: Runtime / Context / Governance
- **intent**: continuar a redução de contexto com fontes persistentes e evidência.
- **context**: GraphLoop expõe registros de relações relevantes; `GraphContextSource`
  os adapta ao Context Engine; `SqliteContextCache` persiste checksums; server
  compõe tudo no banco local e entrega o pacote ao planner do Runtime.
- **acceptance**: preservar referências, orçamento, cache e exclusão de conteúdo
  contradito/obsoleto; não usar LLM para ranking lexical; manter compatibilidade
  com fontes de memória existentes.
- **constraints**: conteúdo atual é relação compacta, não trecho integral de
  arquivo; `requireEvidence: false` é apenas a política de compatibilidade do
  runtime server; MCP e clientes podem exigir evidência.
- **return**: próxima sprint deve conectar extractors de arquivos/specs e medir
  `context unused`, repetição e cobertura de evidência em runs reais.

## Evidências

- `docs/2x/SPRINT-8-CONTEXT-GRAPH-PLAN.md`;
- `memory/90-decisions/0065-context-graph-source-cache.md`;
- `test/context.test.js`;
- `test/adapter-sqlite.test.js`.
