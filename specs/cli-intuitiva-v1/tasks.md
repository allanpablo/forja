# Tasks: cli-intuitiva-v1

- **Spec**: ./spec.md
- **Plan**: ./plan.md
- **Status**: approved
- **Criado em**: 2026-09-07

> Decomposição executável. Cada task tem dono claro, critério de done e referência a arquivos.

Convenção de IDs: `T1`, `T2`, … Sequência = ordem padrão. Paralelizável onde indicado.

Grafo de dependência:

```
T1 ─┬─ T2 ─┬─ T3 ── T4 ─┐
    │      ├─ T6 ────────┤
    │      └────────────►T10
    ├─ T5 ──────────────►T10
    ├─ T7 ── T8          │
    └─ T9 ───────────────┤
T3,T4,T9 ─► T11          │
todas ───────────────────►T12
```

Paralelizável após T1: **T2 · T5 · T7 · T9**.

---

## T1 — Campos opcionais no tipo do registry + retrocompat
- **Owner**: Worker
- **Estimativa**: P
- **Depende de**: —
- **Paths**: `lib/core/registry.ts`, `test/forja-core.test.js`
- **Escopo**: adicionar `type CommandArg = { name; required; desc }` e os campos **opcionais**
  ao tipo do comando: `usage?`, `cliArgs?`, `examples?`, `next?`, `spec?`, `readonly?`, `json?`,
  `tier?: 'core'|'advanced'`. Nenhum valor preenchido ainda. Sem mudança de comportamento.
- **Done quando**:
  - [ ] `tsc --noEmit` verde
  - [ ] teste novo: comando sem nenhum campo novo resolve e executa (retrocompat) — AC-1
  - [ ] `node --test test/*.test.js` verde (473 → 474+)

## T2 — Preencher os 14 comandos do núcleo
- **Owner**: Worker
- **Estimativa**: M
- **Depende de**: T1
- **Paths**: `lib/core/registry.ts`
- **Escopo**: nos 14 comandos do núcleo (plan §D4: `workspace:init`, `project:new`, `spec:new`,
  `spec:plan`, `spec:tasks`, `spec:check`, `orchestrate`, `orchestrate:status`,
  `orchestrate:advance`, `context:smart`, `query:universal`, `tools:doctor`, `project:check`,
  `engineer`) definir `tier:'core'`, `usage`, `cliArgs` (quando houver posicional), ≥1 `example`
  (começa com `forja `, cita comando do registry), `next`. Mover `(SPEC-0XX)` de `desc` → `spec`.
- **Done quando**:
  - [ ] 14 comandos com `tier:'core'` + `usage` + ≥1 `example` — AC-1
  - [ ] nenhuma `desc` do núcleo contém `(SPEC-`
  - [ ] `node --test test/*.test.js` + `tsc --noEmit` verdes

## T3 — `printHelp()` em camadas + `forja help --all`
- **Owner**: Worker
- **Estimativa**: P
- **Depende de**: T2
- **Paths**: `bin/forja.ts`
- **Escopo**: default = só `tier:'core'`, agrupado por domínio, **sem** sufixo `(SPEC-`, com
  rodapé `use 'forja help --all' para os N comandos restantes`. `forja help --all` = saída atual
  completa. Ajustar o teste `help: sem args lista domínios` para verificar `--all` (a lista curta
  não cobre os domínios `design`/`llm`/`geracao`).
- **Done quando**:
  - [ ] `forja help --all` diff vs. baseline atual = apenas remoção de `(SPEC-` nas `desc` do núcleo — AC-3
  - [ ] `forja help` mostra só núcleo + rodapé com contagem correta
  - [ ] testes de help verdes

## T4 — `printCommandHelp()` + branch `help <cmd>`
- **Owner**: Worker
- **Estimativa**: M
- **Depende de**: T2, T3
- **Paths**: `bin/forja.ts`
- **Escopo**: `forja help <cmd>` imprime nome, domínio, `desc`, `usage`, tabela de `cliArgs`,
  `examples`, "Próximos passos" (`next`), e `spec` (origem SPEC/ADR) quando houver. `<cmd>`
  inexistente → `suggest()` + exit 1. Sem `--json` nesta spec.
- **Done quando**:
  - [ ] `forja help spec:new` mostra `usage` + ≥1 exemplo + próximos passos — AC-2
  - [ ] `forja help xpto` → exit 1 com sugestão
  - [ ] `forja help` (sem cmd) e `forja help --all` seguem funcionando

