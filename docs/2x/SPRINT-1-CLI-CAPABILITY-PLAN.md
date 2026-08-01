# Sprint 1 — Unificar CLI e Capability Registry

## Objetivo

Fazer três comandos legados passarem pelo mesmo registry, validação, policy e
envelope `ExecutionResult`, preservando a saída humana existente.

## Escopo

Incluído:

- adapter CLI;
- mapa comando → capability para o catálogo inicial;
- schemas determinísticos de entrada;
- `system.doctor`, `code.impact`, `context.budget`;
- `capabilities:list`, `capabilities:describe` e
  `capability:execute` em JSON;
- correlation ID e auditoria do resultado;
- testes de equivalência e rejeição de entrada.

Excluído:

- persistência do Runtime;
- MCP nativo;
- GraphLoop SQLite;
- sandbox/autonomia ponta a ponta;
- migração dos demais comandos.

## Impacto

Arquivos esperados: `apps/cli/`, `bin/forja.ts`, contratos/testes e
documentação. O domínio em `packages/core` permanece independente de processo,
CLI e framework.

## Critérios de aceite

1. Os três comandos são descobertos por capability ID e alias.
2. `forja capabilities:list --json` retorna definições versionadas.
3. `forja capabilities:describe code.impact --json` retorna o contrato.
4. Entradas inválidas são recusadas antes do handler.
5. `forja capability:execute code.impact --input '{...}' --json` retorna
   `ExecutionResult` com `runId`, `correlationId`, status e evidência.
6. O modo textual dos três comandos preserva o comportamento legado.
7. Policy negada não chama o handler.
8. O gate de testes determinísticos passa sem alterar comandos fora do escopo.

## Status de execução — 2026-08-01

Concluído para os três comandos de prova. O adapter está em `apps/cli/src/index.ts`, o dispatch
integrado está em `bin/forja.ts` e os testes estão em `test/cli-capability-adapter.test.js`.
`tools:doctor`, `context:budget` e `code:impact` foram executados com `--json` em workspace
temporário; os envelopes observados continham `runId`, `correlationId`, status, payload e
evidência. Os demais comandos permanecem fora do escopo desta sprint.
