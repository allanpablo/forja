# ADR-0042: Planner determinístico e Validator independente

- **Status**: accepted
- **Data**: 2026-07-31
- **Autor(es)**: ForjaJS
- **Tags**: planner, validation, evidence, governance

## Contexto

O agente que implementa uma tarefa não pode ser a única fonte de plano ou de veredito. O Forja
precisa transformar objetivos em etapas pequenas e impedir conclusão baseada apenas em declaração
de sucesso.

## Decisão

O Planner cria etapas determinísticas com critérios, arquivos permitidos, dependências, risco,
evidências e orçamento dividido. O Validator recebe o plano e resultados externos de build, testes,
lint e typecheck, além de critérios, escopo, contradições, blockers e achados de segurança. Ele
retorna `accepted`, `rejected`, `inconclusive` ou `blocked`; checks ausentes produzem `inconclusive`
e falhas não podem produzir `accepted`.

Planner e Validator não executam comandos nem importam frameworks. Adapters fornecem os resultados
observáveis.

## Rastreamento

- Implementação: `packages/planner/src/index.ts`, `packages/validator/src/index.ts`
- Testes: `test/planner-validator.test.js`
- Relacionadas: ADR-0038, ADR-0041
