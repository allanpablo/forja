# Plan: mcp-cobertura-nucleo

- **Spec**: ./spec.md
- **Status**: approved
- **Criado em**: 2026-09-08

> Como vamos construir o que a spec define. Sem código aqui — só estrutura e decisões.

## 1. Abordagem técnica

**Uma fonte para o mapeamento argv↔payload, e um adaptador do envelope para o contrato.**
`apps/cli/src/params.ts` (novo) define `CapabilityParam` e duas funções puras inversas —
`parseArgv(params, argv)` e `argvFor(params, input)`. `CliCapabilitySpec` ganha `params`; o
`toArgs` de cada spec vira `argvFor(spec.params)`, e o `if/else` de `parseLegacyCommandInput`
vira `parseArgv(spec.params, argv)`. Um round-trip fixture por spec força os dois a fecharem.
Em `bin/forja.ts`, `toContract(executionResult)` traduz `{status:'succeeded'|'failed', output}`
no objeto do contrato de saída (ADR-0082) quando `--json`. Adicionar comando à cobertura passa a
ser uma entrada em `CLI_CAPABILITY_SPECS`.

## 2. Módulos afetados

| Caminho | Mudança | Risco |
|---|---|---|
| `memory/90-decisions/0083-mcp-cobertura-declarativa.md` | **criar** — arg mapping declarativo, critério de capability, mapa envelope→contrato | B |
| `apps/cli/src/params.ts` | **criar** — `CapabilityParam`, `parseArgv`, `argvFor`, `makeValidator` (validador base a partir de `params`) | M |
| `apps/cli/src/index.ts` | editar — `CliCapabilitySpec.params`; `toArgs` = `argvFor`; `parseLegacyCommandInput` → `parseArgv` genérico; **+13 specs**; validators viram `makeValidator(params)` + checagem extra explícita onde há range | A |
| `bin/forja.ts` | editar — `toContract()`; `printExecutionResult` no modo `--json` emite o contrato; `runCapabilityCommand` sai com o exit code derivado (0/1/2) | M |
| `lib/core/registry.ts` | editar — `json: true` em `spec:check` e `tools:doctor` (D7 fechado) | B |
| `packages/mcp/src/index.ts` | editar **só se necessário** — `capabilityTool` hoje emite `payload: {type:'object'}` genérico; enriquecer com schema derivado de `params` é **stretch**, não requisito | B |
| `test/cli-params.test.js` | **criar** — round-trip `argvFor(parseArgv(argv)) === argv` para todo spec | B |
| `test/mcp-coverage.test.js` | **criar** — contagem ≥ 18; e2e `tools/call` do fluxo SDD num workspace temporário | M |
| `test/cli-output-contract.test.js` | editar — deixa de excluir `spec:check`/`tools:doctor` (passam a conformar via `toContract`) | B |
| `docs/capacidades-externas.md`, `docs/contrato-saida-cli.md`, `CHANGELOG.md` | editar — cobertura maior + envelope alinhado | B |

## 3. Diagrama de fluxo

```
CLI:  forja <cmd> [args] [--json]
        │  bin/forja.ts: capabilityIdForCommand(cmd) ≠ undefined
        ├─ withoutFlag(args,'--json')
        ├─ parseLegacyCommandInput(cmd, args) ── parseArgv(spec.params, args) ─► {capabilityId, payload}
        ├─ executeCliCapability(runtime, id, payload)     (validateInput → spawn `node bin/forja.ts <cmd>` captured)
        └─ printExecutionResult(result, json)
              json=false → stdout/stderr do filho, como hoje
              json=true  → toContract(result):
                             succeeded & exit 0 → {status:'ok',  ...merge(stdout)}          exit 0
                             succeeded & exit 2 → {status:'rejected', ...merge(stdout)}      exit 2
                             failed / exit 1    → {status:'error', error:{message,code}, ...merge(stdout)}  exit 1
                           merge(stdout): JSON objeto → espalha (colisão com `status` → vai p/ `raw`); senão `raw: "<texto>"`

MCP:  tools/call <capabilityTool>  → registry.execute(payload)  → mesmo handler (spawn captured) → ExecutionResult
        (não passa por toContract; o MCP consome o ExecutionResult, contrato próprio do protocolo)
```

## 4. Contratos (API/CLI/Schema)

```ts
// apps/cli/src/params.ts
export type CapabilityParam =
  | { name: string; kind: 'positional'; required?: boolean; parse?: 'string' | 'int' }
  | { name: string; kind: 'flag' }                                       // boolean: --code
  | { name: string; kind: 'flag-value'; flag: string; required?: boolean; parse?: 'string' | 'int' }  // --mode <v>
  | { name: string; kind: 'rest' };                                      // resto → string (join ' ')

export function parseArgv(params: readonly CapabilityParam[], argv: readonly string[]): InputRecord;
export function argvFor(params: readonly CapabilityParam[], input: InputRecord): string[];
export function makeValidator(params: readonly CapabilityParam[]): (v: unknown) => InputRecord; // required + tipo
```

**`CliCapabilitySpec`** ganha `readonly params: readonly CapabilityParam[]`. `toArgs` deixa de
ser campo (derivado); `validateInput` continua campo (pode ser `makeValidator(params)` ou um
wrapper que chama a base e adiciona checagem).

**`toContract(result: ExecutionResult): { json: Record<string, unknown>; exitCode: 0 | 1 | 2 }`**
em `bin/forja.ts`. Único ponto que conhece o mapa envelope→contrato (ADR-0083).

## 5. Decisões e alternativas

