# ForjaJS 2.x — Auditoria de implementação

**Escopo:** baseline publicado `2.0.1`, checkout local em 2026-08-01.
**Objetivo:** distinguir código executável/testado de fundações isoladas antes da
Sprint 1 de unificação da CLI com o Capability Registry.

## Evidências consultadas

- `packages/contracts/src/index.ts`
- `packages/core/src/index.ts`
- `lib/core/registry.ts`
- `bin/forja.ts`
- `packages/mcp/src/index.ts`
- `packages/sdk/src/index.ts`
- `packages/adapter-nest/src/index.ts`
- `apps/server/src/main.ts`
- `scripts/tools-doctor.ts`
- `scripts/agent-harness.ts`
- `scripts/context-ops.ts`
- testes em `test/*registry*`, `test/mcp.test.js`, `test/sdk.test.js`,
  `test/adapter-nest.test.js` e `test/harness.test.js`.

## Matriz de implementação

| Componente | Existe | Integrado | Persistente | Testado | Produção |
| --- | ---: | ---: | ---: | ---: | ---: |
| Contratos versionados | sim | parcial | não aplicável | sim | parcial |
| `lib/core/registry.ts` — registry CLI | sim | sim, apenas CLI | auditoria JSONL | sim | sim |
| `CapabilityRegistry` | sim | CLI/server/MCP/runtime | não | sim | parcial |
| Adapter CLI → capability | sim | sim, 6 comandos | não | sim | parcial |
| ExecutionResult | sim | parcial, registry | não | sim | parcial |
| Policy Engine | sim | registry/runtime/MCP/server | approvals em SQLite no server | sim | parcial |
| Runtime Engine | sim | SQLite no server oficial; memória nos testes | runs, planos, resultados, estado e checkpoints em SQLite | sim | parcial |
| Sprint/Task/Handoff | sim | parcial | stores em memória/SQLite adapter separado | sim | parcial |
| Context Engine | sim | server/MCP/Runtime + fontes de memória/grafo | cache SQLite v5 | sim | parcial |
| GraphLoop | sim | MCP/server/Runtime/testes | SQLite v4; memória apenas em testes | sim | parcial |
| MCP | sim | tools/resources + registry dinâmico + stdio/server | auditoria MCP em SQLite no server | sim | parcial |
| SDK | sim | API REST esperada | remoto | sim | parcial |
| Sandbox | sim | isolada em testes | backend em memória/adapters | sim | parcial |
| Planner/Validator | sim | Runtime/testes | não aplicável | sim | parcial |
| Event Bus/Scheduler | sim | server/worker/testes | Event Bus no server usa SQLite; scheduler ainda separado | sim | parcial |
| Observabilidade/Control Plane | sim | server/dashboard | memória por padrão | sim | parcial |
| NestJS adapter/server | sim | server bootstrap | não | sim | parcial |
| Next.js dashboard | sim | consulta API/proxy | remoto | sim | parcial |

## Achados principais

1. O registry declarativo legado (`COMMANDS`) contém o comportamento público da
   CLI: domínio, descrição, script, argumentos e gates. Ele não produz
   `CapabilityDefinition` nem passa pelo `CapabilityRegistry`.
2. O `CapabilityRegistry` valida, autoriza e normaliza `ExecutionResult`, mas
   não conhece comandos legados e não possui um catálogo padrão registrado.
3. A Sprint 5 corrigiu a composição do server: `apps/server/src/main.ts` agora
   registra o mesmo catálogo de seis capabilities da CLI e inicializa approvals
   e auditoria MCP no SQLite.
4. MCP e SDK já possuem superfícies sobre capabilities, mas dependem de um
   registry preenchido pelo consumidor.
5. Os três comandos da Sprint 1 possuem handlers determinísticos existentes:
   `tools:doctor` em `scripts/tools-doctor.ts`, `code:impact` em
   `scripts/agent-harness.ts` e `context:budget` em `scripts/context-ops.ts`.
6. A auditoria transversal existente em `bin/forja.ts` registra comando, args,
   exit code e duração, mas não registra `runId`, `capabilityId` ou o envelope
   completo de `ExecutionResult`.
