# Sprint 11 — Graph sync na CLI, MCP e observabilidade

## Objetivo

Tornar `graph.sync` uma capability operável pela CLI standalone e pelo MCP
stdio, mantendo um único handler e registrando contagens, arquivos e duração.

## Escopo

- alias declarativo `graph:sync` no registry do core;
- `capabilities:list`, `capabilities:describe` e `capability:execute` com
  `graph.sync`;
- `mcp:start` descobrindo a ferramenta dinâmica pelo registry;
- composição local GraphLoop + SQLite + Git reutilizada pelos adaptadores;
- saída humana resumida e saída JSON estruturada;
- métricas `documents`, `indexed`, `skipped`, `nodes`, `edges`, `files` e
  `durationMs` no resultado e no registro de auditoria CLI.

## Critérios de aceite

1. `graph.sync` aparece em `forja capabilities:list --json`.
2. `forja graph:sync --json` indexa o repositório atual sem LLM.
3. Reexecução usa checksum e informa documentos ignorados.
4. MCP stdio deriva a ferramenta a partir do registry, sem lista duplicada.
5. Policy exige permissão `write` para a capability.
6. Falhas do Git retornam `ExecutionResult` falho.
7. Testes, typecheck, build e release gate passam.

## Evidência operacional

No workspace temporário da Sprint 11, a CLI descobriu `graph.sync` e a execução
indexou 867 documentos em 8,9s, retornando contagens estruturadas.

## Limites

- CLI não faz poda de arquivos removidos;
- observabilidade detalhada fica no envelope/auditoria CLI; persistência de
  observações do Control Plane para essa ação será consolidada em sprint futura.
