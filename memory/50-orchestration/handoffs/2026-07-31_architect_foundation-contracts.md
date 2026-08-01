# Handoff — foundation contracts

- **from**: architect
- **to**: worker
- **intent**: implement
- **context**: `docs/vision/FORJA-2.0-VISION.md`; `docs/architecture/FORJA-2.0-ARCHITECTURE.md`; `docs/architecture/FORJA-2.0-IMPACT-FOUNDATION.md`; `memory/90-decisions/0034-forja-2-core-e-contratos.md`; `memory/90-decisions/0035-forja-2-local-first-e-autonomia.md`; `packages/contracts/src/index.ts`
- **acceptance**: criar `packages/core` sem imports de framework; registrar capabilities versionadas; rejeitar input inválido antes do handler; retornar `ExecutionResult`; cobrir descoberta, descrição, alias e execução com testes determinísticos.
- **constraints**: manter TypeScript estrito; não alterar CLI 1.x; não usar `any`; não introduzir SQLite/Nest/MCP; usar apenas contratos existentes ou abrir ADR para mudança.
- **return**: devolver arquivos alterados, testes, evidências, riscos e próximo handoff em `memory/50-orchestration/handoffs/`.

## Resultado da etapa anterior

Visão, arquitetura, impacto e contratos foram criados. `npm run types:check` passa e `npm test`
passa com 196 testes. GraphLoop e memória consolidada 2.0 ainda não existem; atualização fica
explicitamente pendente da implementação desses módulos.
