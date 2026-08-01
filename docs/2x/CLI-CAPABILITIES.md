# CLI como adaptador do Capability Registry

Sprint 1 unifica os três comandos de prova abaixo com o registry executável. O comando legado
continua disponível como alias; a lógica é executada por um handler injetado no adaptador, e não
por uma implementação paralela no CLI.

| Comando legado | Capability | Input | Observação |
| --- | --- | --- | --- |
| `tools:doctor` | `system.doctor` | `{}` | diagnóstico local determinístico |
| `code:impact <symbol> [depth]` | `code.impact` | `{ symbol, depth? }` | depth entre 1 e 10 |
| `context:budget <target> [limitTokens]` | `context.budget` | `{ target, limitTokens? }` | limite positivo |
| `spec:check [feature]` | `spec.validate` | `{ feature? }` | valida uma spec ou todas |
| `sprint:status [project]` | `sprint.status` | `{ project? }` | consulta a sprint atual |
| `gsd:handoff <phase> <slug> [context]` | `handoff.create` | `{ phase, slug, context? }` | grava handoff local governado |

## Descoberta e execução

```bash
forja capabilities:list --json
forja capabilities:describe code.impact --json
forja capability:execute code.impact --input '{"symbol":"CapabilityRegistry","depth":2}' --json
```

Os três comandos legados também aceitam `--json` e retornam o mesmo `ExecutionResult` versionado:

```bash
forja tools:doctor --json
forja code:impact CapabilityRegistry 2 --json
forja context:budget docs/2x/SPRINT-1-CLI-CAPABILITY-PLAN.md 10000 --json
```

O envelope inclui `runId`, `correlationId`, `status`, `output`, `evidence` e erro normalizado
quando aplicável. Entrada inválida é rejeitada antes do handler; política é avaliada pelo
`CapabilityRegistry` antes da execução. Comandos ainda não migrados permanecem no dispatch
legado durante a migração progressiva.
