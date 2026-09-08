# Tasks: mcp-cobertura-nucleo

- **Spec**: ./spec.md
- **Plan**: ./plan.md
- **Status**: approved
- **Criado em**: 2026-09-08

> Decomposição executável. Cada task tem dono, critério de done e paths.

Grafo de dependência:

```
T1 ─┐
T2 ─ T3 ─ T4 ─┬─ T6 ─┐
         └── T5 ──┬───┤
                  ├─ T7
                  └─ T8
todas ────────────────► T9
```

Ordem: T2 → T3 (refatora os 6, sem novos) → T4 (adiciona 13) e T5 (contrato de saída) em
paralelo → T6/T7/T8 → T9.

---

## T1 — ADR-0083
- **Owner**: SDD Architect · **Est**: P · **Depende de**: —
- **Paths**: `memory/90-decisions/0083-mcp-cobertura-declarativa.md`
- **Escopo**: registrar (a) o arg mapping declarativo (`params`, `parseArgv`/`argvFor` inversos,
  round-trip como contrato); (b) o **critério** do que vira capability nesta rodada e a lista de
  fora com a razão (plan §D5); (c) o mapa **envelope→contrato de saída**: `succeeded`+exit0→`ok`,
  `succeeded`+exit2→`rejected`, `failed`/exit1→`error`; regra do `merge(stdout)`/`raw`.
- **Done**:
  - [ ] ADR existe; `forja tools:doctor` → `adr-refs` verde (79 ADRs)

## T2 — `apps/cli/src/params.ts`
- **Owner**: Worker · **Est**: M · **Depende de**: —
- **Paths**: `apps/cli/src/params.ts` (novo), `test/cli-params.test.js` (novo, parte)
- **Escopo**: `CapabilityParam` (kinds `positional` | `flag` | `flag-value` | `rest`),
  `parseArgv(params, argv): InputRecord`, `argvFor(params, input): string[]` (inversos),
  `makeValidator(params)` (required presente + tipo `string`/`int`). Puros, sem I/O.
- **Done**:
  - [ ] `tsc --noEmit` verde
  - [ ] testes unitários: `argvFor(params, parseArgv(params, argv))` reproduz `argv` para cada kind
        (positional obrigatório/opcional, flag booleana, flag-value, rest); `makeValidator` rejeita
        required ausente e tipo errado

## T3 — Refatorar os 6 capability specs atuais para `params`
- **Owner**: Worker · **Est**: M · **Depende de**: T2
- **Paths**: `apps/cli/src/index.ts`
- **Escopo**: `CliCapabilitySpec` ganha `params`. Adicionar `params` aos 6
  (`tools:doctor` → `[]`; `code:impact` → `[positional symbol req, flag-value --depth int]`;
  `context:budget` → `[positional target req, flag-value --limit-tokens int]`;
  `spec:check` → `[positional feature]`; `sprint:status` → `[positional project]`;
  `gsd:handoff` → `[positional phase req, positional slug req, rest context]`).
  `toArgs` = `argvFor(spec.params)`. `parseLegacyCommandInput` → `parseArgv(spec.params, argv)`
  (o if/else por comando some; `graph:sync` continua o único special-case, sem `command`).
  `validateInput` de cada um passa a chamar `makeValidator(params)` e manter só a checagem extra
  (range de `depth`, `limitTokens`, enum de `phase`).
- **Done**:
  - [ ] `parseLegacyCommandInput` sem nenhum `if (command === …)` além de `graph:sync`
  - [ ] round-trip verde para os 6 (T6 formaliza; aqui, checagem manual)
  - [ ] `node --test test/*.test.js` — testes MCP/capability existentes **verdes sem alteração** (AC-9)

## T4 — Adicionar os 13 capability specs novos
- **Owner**: Worker · **Est**: G · **Depende de**: T3
- **Paths**: `apps/cli/src/index.ts`
- **Escopo**: adicionar a `CLI_CAPABILITY_SPECS` (ids e params no plan §D5/§D6):
  `spec.create` (`spec:new`, `[positional slug req]`, `write`), `spec.plan`, `spec.tasks`
  (idem), `context.smart` (`[flag-value --mode, flag-value --domain]`, `read,database`),
  `code.context` (`[positional domain, flag --code]`, `read`), `memory.query` (`query:universal`,
  `[positional query req]`, `read,database`), `engineering.facade` (`engineer`,
  `[positional objective req, flag-value --ref, flag-value --role]`, `read,database,execution`),
  `risk.assess` (`[positional ref]`, `read,database`), `orchestrate.status` (`[positional slug]`,
  `read`), `orchestrate.advance` (`[positional slug req]`, `write,execution`, `risk:'medium'`),
  `drift.check` (`[flag-value --domain]`, `read,database,execution`, `risk:'medium'`,
  `timeoutMs` maior), `forja.status` (`status`, `[]`, `read`), `forja.next` (`next`, `[]`, `read`).
  Cada um: `description`, `permissions`, `sideEffects` coerentes; `validateInput` = `makeValidator`.
- **Done**:
  - [ ] `CLI_CAPABILITY_SPECS.length >= 18`
  - [ ] `forja capabilities:list` lista o conjunto; `forja capabilities:describe <id>` funciona
  - [ ] `tsc --noEmit` verde

