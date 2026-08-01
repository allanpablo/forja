# ADR-0039: Event Bus append-only e Scheduler determinístico local-first

- **Status**: accepted
- **Data**: 2026-07-31
- **Autor(es)**: ForjaJS
- **Tags**: events, scheduler, reliability, local-first

## Contexto

Execuções, tarefas, aprovações e mudanças do workspace precisam disparar trabalho sem perder
ordem, repetir efeitos de forma segura ou ocultar falhas de consumidores.

## Decisão

O Event Bus usa log append-only, sequência por aggregate, chave de idempotência, consumers com
retry limitado e dead-letter. O Scheduler suporta one-shot, cron UTC de cinco campos, condição e
evento, com cancelamento, chave de execução por slot/evento, retries e limite de concorrência.
As portas permitem substituir o armazenamento em memória por SQLite e o relógio por adapter sem
mover regra de domínio.

## Consequências

Falhas ficam observáveis e eventos duplicados não reexecutam efeitos concluídos. A implementação
em memória não sobrevive a processo; persistência, consumer offsets e recovery serão tratados em
`adapter-sqlite`/worker.

## Rastreamento

- Implementação: `packages/events/src/index.ts`, `packages/scheduler/src/index.ts`
- Testes: `test/events-scheduler.test.js`
- Relacionadas: ADR-0035, ADR-0038
