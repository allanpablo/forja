# Roadmap ForjaJS v4.1 — menos erros, mais intuitivo, mais funcional com LLMs

- **Data**: 2026-09-07
- **Direção**: Allan Pablo — evoluir o ForjaJS usando o próprio ForjaJS, reduzindo erros,
  tornando a operação mais intuitiva e mais funcional com LLMs (ver `docs/llm-evolution.md`).
- **Estado de partida**: v4.0.0. Core em `bin/forja.ts` + `lib/core/registry.ts` (ADR-0020),
  473 testes verdes, 77 ADRs, pipeline SDD, Engineering Control Plane (v3), integração LLM
  read-only via Codex (v4).
- **Formato**: diagnóstico + 12 workstreams em 4 ondas. Cada frente aprovada vira
  `specs/<slug>/spec.md` pelo pipeline do Forja, com ADR nas decisões estruturais.
- **Primeira spec derivada**: [`specs/cli-intuitiva-v1/spec.md`](../specs/cli-intuitiva-v1/spec.md)
  (SPEC-043 — Onda 1, W1+W2+W3).

> **Estado (2026-09-08): concluído.** As 12 workstreams (W1–W12) foram implementadas pelo
> pipeline SDD do próprio Forja e merjadas em `main` (PRs #61–#69). Todas as specs derivadas
> estão `done` (`spec:check` exit 0); `drift-sentinel` segue `implementing` **por desenho** —
> ADR-0084 mantém aberta a janela de observação de "drift real no mundo" até 2026-10-08.
> ADRs estruturais: 0082 (contrato de saída), 0083 (cobertura MCP declarativa), 0084 (fecho do
> drift-sentinel), 0085 (adaptador Claude).

## Método

Levantado por leitura direta (codegraph ausente na máquina de trabalho — `tools:doctor` reporta
0/5 ferramentas opcionais; busca feita com `rg`/leitura):

- `bin/forja.ts` (362 L), `lib/core/registry.ts` (642 L), `apps/cli/src/index.ts`
- `node bin/forja.ts` — ~75 comandos em 10 domínios
- `node --test test/*.test.js` — 473/473 verdes (~10,8 s)
- `node bin/forja.ts tools:doctor` — núcleo OK com ressalvas; clone novo sem workspace/índice
- `.github/workflows/ci.yml` — roda `npm test`, `spec:check forja-core`, `release:check`
- `CHANGELOG.md` (v3/v4), `docs/llm-fit-loop.md`, `docs/llm-evolution.md`, `specs/drift-sentinel/spec.md`

## Diagnóstico

### Eixo A — Diminuir erros

| # | Achado | Evidência |
|---|---|---|
| A1 | `suggest()` só faz prefix-match do segmento antes de `:` — `forja plan` **não** sugere `spec:plan` | `bin/forja.ts` `suggest()` |
| A2 | Registry declara só `domain/desc/node/args/gates`. Sem `usage`, `args`, `examples`. O agente descobre o uso **executando e lendo o stack trace** do script-filho | `lib/core/registry.ts` |
| A3 | Não existe `forja help <comando>` | `printHelp()` só imprime a lista |
| A4 | Padrão recorrente de bugs: divergência **dev-checkout × pacote publicado × worktree isolado** (HOME não passado ao sandbox; `cwd` errado no pacote; `resolveScript`; memory-db falso "corrompido") | seções "Corrigido" dos changelogs 3.0/4.0 |
| A5 | Projeto gerado **não tem smoke no CI**: `lib/core/project-smoke.ts` existe mas `ci.yml` não o roda; nenhuma combinação de `--ai` é validada com `install && test && project:check` | `.github/workflows/ci.yml` |
| A6 | `init:project` escreve 4 conjuntos de instruções (CLAUDE/Copilot/Gemini/Codex). O check `agent-topology` que garante coerência **só existe para este repo**, não para o gerado — os 4 divergem com o tempo | `tools:doctor`; `lib/generators/` |
| A7 | `drift:check` (SPEC-030) está `implementing`: AC-5 com escopo reduzido, métrica do §8 (drift real achado em projeto real) **nunca observada** — só dogfooding local sem achados | `specs/drift-sentinel/spec.md` |
| A8 | `--json` e exit codes **inconsistentes**. `llm:run`/`simulate` têm padrão bom (`executionStatus`/`validationStatus`, exit 2 = validação reprovada); o resto varia | `docs/llm-fit-loop.md` §validação |
| A9 | `spec:new` aloca ID por contagem de diretórios em `specs/`, não pelo maior `SPEC-NNN` — já há colisões (SPEC-037/038/039/040 aparecem 2× cada). `cli-intuitiva-v1` recebeu SPEC-040, corrigido à mão para SPEC-043 | observado em 2026-09-07 ao criar a spec |

### Eixo B — Mais intuitivo

| # | Achado | Evidência |
|---|---|---|
| B1 | `forja help` = parede de ~75 linhas, sem camada "os 10–12 que você usa 90% do tempo" | saída de `node bin/forja.ts` |
| B2 | Sufixos `(SPEC-0XX)` na descrição de ~30 comandos são ruído para quem opera | descrições no help |
| B3 | `orchestrate` (a cadeia SDD/GSD como máquina de estados guardada por gates, SPEC-021) é **o caminho feliz** mas fica no meio da lista; não há `forja next`/`forja status` que diga a próxima ação | help; `scripts/orchestrate.ts` |
| B4 | 3 formas de invocar (`npm run x`, `node bin/forja.ts x`, `forja x`) + aliases não documentados (`ops:*` = `gsd:*`) | `package.json`, registry |
| B5 | `tools:doctor` lista correções mas **não as aplica**; SessionStart mistura "normal em clone novo" com acionável | saída `tools:doctor`; hook `<framework-status>` |

### Eixo C — Mais funcional com LLMs

| # | Achado | Evidência |
|---|---|---|
| C1 | **Só 6 comandos** viram capability MCP (`tools:doctor`, `code:impact`, `context:budget`, `spec:check`, `sprint:status`, `gsd:handoff`) + `graph.sync`. De ~75. Agente em `mcp:start` **não consegue** rodar spec:new/plan/tasks, `engineer`, `risk:assess`, `context:smart`, `query:universal`, `orchestrate*` | `apps/cli/src/index.ts` `CLI_CAPABILITY_SPECS` |
| C2 | `llm:run --context` é **manual**; o façade `engineer` já compõe contexto+ADR+risco+fluxo mas não alimenta `llm:run` | `docs/llm-fit-loop.md`; help `engineer` |
| C3 | `resume` e `output-schema` são **exclusivos do adaptador Codex**; Claude/Gemini não herdam (contrato explícito) | `docs/agent-operating-contract.md` §LLMs |
| C4 | `llm:recommend` ordena por compat declarada + observação local; **sem eixo custo/latência/qualidade**. `cost:economy` existe isolado. Etapas 3–5 do `llm-evolution.md` seguem "planejadas" | `docs/llm-evolution.md` |
| C5 | `llm_session` guarda metadados de sessão, mas não há `llm:sessions` (list/show) para descobrir o `sessionId` de retomada | `docs/llm-fit-loop.md` §retomar |

## Roadmap priorizado

RICE aproximado (Reach = execuções/agentes afetados; Impact 1–3; Confidence 0–1; Effort S/M/L).
Ordenado por onda. Cada frente vira uma spec após aprovação.

### Onda 1 — Fundação de intuitividade e menos atrito (habilita o resto) — ✅ concluída

**W1 — Registry enriquecido + `forja help <comando>`** · eixos A2/A3/B1/B2 · Effort M · ✅ feito
Campos opcionais em `COMMANDS` (`usage`, `args[]`, `examples[]`, `next[]`, `readonly`, `json`,
`tier`); `forja help <cmd>` renderiza tudo; `forja help` lista só `tier:'core'` + rodapé `--all`.
Arquivos: `lib/core/registry.ts`, `bin/forja.ts`, `test/forja-core.test.js`.

**W2 — `suggest()` fuzzy + erros acionáveis** · eixos A1/A2/B5 · Effort S · ✅ feito
Match por substring + distância de edição sobre o nome completo; pré-validação de args `required`
em `bin/forja.ts` (sem stack trace do filho); toda mensagem de erro termina com o comando de correção.
Arquivos: `bin/forja.ts`, util de distância.

**W3 — rotina de primeiro uso + SessionStart classificado** · eixos A4/B5 · Effort S–M · ✅ feito
No plan o `tools:doctor --fix` virou o comando dedicado **`forja setup`** (`workspace:init` +
`sync:universal` atrás de confirmação; `--yes` para não-interativo) — `tools:doctor` segue só
diagnóstico. Saída de `tools:doctor` e do `<framework-status>` em 3 blocos fixos (Bloqueia /
Rotina de primeiro uso / Opcional).
Arquivos: `scripts/forja-setup.ts`, `scripts/tools-doctor.ts`, `scripts/hook-session-start.ts`.

> **Entregue como** [`specs/cli-intuitiva-v1/spec.md`](../specs/cli-intuitiva-v1/spec.md)
> (SPEC-043, `done`) — PR #61.

### Onda 2 — Caminho feliz + contrato de máquina — ✅ concluída

**W4 — `forja status` + `forja next`** · eixos B3/C · Effort M · ✅ feito
`status` agrega workspace, sprint, run `orchestrate` aberto (+ etapa/gate), specs por status,
últimos runs. `next` = só a próxima ação + comando exato. `orchestrate` promovido no help/README.
Arquivos: `lib/status-model.ts` (novo), `scripts/forja-status.ts` (novo), `lib/orchestrate.ts`,
`lib/specs-index.ts` / `lib/handoffs-index.ts`, registry, `bin/forja.ts`.
> **Entregue como** [`specs/forja-status-caminho-feliz/spec.md`](../specs/forja-status-caminho-feliz/spec.md)
> (SPEC-044, `done`) — PR #62.

**W5 — Contrato de saída CLI: `--json` + exit codes** · eixo A8 · Effort M (incremental) · **ADR-0082** · ✅ feito
`docs/contrato-saida-cli.md`: `--json` emite um objeto único com chave `status`
(`ok`|`error`|`rejected`); exit 0/1/2/127. `lib/cli-output.ts` (`emitOk`/`emitError`/`emitRejected`)
impõe o formato; `test/cli-output-contract.test.js` itera o registry `json:true`. `llm:sessions`
(SPEC-048) fica como exceção conhecida (forma própria, anterior ao ADR).
Arquivos: `docs/contrato-saida-cli.md` (novo), `lib/cli-output.ts` (novo), `lib/core/registry.ts`, testes.
> **Entregue como** [`specs/contrato-saida-cli/spec.md`](../specs/contrato-saida-cli/spec.md)
> (SPEC-045, `done`) — PR #63.

**W6 — Cobertura MCP: de 6 para 18 comandos** · eixo C1 · Effort M–L · **ADR-0083** · ✅ feito
`CLI_CAPABILITY_SPECS` cobre o núcleo do fluxo (`spec:new/plan/tasks`, `query:universal`,
`engineer`, `risk:assess`, `orchestrate:status/advance`, `drift:check`, `code:context`, `status`,
`next`). Mapeamento argv↔payload declarativo (`apps/cli/src/params.ts`, `parseArgv`/`argvFor`
inversos com round-trip test) — o `if/else` por comando some. `spec:check` e `tools:doctor`
conformam via o adaptador `toContract` em `bin/forja.ts` (fecha o débito D7 de W5).
Arquivos: `apps/cli/src/index.ts`, `apps/cli/src/params.ts` (novo), `bin/forja.ts`, testes.
> **Entregue como** [`specs/mcp-cobertura-nucleo/spec.md`](../specs/mcp-cobertura-nucleo/spec.md)
> (SPEC-046, `done`) — PR #64.

### Onda 3 — Qualidade que previne regressão — ✅ concluída

**W7 — Smoke do projeto gerado no CI (matrix por `--ai`)** · eixo A5 · Effort S–M · ✅ feito
Job de CI `project-smoke-ai` em matriz (`claude` · `copilot` · `claude,copilot,gemini,codex`),
tier barato, a cada PR e push. `project:smoke --ai <lista>` exercita o caminho real (memória +
instruções nativas por IA), gerado só-memória e sem rede.
Arquivos: `.github/workflows/ci.yml`, `lib/core/project-smoke.ts`.

**W8 — Coerência das instruções multi-IA no projeto gerado** · eixo A6 · Effort M · ✅ feito
`lib/multi-ai-instructions.ts` (novo) — fonte única para CLAUDE/Copilot/Gemini/Codex; check
`ai-instructions` no `project:smoke` prova corpo byte-idêntico entre IAs (só o cabeçalho muda) e
`models.json` coerente. É o análogo do `agent-topology`, na saída do gerador.
Arquivos: `lib/multi-ai-instructions.ts` (novo), `bin/init-project.ts`, `lib/core/project-smoke.ts`.
> W7+W8 **entregues como** [`specs/projeto-gerado-confiavel/spec.md`](../specs/projeto-gerado-confiavel/spec.md)
> (SPEC-047, `done`) — PR #65.

**W9 — Fechar SPEC-030 (`drift:check`) com métrica real** · eixo A7 · Effort S + observação · **ADR-0084** · ✅ feito
`drift:check --all` roda o sentinela uma vez por projeto do workspace, cada um num grafo isolado
e persistente. A métrica "drift real no mundo" do §8 (infalsificável como bloqueio de `done`)
virou aceite verificável agora + janela de observação até **2026-10-08**; `drift:check` segue
gate opt-in. Spec fica `implementing` **por desenho** até a janela fechar.
Arquivos: `scripts/drift-check.ts`, `apps/cli/src/index.ts` (param `--all` na capability),
`memory/90-decisions/0084-*`, `specs/drift-sentinel/spec.md`.
> **Entregue como** atualização de [`specs/drift-sentinel/spec.md`](../specs/drift-sentinel/spec.md)
> (SPEC-030) — PR #66.

### Onda 4 — LLM de próxima geração (etapas 3–5 do `llm-evolution.md`) — ✅ concluída

**W10 — `llm:run --engineer` + `llm:sessions`** · eixos C2/C5 · Effort M · ✅ feito
`llm:run --engineer "<objetivo>"` monta o contexto pelo façade `engineer` e o embute no prompt
(hash cobre o prompt transmitido; `contextRefs` guarda só `engineer:<objetivo>`, nunca o
conteúdo). `llm:sessions list|show` sobre `llm_session`, read-only.
Arquivos: `lib/llm/context.ts`, `lib/llm/session.ts`, `scripts/llm-fit.ts`, registry, `docs/llm-fit-loop.md`.
> **Entregue como** [`specs/llm-contexto-e-sessoes/spec.md`](../specs/llm-contexto-e-sessoes/spec.md)
> (SPEC-048, `done`) — PR #67.

**W11 — Benchmark real + recomendação por custo/latência (etapa 3)** · eixo C4 · Effort M–L · ✅ feito
`llm:eval` ganha `durationMsP50`/`durationMsP95` e `costPerAcceptedTask`; `llm:recommend`
pondera latência e custo (bônus limitado, nunca inverte um fit) e devolve `evidence` por
candidato + `reasons` com `latency:p50=…` / `cost:$…/run`. Baseline de 30 d antes de qualquer percentual.
Arquivos: `packages/evals/src/index.ts`, `packages/llm/src/index.ts`, `scripts/llm-fit.ts`, `docs/llm-evolution.md`.
> **Entregue como** [`specs/llm-benchmark-recomendacao/spec.md`](../specs/llm-benchmark-recomendacao/spec.md)
> (SPEC-049, `done`) — PR #68.

**W12 — Adaptador Claude com paridade (`resume`/`output-schema`)** · eixo C3 · Effort L · **ADR-0085** · ✅ feito
`llm:run --profile claude` → `claude -p "<prompt>" --output-format json [--model m] [--resume id]`
(`shell:false`, sem ler API keys). `lib/llm/claude-output.ts` normaliza o objeto JSON único do
provedor; `RESUME_PROVIDERS = { codex, claude }` rege o guard de retomada; `--output-schema` para
Claude é validação **local (Ajv)**, não garantia do provedor (`features.outputSchema: false`).
Mantido o `if (provider === …)` + `*-output.ts` — sem `lib/llm/adapters/` genérico (ADR-0085).
Arquivos: `packages/llm/src/index.ts`, `lib/llm/claude-output.ts` (novo), `lib/llm/session.ts`,
`scripts/llm-fit.ts`, `memory/90-decisions/0085-*`, `specs/llm-adaptador-claude/`.
> **Entregue como** [`specs/llm-adaptador-claude/spec.md`](../specs/llm-adaptador-claude/spec.md)
> (SPEC-050, `done`) — PR #69.

## Agrupamento em specs — ✅ todas entregues

| Spec | Frentes | ID | ADR | Estado | PR |
|---|---|---|---|---|---|
| `cli-intuitiva-v1` | W1 + W2 + W3 | SPEC-043 | não | `done` | #61 |
| `forja-status-caminho-feliz` | W4 | SPEC-044 | não | `done` | #62 |
| `contrato-saida-cli` | W5 | SPEC-045 | ADR-0082 | `done` | #63 |
| `mcp-cobertura-nucleo` | W6 | SPEC-046 | ADR-0083 | `done` | #64 |
| `projeto-gerado-confiavel` | W7 + W8 | SPEC-047 | — | `done` | #65 |
| `drift-sentinel` (existente) | W9 | SPEC-030 | ADR-0084 | `implementing` (janela de observação até 2026-10-08) | #66 |
| `llm-contexto-e-sessoes` | W10 | SPEC-048 | não | `done` | #67 |
| `llm-benchmark-recomendacao` | W11 | SPEC-049 | não | `done` | #68 |
| `llm-adaptador-claude` | W12 | SPEC-050 | ADR-0085 | `done` | #69 |

## Fora de escopo desta rodada

- Reescrita do help/onboarding como TUI interativa (só camadas de texto agora).
- Failover automático entre modelos ou chamada direta a APIs sem ADR (contrato proíbe no MVP).
- Habilitar manutenção autônoma (ADR-0079 mantém como prontidão arquitetural, não habilitação).
- Editar `projects/` (off-limits) ou os relatórios de `docs/archive/`.