## T5 — Contrato de saída no `--json` de comando-capability
- **Owner**: Worker · **Est**: M · **Depende de**: T2, T3
- **Paths**: `bin/forja.ts`
- **Escopo**: `toContract(result): { json, exitCode }` — único ponto do mapa envelope→contrato
  (ADR-0083). `printExecutionResult(result, json)`: `json=true` → `console.log(JSON.stringify(
  toContract(result).json))` + `process.stderr.write(stderr)`; `json=false` inalterado.
  `runCapabilityCommand` retorna `toContract(...).exitCode` no modo `--json`. `merge(stdout)`:
  objeto JSON → espalha (colisão de `status` → `raw`); senão `raw: <texto>`. `graph:sync`
  (payload sem `exitCode`) → `status:'ok'` + payload espalhado.
- **Done**:
  - [ ] `forja tools:doctor --json` → `{status:'ok'|'error', ...}`; `forja spec:check <x> --json`
        → `{status:'ok'|'rejected', ...}`
  - [ ] `forja tools:doctor` (sem `--json`) e o consumo MCP (`tools/call`) inalterados
  - [ ] exit code do `--json` casa com `status` (0/1/2)

## T6 — Testes: round-trip + cobertura MCP e2e
- **Owner**: Worker · **Est**: M · **Depende de**: T4, T5
- **Paths**: `test/cli-params.test.js`, `test/mcp-coverage.test.js` (novos)
- **Escopo**:
  - `cli-params`: para **todo** spec em `CLI_CAPABILITY_SPECS`, uma fixture de argv válido →
    `argvFor(params, parseArgv(params, argv))` === argv.
  - `mcp-coverage`: `createCliCapabilityRuntime` + `McpServer` → `tools/list` contém o núcleo
    (`spec.create`, `spec.plan`, `memory.query`, `engineering.facade`, …); `tools/call`
    `spec.create` depois `spec.validate` num `FORJA_WORKSPACE` temp roda o fluxo. `concurrency:false`.
- **Done**:
  - [ ] `node --test test/cli-params.test.js test/mcp-coverage.test.js` verde

## T7 — `json: true` em `spec:check` e `tools:doctor` (fecha D7)
- **Owner**: Worker · **Est**: P · **Depende de**: T5
- **Paths**: `lib/core/registry.ts`, `test/cli-output-contract.test.js`
- **Escopo**: `json: true` + `--json` no `usage`/`examples` das duas entradas. O
  `cli-output-contract` itera o registry — passa a cobri-las automaticamente; ajustar só se a
  fixture de args precisar (ex.: `tools:doctor` sem args).
- **Done**:
  - [ ] `node --test test/cli-output-contract.test.js` verde com `spec:check` e `tools:doctor` incluídos
  - [ ] `forja help tools:doctor` mostra `--json`

## T8 — Documentação + CHANGELOG
- **Owner**: Worker · **Est**: P · **Depende de**: T4, T5
- **Paths**: `docs/capacidades-externas.md`, `docs/contrato-saida-cli.md`, `CHANGELOG.md`
- **Escopo**: `capacidades-externas.md` — cobertura MCP passou de 6 para ~18, com o critério.
  `contrato-saida-cli.md` — remover a ressalva de `spec:check`/`tools:doctor`; anotar que
  comandos-capability conformam via `toContract`. CHANGELOG `[Unreleased]`: Adicionado (13
  capabilities, `params` declarativo); Alterado/breaking (`--json` de comando-capability:
  envelope → contrato de saída).
- **Done**:
  - [ ] `forja tools:doctor` → `docs-commands`, `commands-documented`, `docs-links` verdes

## T9 — Validação final + fecho
- **Owner**: Worker → Governance · **Est**: P · **Depende de**: T1–T8
- **Paths**: `specs/mcp-cobertura-nucleo/spec.md`
- **Escopo**: bateria; `spec.md` §Evidências (resultado, data, desvios); mover status; handoff `review`.
- **Done**:
  - [ ] `tsc --noEmit`, `node --test test/*.test.js`, `forja spec:check`, `forja project:check` verdes — AC-9
  - [ ] `spec:set-status mcp-cobertura-nucleo spec implementing` no início; handoff `worker →
        governance (review)` ao fim

---

## Mapa AC → task

| AC | Tasks | Verificação-chave |
|---|---|---|
| AC-1 | T1 | ADR-0083; `adr-refs` verde |
| AC-2 | T2, T3 | `parseLegacyCommandInput` sem if/else por comando |
| AC-3 | T2, T6 | `test/cli-params.test.js` round-trip para todo spec |
| AC-4 | T4 | `CLI_CAPABILITY_SPECS.length ≥ 18`; `capabilities:list` |
| AC-5 | T5 | `--json` de capability emite o contrato |
| AC-6 | T7 | `spec:check`/`tools:doctor` no `cli-output-contract` |
| AC-7 | T4 | `permissions`/`risk`/`categories` por spec; `validateInput` antes do spawn |
| AC-8 | T6 | `test/mcp-coverage.test.js` — `tools/list` + `tools/call` do fluxo |
| AC-9 | T9 | bateria; 6 atuais inalterados |

## Handoffs entre agentes

SDD Architect (spec+plan+tasks + ADR-0083 na T1) → **Worker** (T2–T8) → **Governance** (T9 +
`project:check`). Registrar via Hermes no início da implementação.

## Evidências e estado real

- Nada executado — caixas `[ ]` abertas.
- **Dependência viva**: `feat/contrato-saida-cli` (#63) → `feat/forja-status` (#62) →
  `feat/cli-intuitiva-v1` (#61).
- **Mudança de contrato**: `--json` de comando-capability (envelope → contrato de saída).
- **A maior das ondas** — AC-9 (6 capability commands byte-idênticos) é o gate; round-trip dos 6
  antes de tocar qualquer coisa (T3).
