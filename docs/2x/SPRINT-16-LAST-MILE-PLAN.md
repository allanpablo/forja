# Sprint 16 — Última milha verificável

## Objetivo

Fechar três lacunas objetivas da avaliação 10/10 sem criar novos módulos: rollback explícito do sandbox, benchmark reproduzível de contexto e plugins oficiais permissionados.

## Escopo

- `promoted → rolled_back` no contrato e no `SandboxEngine`;
- reversão de patch real no `GitWorktreeBackend`;
- benchmark JSON determinístico em `npm run benchmark:context`;
- manifests oficiais `@forja/plugin-github` e `@forja/plugin-docker`;
- testes de contrato, rollback, benchmark e isolamento de permissões.

## Critérios de aceite

- rollback rejeita sessão que não foi promovida;
- Git recebe o patch reverso antes da limpeza da worktree;
- benchmark mede baseline, contexto selecionado, checksum, cache hit e economia;
- plugins são descobertos pelo `PluginRegistry` e não acessam serviços sem permissão;
- `npm test -- --test-concurrency=1`, build e `git diff --check` passam.

## Fora do escopo

Integrações de rede com GitHub, execução de Docker e rollback automático de qualquer comando externo. Esses handlers dependem de adapters do host e continuam governados pelo Policy Engine.
