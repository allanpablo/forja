# ADR-0034: Fundação 2.0 em contratos versionados e domínio independente

- **Status**: accepted
- **Data**: 2026-07-31
- **Autor(es)**: ForjaJS
- **Tags**: architecture, contracts, domain, migration

## Contexto

O ForjaJS 1.x é um CLI TypeScript com memória SQLite e adapters misturados à operação. A 2.0
precisa ser consumível por CLI, MCP, SDK, worker e NestJS sem duplicar regras ou contaminar o
domínio com frameworks.

## Decisão

Introduzir `packages/contracts` como fonte versionada dos contratos públicos e adotar a direção
interfaces → adapters → application → domain. A primeira entrega é aditiva; a compatibilidade
1.x continua roteada pelo CLI até cada capability possuir equivalente 2.0.

## Consequências

Contratos podem ser testados sem infraestrutura e adapters ficam substituíveis. O custo inicial
é manter versões, schemas e compatibilidade explícita.

## Rastreamento

- Implementação: `packages/contracts/`
- Arquitetura: `docs/architecture/FORJA-2.0-ARCHITECTURE.md`
- Visão: `docs/vision/FORJA-2.0-VISION.md`
