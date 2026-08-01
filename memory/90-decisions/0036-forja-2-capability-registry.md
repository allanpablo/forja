# ADR-0036: Capability Registry como núcleo executável

- **Status**: accepted
- **Data**: 2026-07-31
- **Autor(es)**: ForjaJS
- **Tags**: capabilities, contracts, runtime, architecture

## Contexto

CLI, MCP, SDK, API e Runtime precisam descobrir e executar a mesma operação sem duplicar regras.
Uma lista de comandos não oferece schema, risco, permissões, idempotência ou resultado auditável.

## Decisão

`packages/core` mantém um registry em memória como núcleo inicial. Cada registro possui definição
versionada, aliases, validadores de entrada/saída e handler. A entrada é validada antes da
autorização e do handler; toda execução retorna `ExecutionResult`. Policy é uma porta injetada e
não uma implementação dentro do registry.

## Consequências

Interfaces externas podem ser adaptadores finos e testes não precisam de banco ou framework. A
persistência do registry, schemas especializados e Policy Engine completo ficam para fases
posteriores.

## Rastreamento

- Implementação: `packages/core/src/index.ts`
- Testes: `test/capability-registry.test.js`
- Arquitetura: `docs/architecture/FORJA-2.0-ARCHITECTURE.md`
