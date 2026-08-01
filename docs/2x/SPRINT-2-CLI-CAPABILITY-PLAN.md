# Sprint 2 — Expandir a migração CLI → Capability Registry

## Objetivo

Migrar três comandos de processo para o mesmo adapter da Sprint 1, cobrindo validação de specs,
consulta de sprint e registro de handoff.

## Escopo

- `spec:check` → `spec.validate`;
- `sprint:status` → `sprint.status`;
- `gsd:handoff` → `handoff.create`;
- schemas determinísticos e aliases legados;
- policy para a escrita auditável de handoff;
- testes de equivalência, validação e bloqueio de input;
- documentação e atualização do mapa de implementação.

Fora do escopo: persistência de runtime, MCP nativo, GraphLoop, sandbox e autonomia.

## Critérios de aceite

1. Os três IDs aparecem em `capabilities:list` e são descritos por ID ou alias.
2. Argumentos posicionais legados são convertidos para payloads validados.
3. `spec:check` e `sprint:status` permanecem operações de leitura.
4. `gsd:handoff` declara permissão/efeito de escrita e passa pelo Policy Engine.
5. Entrada inválida não chama o handler.
6. Toda execução produz `ExecutionResult` e evidência `forja.cli`.
7. A suíte determinística e o typecheck permanecem verdes.

## Impacto

Arquivos afetados: `apps/cli/src/index.ts`, testes do adapter, auditoria e documentação. O
dispatch legado permanece como fallback para comandos ainda não migrados.

## Hipóteses

- A saída textual dos scripts existentes permanece a fonte de compatibilidade.
- Handoff é uma operação de baixo risco quando limitado ao registro local e governado por policy.
- A persistência definitiva do ledger pertence à integração do Runtime, não a esta fatia.
