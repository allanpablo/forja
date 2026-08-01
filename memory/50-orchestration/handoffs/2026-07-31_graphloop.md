# Handoff — GraphLoop

- **from**: graph-engineer
- **to**: planner-validator
- **intent**: implement
- **context**: `packages/graph/src/index.ts`; `packages/context/src/index.ts`; `packages/contracts/src/index.ts`; `memory/90-decisions/0041-forja-2-graphloop-separado-codegraph.md`; `docs/architecture/FORJA-2.0-IMPACT-FOUNDATION.md`
- **acceptance**: Planner consulta GraphLoop e Context Engine, cria etapas pequenas com dependências, risco, orçamento e critérios objetivos; Validator verifica build, testes, lint, typecheck, escopo, critérios, contradições e segurança básica; resultado tem status e evidências.
- **constraints**: domínio sem NestJS/Next/SQLite; não atravessar arestas sem evidência; não tratar hipótese como fato; determinismo antes de LLM; manter CodeGraph como adapter/fonte opcional.
- **return**: devolver Planner/Validator, testes de falsa conclusão e próximo handoff para Sprint/Task/Handoff.

## Evidências

- `npm run types:check`: passou.
- `node test/graph.test.js`: 5 testes passaram.
- Cenários: endpoints/evidências obrigatórios, path, impacto, validade temporal, contradição,
  agenda, sync incremental e imports/links determinísticos.