7. A Sprint 3 adicionou a porta `RuntimePersistence`, o adapter SQLite e a
   recuperação explícita por policy; approvals e execução distribuída continuam pendentes.
8. A Sprint 4 adicionou `forja_capability_describe`, ferramentas derivadas do registry e o
   transporte local `mcp:start`; a Sprint 5 completou o catálogo padrão do server.
9. A Sprint 5 passou o catálogo CLI, approvals e auditoria MCP para a composição oficial do
   server; approvals e auditoria MCP usam SQLite.
10. A Sprint 6 tornou o Event Bus restart-safe sobre `SqliteEventStore` e adicionou uma prova
    E2E determinística; GraphLoop persistente e sandbox Git worktree continuam pendentes.
11. A Sprint 7 extraiu `GraphStore`, adicionou `SqliteGraphStore` e ligou o mesmo grafo persistente
    ao MCP e à memória de execução; Context Engine e engines de contradição/agenda ainda não estão
    plenamente ligados ao store.
12. A Sprint 8 ligou `GraphContextSource` e `SqliteContextCache` ao bootstrap oficial; a relevância
    de grafo é lexical e determinística, enquanto trechos de arquivos e busca semântica continuam
    fora do escopo.
13. A Sprint 9 ampliou o extractor determinístico para símbolos, chamadas, ADRs, tarefas, handoffs,
    testes e manifests; resolução semântica completa, commits e diffs ainda requerem extractors
    específicos.
14. A Sprint 10 adicionou `GraphIndexer`, `GitGraphDocumentSource` e a capability `graph.sync`;
    a composição oficial usa o GraphLoop SQLite, mas poda de remoções e histórico de commits ainda
    estão pendentes.
15. A Sprint 11 expôs `graph.sync` no registry/CLI standalone e no MCP stdio, com métricas de
    documentos, nós, arestas, arquivos e duração; observações persistentes do Control Plane ainda
    são uma pendência distinta.

## Mapa inicial comando → capability

| Comando legado | Capability alvo | Prova Sprint 1 |
| --- | --- | ---: |
| `tools:doctor` | `system.doctor` | sim |
| `code:impact` | `code.impact` | sim |
| `context:budget` | `context.budget` | sim |
| `spec:new` | `spec.create` | próxima |
| `spec:check` | `spec.validate` | sim, Sprint 2 |
| `sprint:start` | `sprint.start` | próxima |
| `sprint:status` | `sprint.status` | sim, Sprint 2 |
| `gsd:handoff` | `handoff.create` | sim, Sprint 2 |
| `context:smart` | `context.build` | próxima |
| `memory:compress` | `memory.compact` | próxima |

O restante do mapa é mantido como backlog de migração; nesta sprint nenhum
comando não comprovado será apresentado como integrado.

## Hipóteses e informações ausentes

- A compatibilidade de saída textual dos três comandos deve ser preservada;
  `--json` adicionará o envelope estruturado sem remover o modo humano.
- Os handlers legados continuam sendo a fonte determinística de execução nesta
  sprint; a unificação elimina o registry paralelo, não reescreve os handlers.
- A persistência de approvals, eventos de runtime e execução distribuída permanece fora do
  escopo após a Sprint 3.
- O contrato atual não possui um campo específico para argumentos de CLI; o
  payload validado da capability carregará esses argumentos.

## Decisão de escopo

Implementar um adapter na aplicação CLI que registra três capabilities no
`CapabilityRegistry`, delega os handlers legados por uma porta injetada e usa
`PolicyEngine` antes da execução. `bin/forja.ts` continuará adaptando comandos
não migrados durante a transição, mas os três comandos de prova não terão lógica
duplicada de negócio.

## Riscos

- Alterar o dispatch pode mudar mensagens ou códigos de saída; testes de
  equivalência devem comparar modo textual e modo JSON.
- `code:impact` depende de `codegraph` e tem fallback manual; o adapter não pode
  transformar ausência de ferramenta em sucesso falso.
- `context:budget` grava uma medição no SQLite; a política deve declarar o
  efeito de banco, mesmo sendo uma operação determinística.
