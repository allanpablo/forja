# Tasks: dev-token-assets-db

- **Spec**: ./spec.md
- **Plan**: ./plan.md
- **Status**: done
- **Criado em**: 2026-06-02

## T1 - Schema auxiliar de memoria
- **Owner**: Worker
- **Estimativa**: P
- **Depende de**: -
- **Paths**: `scripts/memory-schema.mjs`
- **Done quando**:
  - [x] cria `spec_summaries`
  - [x] cria `context_runs`
  - [x] cria `asset_catalog`

## T2 - Operacoes de contexto/token
- **Owner**: Worker
- **Estimativa**: M
- **Depende de**: T1
- **Paths**: `scripts/context-ops.mjs`, `package.json`
- **Done quando**:
  - [x] `context:budget` mede tokens
  - [x] `context:sprint` gera sprint pack
  - [x] `agent:brief` gera brief por papel/slug
  - [x] `catalog:assets` cataloga boilerplates/design-md
  - [x] `token:benchmark` esta exposto

## T3 - Melhorar boilerplates
- **Owner**: SDD Architect
- **Estimativa**: M
- **Depende de**: T2
- **Paths**: `boilerplates/**`
- **Done quando**:
  - [x] cada boilerplate tem manifesto padrao
  - [x] cada manifesto descreve stack, comandos, gates, tokens e casos de uso

## T4 - Melhorar design system
- **Owner**: SDD Architect
- **Estimativa**: M
- **Depende de**: T2
- **Paths**: `design-md/**`
- **Done quando**:
  - [x] referencias tem metadados normalizados por superficie
  - [x] tokens visuais recomendados ficam consultaveis pelo catalogo

## T5 - Integrar sync do banco
- **Owner**: Worker
- **Estimativa**: M
- **Depende de**: T1, T2
- **Paths**: `scripts/sync-universal-memory.js`
- **Done quando**:
  - [x] sync popula tabelas auxiliares sem comando separado
  - [x] schema continua aditivo e compativel

## Handoffs entre agentes
Use `npm run gsd:handoff -- implement dev-token-assets-db` para primeira tranche e `npm run gsd:handoff -- review dev-token-assets-db` antes de governanca.
