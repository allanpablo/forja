# Spec: mcp-cobertura-nucleo — o núcleo do fluxo operável por MCP

- **ID**: SPEC-046
- **Status**: approved
- **Owner**: apk
- **Criado em**: 2026-09-08
- **Sprint alvo**: <a definir>
- **ADRs relacionadas**: **ADR-0083** (nova — arg mapping declarativo + critério de capability +
  alinhamento do envelope ao contrato de saída).
- **Origem**: `docs/roadmap-v4.1.md`, Onda 2 (W6). Fecha o débito D7 de SPEC-045.
- **Depende de**: `cli-intuitiva-v1` (SPEC-043, `json`/`tier` no registry),
  `contrato-saida-cli` (SPEC-045, ADR-0082). Branch empilhada sobre `feat/contrato-saida-cli`.

## 1. Problema

Um agente que fala com o Forja por MCP (`forja mcp:start`) enxerga **6 comandos** de ~75:
`tools:doctor`, `code:impact`, `context:budget`, `spec:check`, `sprint:status`, `gsd:handoff`
(+ `graph.sync`). Ele **não consegue** rodar o fluxo SDD (`spec:new/plan/tasks`), nem
`context:smart`, `query:universal`, `engineer`, `risk:assess`, `orchestrate:status/advance`,
`drift:check`, `status`, `next` — cai em adivinhar invocação de CLI, que é o atrito que o resto
do roadmap v4.1 ataca.

Dois obstáculos estruturais no caminho de adicionar comandos:

- **`apps/cli/src/index.ts`** traduz argv↔payload num `if/else` por comando dentro de
  `parseLegacyCommandInput`, e cada spec tem um `toArgs` que é o inverso manual disso. Adicionar
  um comando exige mexer nos dois, em sincronia, sem contrato que force a coerência.
- **O `--json` de um comando-capability não segue o contrato de saída (ADR-0082)**. Ele despeja o
  `ExecutionResult` cru (`{ status: "succeeded" | "failed", output: { payload: { stdout, … } } }`).
  É o débito **D7** da SPEC-045: `spec:check` e `tools:doctor` ficaram fora do contrato por isso.

**Como medimos hoje**: `CLI_CAPABILITY_SPECS.length === 6`. `forja mcp:start` + `tools/list` → 6.

## 2. Proposta de valor

O núcleo do fluxo (~18 comandos) fica operável por MCP com input tipado, e o `--json` de qualquer
comando-capability passa a seguir o contrato de saída. Adicionar um comando novo à cobertura vira
**uma entrada declarativa**, não um `if` a mais em dois lugares.

## 3. User stories

- **Como** agente LLM plugado via MCP, **quero** `spec:new`, `spec:plan`, `context:smart`,
  `query:universal`, `engineer`, `risk:assess`, `orchestrate:status/advance`, `status`, `next`
  como tools tipadas, **para que** eu rode o fluxo sem montar linha de comando.
- **Como** consumidor de `spec:check --json` / `tools:doctor --json`, **quero** o formato do
  contrato (`{status: "ok"|"error"|"rejected", …}`), **para que** eu não trate dois envelopes.
- **Como** mantenedor, **quero** adicionar um comando à cobertura numa entrada declarativa com um
  teste que força argv↔payload a fecharem, **para que** não haja `if/else` a sincronizar.

## 4. Critérios de aceite (Definition of Done)

- [ ] **AC-1**: **ADR-0083** registra: (a) o arg mapping declarativo; (b) o critério do que vira
      capability nesta rodada (somente leitura + writes SDD de baixo risco; sem `llm:*`, sem
      writes de sprint/projeto, sem `orchestrate` start); (c) o mapa envelope→contrato:
      `succeeded`→`ok`, `failed`→`error`, `exitCode === 2` do comando→`rejected`.
- [ ] **AC-2**: `CliCapabilitySpec` ganha `params: { name, kind: 'positional' | 'flag' | 'flag-value', required?: boolean }[]`. `toArgs` e o parse de argv passam a ser **derivados de `params`** por um só helper; o `if/else` por comando em `parseLegacyCommandInput` **é removido** (os casos especiais restantes, se houver, ficam explicitamente nomeados).
- [ ] **AC-3**: round-trip testado — para todo spec, `toArgs(parseArgs(spec, argvFixture))` reproduz `argvFixture` (ordem, flags, valores).
- [ ] **AC-4**: `CLI_CAPABILITY_SPECS` cobre, além dos 6 atuais: `spec:new`, `spec:plan`,
      `spec:tasks`, `context:smart`, `code:context`, `query:universal`, `engineer`,
      `risk:assess`, `orchestrate:status`, `orchestrate:advance`, `drift:check`, `status`,
      `next`. (Lista final fechada no `plan`.) `forja capabilities:list` e o `tools/list` do MCP
      mostram o conjunto.
- [ ] **AC-5**: `bin/forja.ts` — no modo `--json`, um comando-capability emite **o contrato**
      (`{status, …}` conforme ADR-0082) derivado do `ExecutionResult`, não o envelope cru.
      `stdout` do comando-filho, se for JSON válido, é **fundido** no objeto (flat); senão vai
      como string em `raw`. `stderr` → stderr. Exit code segue o contrato (0/1/2).
