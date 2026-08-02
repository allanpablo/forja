# Sprint 14 — Composição oficial persistente e restart

## Objetivo

Provar que o backend Nest oficial compõe os adapters SQLite e recupera estado
operacional depois que a primeira composição é encerrada e uma segunda é criada.

## Critérios de aceite

- RuntimeRun e plano são recuperáveis;
- approval pendente permanece disponível;
- checkpoint/runtime state são lidos pelo novo processo;
- Context cache, GraphLoop e Event Bus preservam dados;
- Sprint/Task/Handoff e Observabilidade usam stores SQLite no bootstrap;
- build estrito e probe em processo separado passam.

## Evidência

`test/server-persistence.test.js` inicia `test/server-persistence-probe.mjs` com
`node --import tsx`; o probe cria duas composições oficiais contra o mesmo arquivo
SQLite e confirma run `awaiting_approval`, approval, contexto, grafo, eventos e
observações após o fechamento da primeira conexão.

## Risco conhecido

Eventos publicados pelo Control Plane são assíncronos; o lifecycle oficial deve
adicionar drain explícito antes de shutdown gracioso. O probe aguarda o flush para
não confundir essa fronteira com perda de dados.