## T5 — `suggest()` fuzzy + mensagens de erro acionáveis
- **Owner**: Worker
- **Estimativa**: P
- **Depende de**: — (paralelo a T2–T4)
- **Paths**: `bin/forja.ts` (+ helper Levenshtein inline, ~15 linhas DP — plan §D3)
- **Escopo**: `suggest()` casa por substring **e** distância de edição ≤ 2 sobre o **nome
  completo**; ordena (substring exato → menor distância); teto 5. Mensagem de comando
  desconhecido termina com `forja help <melhor-palpite>`.
- **Done quando**:
  - [ ] `suggest('plan')` inclui `spec:plan` — AC-4
  - [ ] `forja plan` → stderr contém `forja help spec:plan`, exit 1, sem stack trace
  - [ ] teste existente "comando desconhecido: exit 1 com sugestão" verde

## T6 — Pré-validação de `cliArgs` required antes do spawn
- **Owner**: Worker
- **Estimativa**: P
- **Depende de**: T1, T2
- **Paths**: `bin/forja.ts`
- **Escopo**: antes de `spawnSync`, se `cmd.cliArgs` tem entrada `required:true` sem posicional
  correspondente em `rest` (contar posicionais, ignorar `--flags` e seus valores), imprimir
  `cmd.usage` em stderr, exit 1, **sem spawnar**. Auditar como hoje (`exitCode: 1`).
- **Done quando**:
  - [ ] `forja spec:new` (sem slug) → imprime `usage`, exit 1, stderr sem stack trace do filho — AC-5
  - [ ] `forja spec:new foo` executa normalmente
  - [ ] comandos sem `cliArgs` inalterados

## T7 — `bucket` nos checks de `lib/core/health.ts`
- **Owner**: Worker
- **Estimativa**: P
- **Depende de**: — (paralelo)
- **Paths**: `lib/core/health.ts`
- **Escopo**: cada check declara `bucket: 'blocking' | 'first-run' | 'optional'`. Classificação:
  `native-abi`, `node-engines`, `runtime-deps`, `mcp-json`, `docs-commands`,
  `commands-documented`, `docs-links`, `adr-refs`, `agent-topology` → **blocking**;
  `memory-db` (não indexado), `memory-fresh`, `workspace` → **first-run**;
  ferramentas ADR-0018 (`codegraph`, `gitleaks`, …) → **optional**. `runChecks`/`worstStatus` e
  o exit-code do gate **inalterados**.
- **Done quando**:
  - [ ] todo check tem `bucket` — AC-7 (base)
  - [ ] `tsc --noEmit` + testes de health existentes verdes

## T8 — Render em 3 blocos: `tools:doctor` + hook SessionStart
- **Owner**: Worker
- **Estimativa**: M
- **Depende de**: T7
- **Paths**: `scripts/tools-doctor.ts`, `scripts/hook-session-start.ts`
- **Escopo**: agrupar a saída pelos 3 rótulos fixos — **"Bloqueia o fluxo"**, **"Rotina de
  primeiro uso"**, **"Opcional (ferramentas)"**. O bloco first-run cita `forja setup` como
  correção. Exit code do doctor inalterado. O hook SessionStart usa a mesma classificação no
  bloco `<framework-status>`.
- **Done quando**:
  - [ ] `forja tools:doctor` mostra os 3 rótulos; em clone novo, `workspace`/`memory-db` sob "Rotina de primeiro uso" — AC-7
  - [ ] exit 0 "com ressalvas" preservado; falha crítica ainda exit 1
  - [ ] `hook-session-start` renderiza os 3 buckets

## T9 — `forja setup`
- **Owner**: Worker
- **Estimativa**: M
- **Depende de**: T1
- **Paths**: `scripts/forja-setup.ts` (**novo**), `lib/core/registry.ts` (entrada `setup`)
- **Escopo**: allowlist **fixa e hard-coded** `['workspace:init', 'sync:universal']`, em ordem.
  Sem `--yes` + TTY → confirmação `[s/N]`. Sem `--yes` + stdin não-TTY → aborta exit 1, **nada
  executado**. Cada passo auditado em `forja-runs.jsonl`. Idempotente. Entrada no registry:
  domínio `workspace`, `tier:'core'`, `readonly:false`, `usage`/`examples`/`next`.