- [ ] **AC-6**: `spec:check` e `tools:doctor` marcados `json: true` no registry (D7 fechado);
      `test/cli-output-contract.test.js` passa a cobri-los sem alteração no teste.
- [ ] **AC-7**: cada capability nova declara `permissions`/`risk`/`categories`/`sideEffects`
      coerentes (as de escrita SDD como `write`+`database` quando gravam; as de leitura como
      `read`). `validateInput` rejeita input fora do schema **antes** de spawnar.
- [ ] **AC-8**: e2e — `forja mcp:start` responde `tools/list` com o núcleo; `tools/call` de
      `spec.create` → `spec.validate` roda o fluxo por MCP num workspace temporário.
- [ ] **AC-9**: `tsc --noEmit`, `node --test test/*.test.js`, `forja spec:check`,
      `forja project:check` verdes. Nenhum dos 6 comandos-capability atuais muda de assinatura,
      payload MCP ou exit code (round-trip + testes MCP existentes verdes).

## 5. Escopo

**Dentro**:
- ADR-0083.
- `apps/cli/src/index.ts` — `params` declarativo, helper de parse/serialização, remoção do
  `if/else`; +13 specs.
- `bin/forja.ts` — `printExecutionResult` no modo `--json` emite o contrato de saída.
- `lib/core/registry.ts` — `json: true` em `spec:check`, `tools:doctor` (e nos novos que ganham
  `--json` de fato via capability, se aplicável).
- Testes: round-trip de args, contagem/lista de capabilities, e2e MCP do fluxo SDD, contrato de
  saída dos capability commands.
- `docs/capacidades-externas.md` e `docs/contrato-saida-cli.md` — nota sobre o envelope alinhado.

**Fora** (evita scope creep):
- `llm:*` como capability — tem contrato de privacidade próprio (ADR-0081); rodada separada.
- Writes de mutação fora do SDD: `project:new`, `sprint:start/complete`, `workspace:init`,
  `setup`, `orchestrate` (start).
- MCP **resources** (só tools nesta rodada).
- Mudança em `PolicyEngine`, autonomy bands, ou no `McpServer` além do que a lista maior exige.
- Retrofit de `--json` em comandos que não são capability e não têm (isso é incremental por W5).

## 6. NFRs / restrições

- **Compatibilidade**: os 6 capability commands atuais — payload MCP, `toArgs`, exit code —
  **idênticos** (AC-9). O `--json` **de capability commands muda de forma** (envelope →
  contrato): documentado no ADR-0083 e no CHANGELOG; alinha, não regride (o envelope não tinha
  consumidor externo além do MCP, que usa `tools/call`, não `--json`).
- **Segurança**: `validateInput` roda antes do spawn; capability de escrita declara `write` e o
  `PolicyEngine` já cobre `roles: ['cli']` com todas as categorias — sem ampliar autonomia.
- **Performance**: parse declarativo é O(argv); irrelevante.
- **Observabilidade**: auditoria de `runCapabilityCommand` inalterada (`forja-runs.jsonl`).

## 7. Riscos e mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Remover o `if/else` quebra o parse de um dos 6 atuais | M | A | AC-3 round-trip cobre os 6 antes de tocar qualquer coisa; testes MCP existentes são gate |
| Fundir `stdout` JSON do filho no objeto colide com `status` | M | M | Ordem de merge: contrato primeiro, `stdout` depois só para chaves livres; conflito de `status` → `stdout` vai para `raw` |
| `context:smart`/`engineer` como capability puxam dependências pesadas (graph, sqlite) para todo `mcp:start` | M | M | O handler continua spawnando `node bin/forja.ts <cmd>` (subprocess), não importando o módulo — o custo é o mesmo de hoje |
| Lista de 18 vira 30 por pressão de "só mais esse" | M | B | Critério no ADR-0083; fora dele = nova spec |
| `drift:check` como capability expõe reindexação cara sem rate limit | B | M | `risk: 'medium'`, `idempotent: true`, `timeoutMs` maior; é read-mostly (não promove nada) |

## 8. Métricas de sucesso

30 dias, baseline antes (`CLI_CAPABILITY_SPECS.length === 6`, `tools/list` = 6):

- `tools/list` do MCP passa a listar ≥ 18; um agente completa `spec:new → spec:check` só por
  `tools/call`, sem CLI.
- Zero regressões nos 6 capability commands atuais.
- `spec:check --json` / `tools:doctor --json` passam no `cli-output-contract` sem exceção.
- Adicionar o 19º comando à cobertura é 1 entrada declarativa + 1 fixture de round-trip (medido
  no primeiro PR que o fizer).

## Evidências e estado real

- AC-1 a AC-9 → tasks em `spec:tasks`.
- **Mudança de contrato**: o `--json` de comandos-capability passa do `ExecutionResult` cru para
  o objeto do contrato de saída (ADR-0082). No ADR-0083 e no CHANGELOG.
- **Fecha D7 da SPEC-045** (`spec:check`/`tools:doctor` no contrato).
- **Hipótese, não medição**: adoção via MCP depende de agentes configurarem `mcp:start` — sem
  instrumentação dedicada ainda.
- **Dependência**: empilhada sobre `feat/contrato-saida-cli` (#63) → `feat/forja-status` (#62)
  → `feat/cli-intuitiva-v1` (#61).
