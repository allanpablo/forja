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

### Onda 1 — Fundação de intuitividade e menos atrito (habilita o resto)

**W1 — Registry enriquecido + `forja help <comando>`** · eixos A2/A3/B1/B2 · Effort M
Campos opcionais em `COMMANDS` (`usage`, `args[]`, `examples[]`, `next[]`, `readonly`, `json`,
`tier`); `forja help <cmd>` renderiza tudo; `forja help` lista só `tier:'core'` + rodapé `--all`.
Arquivos: `lib/core/registry.ts`, `bin/forja.ts`, `test/forja-core.test.js`.

**W2 — `suggest()` fuzzy + erros acionáveis** · eixos A1/A2/B5 · Effort S
Match por substring + distância de edição sobre o nome completo; pré-validação de args `required`
em `bin/forja.ts` (sem stack trace do filho); toda mensagem de erro termina com o comando de correção.
Arquivos: `bin/forja.ts`, util de distância.

**W3 — `tools:doctor --fix` + SessionStart classificado** · eixos A4/B5 · Effort S–M
`tools:doctor --fix [--yes]` roda só correções idempotentes seguras (`workspace:init`,
`sync:universal`); saída em 3 blocos fixos (Bloqueia / Rotina de primeiro uso / Opcional);
o gerador do `<framework-status>` reusa a classificação.
Arquivos: `lib/core/` (doctor), script do hook SessionStart.

> **Entregue como** [`specs/cli-intuitiva-v1/spec.md`](../specs/cli-intuitiva-v1/spec.md) (SPEC-043).

### Onda 2 — Caminho feliz + contrato de máquina

**W4 — `forja status` + `forja next`** · eixos B3/C · Effort M
`status` agrega workspace, sprint, run `orchestrate` aberto (+ etapa/gate), specs por status,
últimos runs. `next` = só a próxima ação + comando exato. Promover `orchestrate` no help/README.
Arquivos: `scripts/forja-status.ts` (novo), `scripts/orchestrate.ts`, registry, `bin/forja.ts`.

**W5 — Contrato de saída CLI: `--json` + exit codes** · eixo A8 · Effort M (incremental) · **ADR**
`docs/contrato-saida-cli.md`: `--json` sempre parseável com chave `status`; exit 0/1/2/127
alinhados ao que `llm:run`/`simulate` já fazem. `json:true` no registry marca quem cumpre; teste de contrato.
Arquivos: `docs/contrato-saida-cli.md` (novo), `lib/core/registry.ts`, scripts faltantes, testes.

**W6 — Cobertura MCP: de 6 para o núcleo operável** · eixo C1 · Effort M–L · **ADR**
Estender `CLI_CAPABILITY_SPECS` com o núcleo do fluxo (`spec:new/plan/tasks`, `context:smart`,
`code:context`, `query:universal`, `engineer`, `risk:assess`, `orchestrate:status/advance`,
`drift:check`), cada um com `validateInput` + `toArgs` + schema. Reusa `capabilityIdForCommand`.
Arquivos: `apps/cli/src/index.ts`, testes de parse/args, e2e MCP.

### Onda 3 — Qualidade que previne regressão

**W7 — Smoke do projeto gerado no CI (matrix por `--ai`)** · eixo A5 · Effort S–M
Job matrix (`claude` · `copilot` · `claude,copilot,gemini,codex`): `project:new` em workspace
temporário → `npm ci && npm test && forja project:check`.
Arquivos: `.github/workflows/ci.yml`, `lib/core/project-smoke.ts` (parametrizar `--ai`).

**W8 — Coerência das instruções multi-IA no projeto gerado** · eixo A6 · Effort M
Gerar CLAUDE.md / copilot / gemini / codex de **uma fonte única**; regra em `project:check` de que
as instruções nativas derivam da mesma fonte / versão de contrato.
Arquivos: `lib/generators/`, `lib/validators/`.

**W9 — Fechar SPEC-030 (`drift:check`) com métrica real** · eixo A7 · Effort S + observação · **ADR**
`drift:check --all` sobre `project:list`; se a métrica do §8 não vier em 30 d, decidir explicitamente
(gate opt-in × rebaixar) em ADR.
Arquivos: `lib/drift-sentinel.ts`, `scripts/drift-check.ts`, nova ADR.

### Onda 4 — LLM de próxima geração (etapas 3–5 do `llm-evolution.md`)

**W10 — `llm:run --engineer` + `llm:sessions`** · eixos C2/C5 · Effort M
`llm:run --engineer "<objetivo>"` monta o contexto pelo façade `engineer` e envia (hash mantido,
conteúdo não persistido); `llm:sessions` (list/show) sobre `llm_session`. Read-only default.
Arquivos: `lib/` (façade reusável), `scripts/`, registry, `docs/llm-fit-loop.md`.

**W11 — Benchmark real + recomendação por custo/latência (etapa 3)** · eixo C4 · Effort M–L
`llm:eval` ganha p50/p95, custo por tarefa aprovada (junta `cost:economy`), retrabalho;
`llm:recommend` ordena por qualidade × risco × custo × latência. Baseline 30 d antes de percentuais.
Arquivos: `scripts/` (llm-eval, llm-recommend), `docs/llm-evolution.md`.

**W12 — Adaptador Claude com paridade (`resume`/`output-schema`)** · eixo C3 · Effort L · **ADR primeiro**
ADR + spec para adaptador Claude de primeira classe: mesma fronteira de privacidade, `shell:false`,
sem ler API keys; mapear `resume` e `output-schema` aos recursos equivalentes.
Arquivos: `lib/llm/adapters/` (novo), ADR em `memory/90-decisions/`, `specs/<slug>/`.

## Agrupamento em specs

| Spec | Frentes | ADR | Estado |
|---|---|---|---|
| `cli-intuitiva-v1` | W1 + W2 + W3 | não | **criada** (SPEC-043, draft) |
| `forja-status-caminho-feliz` | W4 | não | a criar |
| `contrato-saida-cli` | W5 | sim | a criar |
| `mcp-cobertura-nucleo` | W6 | sim | a criar |
| `projeto-gerado-confiavel` | W7 + W8 | talvez | a criar |
| `drift-sentinel` (existente) | W9 | sim | atualizar |
| `llm-contexto-e-sessoes` | W10 | não | a criar |
| `llm-benchmark-recomendacao` | W11 | não | a criar |
| `llm-adaptador-claude` | W12 | sim | a criar |

## Fora de escopo desta rodada

- Reescrita do help/onboarding como TUI interativa (só camadas de texto agora).
- Failover automático entre modelos ou chamada direta a APIs sem ADR (contrato proíbe no MVP).
- Habilitar manutenção autônoma (ADR-0079 mantém como prontidão arquitetural, não habilitação).
- Editar `projects/` (off-limits) ou os relatórios de `docs/archive/`.
