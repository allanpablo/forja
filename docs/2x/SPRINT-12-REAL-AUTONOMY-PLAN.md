# Sprint 12 — Prova de autonomia supervisionada real

## Objetivo

Substituir a prova E2E simulada por uma demonstração repetível que usa fixture externa,
Git worktree, arquivo real, teste real, aprovação persistida, promoção real e estado
auditável em SQLite.

## Escopo

- `npm run demo:autonomy`;
- agente simulado determinístico, sem provedor LLM;
- Context Engine e GraphLoop antes do plano;
- Policy Engine e `ApprovalLedger` antes da escrita;
- `GitWorktreeBackend` no caminho principal;
- Validator independente antes da promoção;
- Sprint, Task, Handoff, Event Bus e auditoria persistidos.

## Critérios de aceite

- fixture é criada fora do repositório do framework;
- teste inicia falhando e termina passando após edição na worktree;
- workspace principal da fixture só muda na promoção explícita;
- aprovação, run, checkpoint, sandbox, evento e handoff sobrevivem no SQLite;
- GraphLoop recebe evidências e relações da execução;
- Validator retorna `accepted` antes de `promote`;
- teste automatizado repete o fluxo e limpa seus artefatos temporários.

## Fora do escopo

MCP stdio real, composição de servidor após restart abrupto, rollback automatizado,
contradições avançadas, plugins oficiais e benchmark comparativo de tokens. São as
próximas sprints de fechamento 10/10.

## Evidências

- `scripts/demo-autonomy.ts`;
- `test/demo-autonomy.test.js`;
- `npm run demo:autonomy`;
- saída observada: validação `accepted`, uma alteração promovida, 18 nós e 14 arestas.
