# Handoff — Evaluation Engine e Plugin SDK

- **from**: evals-plugin-engineer
- **to**: dashboard-worker-engineer
- **intent**: implement
- **context**: `packages/evals/src/index.ts`; `packages/plugin-sdk/src/index.ts`; `packages/contracts/src/index.ts`; ADR-0052; ADR-0053; `docs/architecture/FORJA-2.0-IMPACT-FOUNDATION.md`
- **acceptance**: `EvaluationEngine` produz relatório determinístico referenciado por observações; `PluginRegistry` valida manifesto, rejeita duplicidade e nega operações sem permissão; typecheck/build/testes focados passam.
- **constraints**: não usar LLM para métricas; não dar acesso direto a recursos do host; não tratar metadados de assinatura/migration/dashboard como execução autorizada; preservar contratos versionados.
- **return**: integrar avaliações e métricas no Control Plane/dashboard, preparar worker/scheduler para avaliação e avançar a validação final.

## Evidências

- `npm run types:check`: passou.
- `npm run build`: passou.
- `node --import tsx --test test/evals.test.js test/plugin-sdk.test.js`: 2 arquivos, 5 testes, passou.
- `git diff --check`: pendente nesta unidade.

## Métricas de tokens

- consumo de LLM: não aplicável; avaliação e autorização são determinísticas;
- orçamento de execução: não aplicável; unidade sem execução de agente;
- observações consumidas pelos testes: 3 na avaliação principal.
