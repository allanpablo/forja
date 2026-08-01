# Handoff — Sprint 9: extractors determinísticos

- **from**: Orchestrator
- **to**: Graph / Context / Governance
- **intent**: continuar a indexação verificável de fontes do projeto.
- **context**: o extractor GraphLoop agora cobre imports, links, exports,
  chamadas, `implements`, ADRs, tarefas Markdown, agentes de handoff, testes e
  dependências de manifests, sempre com evidência e checksum.
- **acceptance**: preservar idempotência, não criar arestas sem evidência e não
  tratar JSON inválido como sucesso de validação.
- **constraints**: extração é lexical/determinística; resolução completa de
  símbolos, commits e diffs não está incluída; nenhuma chamada de LLM.
- **return**: próxima sprint deve integrar indexação de workspace/Git e expor
  atualização incremental por capability, mantendo o Context Engine limitado ao
  contexto necessário.

## Evidências

- `docs/2x/SPRINT-9-DETERMINISTIC-EXTRACTORS-PLAN.md`;
- `memory/90-decisions/0066-graph-deterministic-extractors.md`;
- `test/graph.test.js`.
