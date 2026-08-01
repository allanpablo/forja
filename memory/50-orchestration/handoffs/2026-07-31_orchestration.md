# Handoff — orchestration engine

- **from**: orchestration-engineer
- **to**: sandbox-adapter-engineer
- **intent**: implement
- **context**: `packages/orchestration/src/index.ts`; `packages/contracts/src/index.ts`; `memory/90-decisions/0043-forja-2-orchestration-entities.md`; `docs/architecture/FORJA-2.0-IMPACT-FOUNDATION.md`
- **acceptance**: Sprint, Task e Handoff usam persistência por porta; dependências e retomada funcionam; conclusões exigem validator aceito; handoff incompleto é rejeitado e compactado; registros do GraphLoop recebem evidências.
- **constraints**: domínio sem NestJS/Next/SQLite; não usar transcrição completa; não permitir conclusão declarativa do executor; manter contratos versionados e trilha auditável.
- **return**: implementar `packages/sandbox` e adapters iniciais por portas, com fluxo create → prepare → execute → validate → diff → promote/reject → destroy e testes de isolamento/limpeza.

## Evidências

- `npm run types:check`: passou.
- `node --test test/orchestration.test.js`: 1 arquivo, 3 cenários, passou.
- `git diff --check`: passou.

## Métricas de tokens

- orçamento explícito desta unidade: 150 tokens de entrada e 50 de saída nos fixtures de teste;
- consumo de LLM: não aplicável; implementação e validação foram determinísticas;
- cache de contexto: não aplicável nesta unidade.
