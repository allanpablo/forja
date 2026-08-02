# Handoff — Sprint 12: autonomia real

- **from:** autonomy-integration-engineer
- **to:** mcp-and-recovery-engineer
- **intent:** continuar a prova de última milha do ForjaJS 2.x
- **context:** `scripts/demo-autonomy.ts`, `test/demo-autonomy.test.js`,
  `docs/2x/SPRINT-12-REAL-AUTONOMY-PLAN.md`, ADR-0069
- **acceptance:** demo cria fixture externa, usa worktree Git real, bloqueia escrita
  até aprovação, edita arquivo, executa npm test, valida, promove diff, persiste
  estado, atualiza GraphLoop e cria handoff
- **constraints:** sem LLM; sem mocks no caminho principal; escopo limitado ao
  arquivo `tests/math.test.js`; promoção somente após Validator `accepted`
- **return:** implementar Sprint 13 para transporte MCP stdio real e shutdown limpo;
  depois provar restart do servidor e recuperação de execução/approval/contexto
- **evidence:** `npm run demo:autonomy` retornou `accepted`, uma alteração promovida,
  18 nós e 14 arestas; teste automatizado repete e limpa a fixture
