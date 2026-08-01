# Handoff — Sprint 1: CLI e Capability Registry

- **from**: Orchestrator
- **to**: SDD Architect / Worker
- **intent**: continuar a migração progressiva dos comandos públicos para o Capability Registry.
- **context**: a auditoria encontrou dois registries: o declarativo legado em
  `lib/core/registry.ts` e o registry executável em `packages/core`. A ponte foi implementada em
  `apps/cli/src/index.ts` para três comandos de prova.
- **acceptance**: manter `npm run types:check`, testes da suíte e `tools:doctor` sem falha crítica;
  adicionar a próxima capability com schema, alias, policy, evidência, `ExecutionResult` e teste
  de equivalência antes de alterar o dispatch legado.
- **constraints**: não integrar MCP, GraphLoop, runtime persistente ou autonomia nesta sprint;
  não duplicar handler; preservar compatibilidade dos comandos não migrados; evitar mudanças
  destrutivas e manter contratos versionados.
- **return**: entregar mapa atualizado comando→capability, testes determinísticos, documentação,
  ADR se a decisão alterar fronteiras e relatório de auditoria atualizado.

## Trabalho concluído

- `tools:doctor` → `system.doctor`;
- `code:impact` → `code.impact`;
- `context:budget` → `context.budget`;
- descoberta por `capabilities:list` e `capabilities:describe`;
- execução por `capability:execute`;
- validação antes do handler, policy gate, evidência `forja.cli` e normalização de exit code;
- audit record inclui `capabilityId`, `runId`, `correlationId`, status e duração.

## Evidências

- `docs/2x/IMPLEMENTATION-AUDIT.md`;
- `docs/2x/SPRINT-1-CLI-CAPABILITY-PLAN.md`;
- `docs/2x/CLI-CAPABILITIES.md`;
- `test/cli-capability-adapter.test.js`;
- execução real dos três comandos com workspace temporário em 2026-08-01.

## Bloqueios e ressalvas

- CodeGraph não inicializado no workspace usado na prova; `code:impact` preservou o comportamento
  legado e terminou com saída zero, mas registrou a mensagem diagnóstica no envelope.
- `tools:doctor` continua reportando apenas avisos conhecidos sobre workspace/memória e ferramentas
  opcionais ausentes; não há falha crítica após a integração.
