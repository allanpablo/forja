# Handoff — Sprint 14: persistência oficial e restart

- **from:** persistence-composition-engineer
- **to:** chaos-and-security-engineer
- **intent:** continuar o fechamento 10/10 com falhas e recuperação
- **context:** `apps/server/src/main.ts`, `test/server-persistence.test.js`, Sprint 14,
  ADR-0071
- **acceptance:** duas composições oficiais compartilham SQLite; runtime e approval
  pendente são recuperados; contexto, grafo, eventos e observações permanecem
- **constraints:** stores em memória apenas para testes; adapter SQLite permanece fora
  do domínio; probe executa com loader Nest real
- **return:** adicionar processo morto, approval expirada, SQLite bloqueado,
  checkpoint corrompido, timeout e payload malicioso; registrar rollback e recuperação
- **evidence:** probe passou com run `awaiting_approval`, approval 1, contexto
  preservado, grafo 1 nó, eventos e observações persistidos