- **Done quando**:
  - [ ] `forja setup --yes` em `FORJA_WORKSPACE` temporário limpo → estrutura criada + índice, exit 0 — AC-6
  - [ ] 2ª execução → exit 0 (idempotente)
  - [ ] sem `--yes` e stdin não-TTY → exit 1, `getWorkspaceInfo().exists` inalterado
  - [ ] `forja help` (core) lista `setup`

## T10 — Testes AC-8 em `forja-core.test.js`
- **Owner**: Worker
- **Estimativa**: P
- **Depende de**: T2, T4, T5, T6
- **Paths**: `test/forja-core.test.js`
- **Escopo**: (a) todo `tier:'core'` tem `usage` não-vazio e ≥ 1 `example`; (b) todo `example`
  começa com `forja ` e o 2º token existe em `COMMANDS`; (c) `suggest('plan')` inclui
  `spec:plan`; ajustar o teste de domínios para `--all`.
- **Done quando**:
  - [ ] `node --test test/forja-core.test.js` verde — AC-8
  - [ ] falha proposital (remover um `usage` do núcleo) faz o teste (a) quebrar

## T11 — Documentação + CHANGELOG
- **Owner**: Worker
- **Estimativa**: P
- **Depende de**: T3, T4, T9
- **Paths**: `docs/quick-reference.md`, `docs/cli-first-operacao.md`, `DOC-MAP.md`, `CHANGELOG.md`
- **Escopo**: documentar `forja help <cmd>`, `forja help --all`, `forja setup`. Entrada no
  CHANGELOG (Adicionado: help em camadas, `help <cmd>`, `forja setup`; Alterado: saída de
  `tools:doctor` em 3 blocos — aditivo).
- **Done quando**:
  - [ ] `forja tools:doctor` → `docs-commands`, `commands-documented`, `docs-links` verdes
  - [ ] CHANGELOG atualizado

## T12 — Validação final + fecho de contrato
- **Owner**: Worker → Governance
- **Estimativa**: P
- **Depende de**: T1–T11
- **Escopo**: rodar a bateria; atualizar `spec.md` §Evidências com as 2 mudanças de contrato
  (D1 `args`→`cliArgs`; D2 `tools:doctor --fix`→`forja setup`); mover status.
- **Done quando**:
  - [ ] `node --test test/*.test.js`, `tsc --noEmit`, `node bin/forja.ts spec:check` verdes — AC-9
  - [ ] `spec.md` §Evidências registra D1 e D2
  - [ ] `spec:set-status … spec implementing` no início da execução; `done` ao fim

---

## Mapa AC → task

| AC | Tasks | Verificação-chave |
|---|---|---|
| AC-1 | T1, T2 | `tsc --noEmit`; teste de retrocompat |
| AC-2 | T4 | `forja help spec:new`; `forja help xpto` exit 1 |
| AC-3 | T2, T3 | diff `forja help --all` vs baseline; rodapé em `forja help` |
| AC-4 | T5 | `suggest('plan') ∋ spec:plan`; `forja plan` → `forja help spec:plan` |
| AC-5 | T6 | `forja spec:new` sem slug → usage, exit 1, sem stack |
| AC-6 | T9 | `forja setup --yes` em WS limpo; não-TTY sem `--yes` aborta |
| AC-7 | T7, T8 | `tools:doctor` com 3 rótulos; hook SessionStart idem |
| AC-8 | T10 | `node --test test/forja-core.test.js` |
| AC-9 | T12 | bateria completa verde |

## Handoffs entre agentes

Cadeia: SDD Architect (spec+plan+tasks, feito) → **Worker** (implement, T1–T11) → **Governance**
(review, T12 + `project:check`). Registrar via core:

```bash
node bin/forja.ts hermes:handoff implement cli-intuitiva-v1
# ao fim:
node bin/forja.ts hermes:handoff review cli-intuitiva-v1
```

## Evidências e estado real

- Cada task declara o comando/observação que verifica seu AC (tabela acima).
- **Hipótese, não medição**: as métricas de §8 da spec dependem de instrumentação inexistente;
  baseline sobre `forja-runs.jsonl` antes de qualquer percentual.
- **Mudanças de contrato pendentes de registro na spec** (T12): D1 (`args`→`cliArgs`),
  D2 (`tools:doctor --fix`→`forja setup`).
- **Fora de escopo** (herdado): bug de alocação de ID do `spec:new` (achado A9 do roadmap).
- Nada aqui foi executado ainda — todas as caixas `[ ]` abertas.
