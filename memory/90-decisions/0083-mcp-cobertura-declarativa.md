# ADR-0083: Cobertura MCP — arg mapping declarativo e envelope alinhado ao contrato de saída

- **Status**: accepted
- **Data**: 2026-09-08
- **Autor(es)**: Allan Pablo / Claude
- **Tags**: mcp, cli, capabilities, contract

## Contexto

Um agente que fala com o Forja por MCP (`forja mcp:start`) enxerga 6 comandos de ~75:
`tools:doctor`, `code:impact`, `context:budget`, `spec:check`, `sprint:status`, `gsd:handoff`
(+ `graph.sync`). Não consegue rodar o fluxo SDD nem os comandos de contexto/engenharia. Dois
obstáculos estruturais impediam ampliar:

1. **`apps/cli/src/index.ts`** traduz argv↔payload num `if/else` por comando dentro de
   `parseLegacyCommandInput`, e cada `CliCapabilitySpec` tem um `toArgs` que é o inverso manual.
   Adicionar um comando exige mexer nos dois em sincronia, sem contrato que force a coerência.
2. O `--json` de um comando-capability despeja o `ExecutionResult` cru
   (`{ status: "succeeded" | "failed", output: { payload: { command, args, exitCode, stdout,
   stderr } } }`) — não segue o contrato de saída (ADR-0082). É o débito **D7** da SPEC-045:
   `spec:check` e `tools:doctor` ficaram fora do contrato por causa disso.

## Decisão

**1 — Mapeamento argv↔payload declarativo.** `CliCapabilitySpec` ganha
`params: CapabilityParam[]`, onde cada param é `positional` | `flag` (booleana) | `flag-value`
(`--x <v>`) | `rest` (resto → string). Duas funções puras e **inversas** em
`apps/cli/src/params.ts` — `parseArgv(params, argv)` e `argvFor(params, input)` — substituem o
`toArgs` manual e o `if/else`. Um teste de round-trip
(`argvFor(params, parseArgv(params, argv)) === argv`) para todo spec é o contrato que impede
divergência. `validateInput` continua explícito: `makeValidator(params)` cobre "required
presente + tipo", e specs com limite real (`code:impact` depth 1..10) o embrulham. `graph.sync`
permanece o único caso sem `command`/`params` (não tem CLI equivalente).

**2 — Critério do que vira capability nesta rodada.** Somente leitura e escrita SDD de baixo
risco. Entram (13): `spec.create` (`spec:new`), `spec.plan`, `spec.tasks`, `context.smart`,
`code.context`, `memory.query` (`query:universal`), `engineering.facade` (`engineer`),
`risk.assess`, `orchestrate.status`, `orchestrate.advance`, `drift.check`, `forja.status`,
`forja.next`. **Ficam de fora**, e por quê:

- `orchestrate` (start) — abre uma corrida inteira; efeito grande demais para uma tool.
- `llm:*` — contrato de privacidade próprio (ADR-0081); rodada separada.
- `project:new`, `sprint:start`/`sprint:complete`, `workspace:init`, `setup` — mutação fora do
  fluxo SDD.
- `memory:*` de escrita (`sync:universal`, `memory:compress`, …) e `architecture:approve` —
  manutenção/governança, não fluxo de feature.

Capabilities de escrita declaram `permissions: ['write']` e `categories` com `write`/`database`;
o `PolicyEngine` do CLI já permite `roles: ['cli']` em todas as categorias — a decisão **não
amplia autonomia**, só torna o comando invocável.

**3 — Envelope → contrato de saída.** Só no modo `--json` da CLI, `bin/forja.ts` traduz o
`ExecutionResult` de um comando-capability para o objeto do contrato de saída (ADR-0082), via
uma única função `toContract`:

| `ExecutionResult` | contrato |
|---|---|
| `status: "succeeded"` e `payload.exitCode === 0` (ou sem `exitCode`, ex.: `graph.sync`) | `{ status: "ok", ...merge(stdout) }` — exit 0 |
| `status: "succeeded"` e `payload.exitCode === 2` | `{ status: "rejected", ...merge(stdout) }` — exit 2 |
| `status: "failed"`, ou `exitCode === 1` | `{ status: "error", error: { message, code }, ...merge(stdout) }` — exit 1 |

`merge(stdout)`: se o `stdout` do comando-filho é um objeto JSON, suas chaves são espalhadas no
resultado (quando o filho já é `json: true`, o `status` dele coincide com o do contrato);
colisão real de `status` → o `stdout` inteiro vai para `raw` e o `status` do contrato prevalece.
`stdout` que não é JSON → `raw: "<texto>"`. `stderr` não vazio → stderr.

O **consumo MCP** (`tools/call`) **não** passa por `toContract` — o MCP tem o próprio contrato
de protocolo e continua recebendo o `ExecutionResult`.

Com isso, `spec:check` e `tools:doctor` passam a `json: true` no registry — fecha D7.

## Alternativas consideradas

- **Gerar só um sentido do mapeamento e inferir o outro** — frágil para flags e `rest`; o
  round-trip explícito é mais barato de garantir.
- **`toContract` em `apps/cli` / mudar `normalizeCliResult`** — quebraria o consumo MCP, que
  depende do `ExecutionResult`.
- **Aninhar sempre em `output`** em vez de `merge` flat — contraria o ADR-0082 ("campos ao lado
  de `status`") e piora a ergonomia para o agente.
- **Cobrir também `orchestrate` start e `llm:*`** — efeito/contrato grandes demais para esta
  rodada; ficam para specs próprias.

## Consequências

**Positivas**:
- `tools/list` do MCP passa de 6 para ~18; o fluxo SDD roda por `tools/call`.
- Adicionar um comando à cobertura vira uma entrada declarativa + uma fixture de round-trip.
- `--json` de qualquer comando-capability segue um contrato único.

**Negativas / Trade-offs**:
- **Mudança de forma**: o `--json` de comando-capability deixa de emitir o `ExecutionResult` cru
  e passa a emitir o objeto do contrato. Sem consumidor externo conhecido (o MCP usa
  `tools/call`, não `--json`). Registrado no CHANGELOG.
- Mais capabilities carregadas em todo `mcp:start`; o custo por capability é só o registro (o
  handler continua spawnando `node bin/forja.ts <cmd>` sob demanda).
- A lista de 18 é um ponto de pressão ("só mais esse"); o critério acima é o que decide, e o que
  estiver fora dele exige nova spec.

## Rastreamento

- Implementação: `apps/cli/src/params.ts`, `apps/cli/src/index.ts`, `bin/forja.ts`, `lib/core/registry.ts`
- Testes: `test/cli-params.test.js`, `test/mcp-coverage.test.js`, `test/cli-output-contract.test.js`
- [Spec](../../specs/mcp-cobertura-nucleo/spec.md) · [Contrato de saída](../../docs/contrato-saida-cli.md) · ADR-0082 (contrato de saída), ADR-0020 (core/registry)
