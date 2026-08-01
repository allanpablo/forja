# Handoff — Sprint 2: capabilities de processo CLI

- **from**: Orchestrator
- **to**: SDD Architect / Worker
- **intent**: continuar a migração dos comandos públicos para o Capability Registry e preparar a próxima fatia.
- **context**: as Sprints 1 e 2 conectaram seis comandos ao adapter CLI. O registry valida payload,
  aplica policy e normaliza o envelope antes de delegar aos handlers determinísticos existentes.
- **acceptance**: preservar os seis aliases migrados, adicionar testes para qualquer novo comando,
  atualizar `IMPLEMENTATION-AUDIT.md` e não iniciar runtime persistente sem plano/ADR próprio.
- **constraints**: manter os comandos não migrados no fallback legado; não integrar MCP, GraphLoop,
  sandbox ou autonomia nesta etapa; não salvar transcrição em handoff; não usar `any` novo.
- **return**: próxima sprint deve escolher entre migrar capabilities de contexto/memória ou iniciar
  a persistência do Runtime, após análise de impacto e contratos afetados.

## Entregas

- `spec:check` → `spec.validate`;
- `sprint:status` → `sprint.status`;
- `gsd:handoff` → `handoff.create`;
- schemas de `feature`, `project`, `phase`, `slug` e `context`;
- policy explícita para a escrita local de handoff;
- testes de sucesso, input inválido e equivalência de argumentos.

## Evidências

- `docs/2x/SPRINT-2-CLI-CAPABILITY-PLAN.md`;
- `docs/2x/IMPLEMENTATION-AUDIT.md`;
- `test/cli-capability-adapter.test.js`;
- `npm run types:check`;
- execução da suíte completa após a implementação.
