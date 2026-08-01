# ADR-0038: Runtime controlado por estados, limites e validação independente

- **Status**: accepted
- **Data**: 2026-07-31
- **Autor(es)**: ForjaJS
- **Tags**: runtime, autonomy, checkpoint, validation

## Contexto

Um agente não pode ser considerado concluído apenas porque um handler terminou. Execuções longas
precisam ser pausáveis, limitadas, retomáveis e validadas por uma fonte independente.

## Decisão

`packages/runtime` coordena planner → capabilities autorizadas → checkpoint → validator. Cada run
possui estado explícito, orçamento, limites de passos/tokens/arquivos/tempo/retries, métricas,
erros e evidências. A implementação inicial é sequencial e limita concorrência a uma capability
por vez. `DENY` e aprovação pendente bloqueiam; falhas retryable podem repetir até o limite;
validação rejeitada nunca produz `completed`.

Planner, validator, checkpoint e memória são portas. O primeiro armazenamento é em memória; SQLite
será um adapter posterior.

## Rastreamento

- Implementação: `packages/runtime/src/index.ts`
- Testes: `test/runtime.test.js`
- Relacionadas: ADR-0035, ADR-0037