**D1 — `params` declarativo, `parseArgv`/`argvFor` puros e inversos.** Rejeitado: manter `toArgs`
manual + if-chain (a causa do problema); gerar um só sentido e inferir o outro (frágil para
flags). O round-trip test é o contrato que força a consistência.

**D2 — `validateInput` continua explícito, com base gerada.** `makeValidator(params)` cobre
"required presente + tipo certo"; specs com range (`code:impact` depth 1..10) embrulham a base.
Rejeitado: derivar validação 100% de `params` — perderia os limites que já existem e são certos.

**D3 — `toContract` mora em `bin/forja.ts`, não em `apps/cli`.** É a fronteira CLI; o MCP
consome o `ExecutionResult` direto (contrato do próprio protocolo). Rejeitado: mudar
`normalizeCliResult`/`executeCliCapability` — quebraria o consumo MCP.

**D4 — `merge(stdout)` com fallback `raw`.** Se o `stdout` do filho é um objeto JSON, espalha no
resultado (o filho já pode ser `json:true` e emitir `{status:'ok',...}` — nesse caso o `status`
do filho e o do contrato coincidem). Colisão real (filho emite `status` diferente) → o `stdout`
inteiro vai para `raw` e o `status` do contrato manda. Rejeitado: sempre aninhar em `output`
(menos flat, contraria o ADR-0082).

**D5 — Conjunto fechado: 13 novos.** `spec:new/plan/tasks` (write SDD), `context:smart`,
`code:context`, `query:universal`, `engineer`, `risk:assess`, `orchestrate:status`,
`orchestrate:advance` (write+execution, `risk:'medium'`), `drift:check` (`risk:'medium'`,
timeout maior), `status`, `next`. **Fora**, com razão no ADR-0083: `orchestrate` (start — abre
corrida, efeito grande), `llm:*` (ADR-0081), `project:new`/`sprint:*`/`setup`/`workspace:init`
(mutação fora do SDD), `memory:*` de escrita, `architecture:approve` (governança).

**D6 — Ids `<domínio>.<verbo>`** seguindo os 6 atuais (`spec.validate`, `handoff.create`):
`spec.create`, `spec.plan`, `spec.tasks`, `context.smart`, `code.context`, `memory.query`,
`engineering.facade`, `risk.assess`, `orchestrate.status`, `orchestrate.advance`, `drift.check`,
`forja.status`, `forja.next`.

**D7 — `gsd:handoff` usa `kind: 'rest'`** para o `...contextParts` variádico — some do if-chain
como os outros, não fica special-case.

ADR-0083 é necessária (contrato de superfície + mudança de forma do `--json`).

## 6. Dependências

- **SPEC-043** (`json`/`tier` no registry), **SPEC-045** (ADR-0082, contrato de saída). Branch
  empilhada sobre `feat/contrato-saida-cli` (#63) → `feat/forja-status` (#62) → `feat/cli-intuitiva-v1` (#61).
- **Pacotes npm**: nenhum.
- **Migrações**: nenhuma.

## 7. Rollout

- [ ] Feature flag: não. Aditivo (mais capabilities); o único comportamento que muda é a **forma
      do `--json` de comandos-capability** — ADR-0083 + CHANGELOG.
- [ ] Migração de dados: não.
- [ ] Doc/persona: `docs/capacidades-externas.md` (cobertura), `docs/contrato-saida-cli.md`
      (comandos-capability agora conformam).
- [ ] `CHANGELOG.md` `[Unreleased]`: Adicionado (13 capabilities, `params` declarativo);
      Alterado/breaking (`--json` de comando-capability: envelope → contrato).

## 8. Sinais de fracasso (kill criteria)

- Um dos 6 atuais não se expressa em `params` sem perder informação (fora `gsd:handoff`, já
  previsto) → manter esse um special-case **nomeado** e declarativo para o resto; não bloquear.
- `merge(stdout)` gera colisões demais na prática → abandonar o flat, emitir
  `{status, exitCode, stdout, stderr}` (ainda contrato-shaped, menos ergonômico) e seguir.
- e2e MCP do fluxo SDD fica flaky → `concurrency:false`, `FORJA_WORKSPACE` temp fixo, fixtures
  mínimas; se ainda assim, reduzir o e2e a `spec.create → spec.validate` só.
- Enriquecer `capabilityTool` com schema de `params` puxa refactor no `McpServer` → é stretch,
  cortar sem dó (o `validateInput` já protege).

## Evidências e estado real

| AC | Task | Verificação |
|---|---|---|
| AC-1 | T1 | ADR-0083; `adr-refs` verde |
| AC-2 | T2, T3 | `params.ts` + `index.ts` sem `if/else` por comando |
| AC-3 | T2, T6 | `test/cli-params.test.js` round-trip para todo spec |
| AC-4 | T4 | `CLI_CAPABILITY_SPECS.length ≥ 18`; `capabilities:list` |
| AC-5 | T5 | `toContract` + `printExecutionResult`; contrato no `--json` de capability |
| AC-6 | T5, T7 | `spec:check`/`tools:doctor` `json:true`; `cli-output-contract` cobre-os |
| AC-7 | T4 | cada spec nova com `permissions`/`risk`/`categories`; `validateInput` antes do spawn |
| AC-8 | T6 | `test/mcp-coverage.test.js` — `tools/list` + `tools/call` do fluxo |
| AC-9 | T8 | bateria completa; round-trip dos 6 atuais + testes MCP existentes verdes |

- **Mudança de contrato**: `--json` de comando-capability passa do `ExecutionResult` cru para o
  objeto do contrato de saída (ADR-0082/0083).
- **Hipótese, não medição**: adoção via MCP depende de agentes configurarem `mcp:start`.
