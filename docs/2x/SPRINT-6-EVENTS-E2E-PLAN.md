# Sprint 6 — Eventos persistentes e prova operacional

## Objetivo

Conectar o Event Bus ao server oficial com log SQLite append-only e comprovar,
em um cenário determinístico, o fluxo supervisionado approval → sandbox →
runtime → validator → evento persistido.

## Escopo

- hidratação do Event Bus a partir do store ao iniciar;
- idempotência e sequência por aggregate após reinício;
- persistência de eventos publicados pelo Control Plane no SQLite do workspace;
- prova E2E sem provedor de LLM, usando capability e sandbox simuladas;
- teste de aprovação, retomada, validação e registro de `execution.completed`.

## Fora do escopo

- substituir o stream SSE em memória por broker externo;
- persistir subscriptions e dead letters entre processos;
- implementar o backend Git worktree real;
- integrar GraphLoop SQLite ou dashboard operacional.

## Tarefas verificáveis

1. Carregar eventos existentes antes de gerar sequência ou aceitar idempotency key.
2. Instanciar `EventBus(SqliteEventStore)` no bootstrap NestJS.
3. Encaminhar eventos do Control Plane para SSE e log durável.
4. Executar a fixture de teste falho com aprovação humana e sandbox isolada.
5. Validar aceitação independentemente do handler implementador.
6. Rodar testes, typecheck, build e release gate.

## Critérios de aceite

- duas instâncias do Event Bus sobre o mesmo SQLite preservam sequência e
  idempotência;
- server inicializa runtime, approvals, MCP audit e eventos no mesmo banco;
- a prova E2E termina somente após aprovação e validator `accepted`;
- a prova registra um evento `execution.completed` persistido;
- nenhum teste depende de LLM, rede ou estado externo;
- documentação e ADR registram limites conhecidos.

## Evidências esperadas

- `test/events-scheduler.test.js`;
- `test/autonomy-e2e.test.js`;
- `packages/events/src/index.ts`;
- `apps/server/src/main.ts`;
- saída de `npm test`, `tsc --noEmit`, `npm run build` e
  `npm run release:check`.

## Próxima dependência

A próxima sprint deve persistir o GraphLoop e ligar suas evidências ao mesmo
fluxo de execução, mantendo o Event Bus como trilha de integração.
