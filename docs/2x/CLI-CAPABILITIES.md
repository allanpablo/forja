# CLI como adaptador do Capability Registry

O CLI unifica os comandos abaixo com o registry executável. O comando legado continua disponível
como alias; a lógica roda por um handler injetado no adaptador, não por uma implementação
paralela. O mapeamento argv↔payload é **declarativo** (`spec.params` em `apps/cli/src/index.ts`,
`parseArgv`/`argvFor` em `apps/cli/src/params.ts`); um teste de round-trip força os dois sentidos
a fecharem (SPEC-046, [ADR-0083](../../memory/90-decisions/0083-mcp-cobertura-declarativa.md)).

| Comando legado | Capability | Input | Observação |
| --- | --- | --- | --- |
| `tools:doctor` | `system.doctor` | `{}` | diagnóstico local determinístico |
| `code:impact <symbol> [depth]` | `code.impact` | `{ symbol, depth? }` | depth entre 1 e 10 |
| `context:budget <target> [limitTokens]` | `context.budget` | `{ target, limitTokens? }` | limite positivo |
| `spec:check [feature]` | `spec.validate` | `{ feature? }` | valida uma spec ou todas |
| `sprint:status [project]` | `sprint.status` | `{ project? }` | consulta a sprint atual |
| `gsd:handoff <phase> <slug> [context]` | `handoff.create` | `{ phase, slug, context? }` | grava handoff local governado |
| `spec:new <slug>` | `spec.create` | `{ slug }` | escreve `specs/<slug>/spec.md` |
| `spec:plan <slug>` | `spec.plan` | `{ slug }` | escreve `plan.md` |
| `spec:tasks <slug>` | `spec.tasks` | `{ slug }` | escreve `tasks.md` |
| `code:context <domain> [--code]` | `code.context` | `{ domain?, code? }` | pacote de contexto mínimo |
| `query:universal <query>` | `memory.query` | `{ query }` | busca FTS5 na memória universal |
| `engineer "<obj>" [--ref r] [--role x]` | `engineering.facade` | `{ objective, ref?, role? }` | façade de engenharia |
| `risk:assess [ref]` | `risk.assess` | `{ ref? }` | score de risco 0-100 |
| `orchestrate:status <slug>` | `orchestrate.status` | `{ slug }` | estado da corrida |
| `orchestrate:advance <slug>` | `orchestrate.advance` | `{ slug }` | roda o gate da etapa (write) |
| `drift:check [--domain d]` | `drift.check` | `{ domain? }` | reindexa + sinaliza drift |
| `status` | `forja.status` | `{}` | retrato do estado |
| `next` | `forja.next` | `{}` | próxima ação recomendada |

**Fora da cobertura**, por desenho ([ADR-0083](../../memory/90-decisions/0083-mcp-cobertura-declarativa.md)):
`orchestrate` (start), `llm:*` (contrato de privacidade próprio, ADR-0081),
`project:new`/`sprint:start`/`sprint:complete`/`workspace:init`/`setup` (mutação fora do fluxo
SDD), `memory:*` de escrita, `architecture:approve` (governança).

## Descoberta e execução

```bash
forja capabilities:list --json
forja capabilities:describe code.impact --json
forja capability:execute code.impact --input '{"symbol":"CapabilityRegistry","depth":2}' --json
```

Os comandos-capability também aceitam `--json` no CLI. Desde SPEC-046, essa saída segue o
**contrato de saída** ([ADR-0082](../../memory/90-decisions/0082-contrato-saida-cli.md),
[`docs/contrato-saida-cli.md`](../contrato-saida-cli.md)) — não o `ExecutionResult` cru:

```bash
forja spec:check pagamentos-pix --json   # → {"status":"ok"|"rejected"|"error", ...}
forja tools:doctor --json
```

O `stdout` do comando-filho, quando é um objeto JSON, é fundido no resultado (flat); senão vem
em `raw`. `stderr` vai para o stderr. Exit code segue o contrato (0/1/2).

O **consumo via MCP** (`forja mcp:start` → `tools/call`) continua recebendo o `ExecutionResult`
versionado (`runId`, `correlationId`, `status`, `output`, `evidence`, erro normalizado) — o MCP
tem o próprio contrato de protocolo. Entrada inválida é rejeitada antes do handler (`validateInput`,
derivado de `params` quando não há checagem extra); a política é avaliada pelo `CapabilityRegistry`
antes da execução.
