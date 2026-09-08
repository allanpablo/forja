# Tasks: forja-status-caminho-feliz

- **Spec**: ./spec.md
- **Plan**: ./plan.md
- **Status**: approved
- **Criado em**: 2026-09-07

> Decomposição executável. Cada task tem dono, critério de done e paths.

Grafo de dependência:

```
T1 ─┐
T2 ─┤
T3 ─┼─ T5 ─┬─ T7 ─┬─ T9
T4 ─┘      └─ T6 ─┘   │
T1,T2,T7 ─────► T8 ───┤
T7,T8 ────────► T10 ──┤
todas ────────────────► T11
```

Paralelizável no início: **T1 · T2 · T3 · T4**.

---

## T1 — `lib/specs-index.ts` (extrair `listSpecs`)
- **Owner**: Worker · **Est**: P · **Depende de**: —
- **Paths**: `lib/specs-index.ts` (novo), `scripts/hook-session-start.ts`
- **Escopo**: mover `listSpecs()` de `hook-session-start.ts` para `lib/specs-index.ts`
  (`export function listSpecs(root: string): { slug: string; status: string }[]`); o hook passa a
  importar de lá. Sem mudança de comportamento do hook.
- **Done**:
  - [ ] `hook-session-start` importa de `lib/specs-index`; nenhuma lógica de parsing duplicada
  - [ ] `tsc --noEmit` verde; `node --test test/*.test.js` sem regressão no hook

## T2 — `lib/handoffs-index.ts` (extrair `openHandoffs`)
- **Owner**: Worker · **Est**: P · **Depende de**: —
- **Paths**: `lib/handoffs-index.ts` (novo), `scripts/hook-session-start.ts`
- **Escopo**: mover `openHandoffs()` (query SQLite readonly, `try/catch` → `[]`) para
  `lib/handoffs-index.ts`; o hook reimporta. Assinatura:
  `openHandoffs(): { id; from; to; intent; slug }[]` (normaliza `from_agent`/`to_agent`/`spec_slug`).
- **Done**:
  - [ ] hook usa `lib/handoffs-index`; degrada para `[]` sem `node_modules`/sem banco
  - [ ] `tsc` + testes verdes

## T3 — `lib/sprint-index.ts` (`readSprint`)
- **Owner**: Worker · **Est**: P · **Depende de**: —
- **Paths**: `lib/sprint-index.ts` (novo)
- **Escopo**: `readSprint(root): { active: boolean; title: string | null; items: number } | null`
  lendo `memory/40-delivery/current-sprint.md` (existe? primeira `# `/`## ` como título; conta
  itens de checklist). Espelha o que `showStatus` de `sprint-manager.ts` lê — **não** importa
  aquele script (ele só imprime).
- **Done**:
  - [ ] retorna `null` quando o arquivo não existe; `{active:true,...}` quando existe
  - [ ] `tsc` verde

## T4 — `lib/orchestrate.ts` — `listRuns()`
- **Owner**: Worker · **Est**: P · **Depende de**: —
- **Paths**: `lib/orchestrate.ts`
- **Escopo**: `export function listRuns(root: string, env?: OrchestrateEnv): string[]` — glob
  `<root>/.context/orchestrate-*.json`, devolve os slugs. Restrito ao `contextDir` passado (não
  varre projetos gerados). `loadState` já é exportado.
- **Done**:
  - [ ] `listRuns` só enxerga `.context/` do root dado; array vazio quando não há corrida
  - [ ] testes existentes de `lib/orchestrate` verdes

## T5 — `lib/status-model.ts` — `collectStatus()`
- **Owner**: Worker · **Est**: M · **Depende de**: T1, T2, T3, T4
- **Paths**: `lib/status-model.ts` (novo)
- **Escopo**: `collectStatus(root, opts?): StatusModel` (contrato no plan §4). Cada coletor em
  `try/catch` → `{ available: false, reason }`. `workspace` ← `getWorkspaceInfo()`; `sprint` ←
  `readSprint`; `orchestrate` ← `listRuns` + `loadState` (deriva `openStage`, `lastVerdict`,
  `concluded`); `specs` ← `listSpecs`; `recentRuns` ← tail (≤5) de
  `<contextDir>/forja-runs.jsonl` (`getWorkspaceContextDir()` ou `.context/` do repo); `handoffs`
  ← `openHandoffs`. **Nunca lança.**
- **Done**:
  - [ ] num WS temporário vazio → 6 chaves presentes, subsistemas sem fonte → `available:false` com `reason`
  - [ ] num WS real → seções preenchidas
  - [ ] teste unitário de `collectStatus` (sem spawn)

## T6 — `lib/status-model.ts` — `recommendNext()` (escada AC-4)
- **Owner**: Worker · **Est**: P · **Depende de**: T5 (tipos)
- **Paths**: `lib/status-model.ts`
- **Escopo**: função **pura** `recommendNext(model): { action, command, reason }` implementando os
  7 níveis da AC-4, na ordem. Determinística.
- **Done**:
  - [ ] teste cobrindo os 7 ramos (workspace ausente; memória crua; corrida gate vermelho; corrida
        etapa pronta; spec approved sem plan; plan approved sem tasks; spec implementing; nada pendente)
  - [ ] empates impossíveis (a ordem resolve)

## T7 — `scripts/forja-status.ts` (render `status` + `next`)
- **Owner**: Worker · **Est**: M · **Depende de**: T5, T6
- **Paths**: `scripts/forja-status.ts` (novo)
- **Escopo**: dispatch por `args[0]` (`status` | `next`); flag `--json`. `status` texto → seções
  rotuladas (seção em erro → `indisponível: <reason>`); `status --json` → `{ status:"ok", ...model }`.
  `next` texto → 1 linha `→ forja <cmd> …` + `reason`; `next --json` → `{ action, command, reason }`.
  Exit 0 sempre que o model montou.
- **Done**:
  - [ ] `forja status` e `forja status --json` rodam num repo real, exit 0
  - [ ] `forja next` imprime exatamente uma recomendação
  - [ ] nenhuma saída com stack trace

## T8 — Registry: `status`/`next` + reordenar `orchestrate`
- **Owner**: Worker · **Est**: P · **Depende de**: T1, T2, T7
- **Paths**: `lib/core/registry.ts`, `scripts/hook-session-start.ts`
- **Escopo**: entradas `status` e `next` → `node: 'scripts/forja-status.ts'`, `args: ['status']` /
  `['next']`, `domain: 'gsd'`, `tier: 'core'`, `readonly: true`, `json: true`, `usage`/`examples`/
  `next`, sem gate bloqueante (`workspace-warn` no máximo). Mover os 3 `orchestrate*` para o
  início do bloco `gsd` no objeto `COMMANDS` (ordem = ordem no `forja help`). Confirmar que o hook
  já importa de `lib/` (T1/T2).
- **Done**:
  - [ ] `forja help` (núcleo) lista `status`, `next`; `orchestrate` aparece antes de `gsd:*`
  - [ ] `forja help status` mostra uso + exemplo
  - [ ] `test/forja-core.test.js` (integridade do registry) verde

## T9 — Testes (AC-8) + regressão do hook
- **Owner**: Worker · **Est**: M · **Depende de**: T5, T6, T7, T8
- **Paths**: `test/forja-status.test.js` (novo), `test/` do hook se existir
- **Escopo**: `forja status --json` em WS temporário vazio → 6 chaves + `status:"ok"` + subs
  `available:false`; `forja next --json` no mesmo → `action ∈ {setup, sync}`; fixture de spec
  `approved` sem `plan.md` → `forja next` aponta `spec:plan <slug>`. Garantir que o
  `hook-session-start` continua produzindo o mesmo `<framework-status>` após T1/T2.
- **Done**:
  - [ ] `node --test test/forja-status.test.js` verde
  - [ ] teste do hook (ou smoke `node scripts/hook-session-start.ts`) sem regressão

## T10 — Documentação + CHANGELOG
- **Owner**: Worker · **Est**: P · **Depende de**: T7, T8
- **Paths**: `README.md`, `docs/cli-first-operacao.md`, `docs/quick-reference.md`, `CHANGELOG.md`
- **Escopo**: `README.md` ganha uma linha com `orchestrate` como caminho padrão + menção a
  `forja next`. `docs/cli-first-operacao.md` e `quick-reference.md`: `forja status` / `forja next`
  no bloco "Descoberta pela própria CLI". CHANGELOG `[Unreleased]`: Adicionado (`forja status`,
  `forja next`); Alterado (`orchestrate` no topo do bloco GSD do help).
- **Done**:
  - [ ] `forja tools:doctor` → `docs-commands`, `commands-documented`, `docs-links` verdes

## T11 — Validação final + fecho
- **Owner**: Worker → Governance · **Est**: P · **Depende de**: T1–T10
- **Escopo**: bateria completa; atualizar `spec.md` §Evidências (resultado, data, desvios se
  houver); mover status. Registrar handoff `review` via Hermes.
- **Done**:
  - [ ] `tsc --noEmit`, `node --test test/*.test.js`, `forja spec:check`, `forja project:check` verdes — AC-9
  - [ ] `forja spec:set-status forja-status-caminho-feliz spec implementing` no início; `done` ao fim
  - [ ] handoff `worker → governance (review)` registrado

---

## Mapa AC → task

| AC | Tasks | Verificação-chave |
|---|---|---|
| AC-1 | T5, T7 | `forja status` — 6 seções rotuladas |
| AC-2 | T5, T7, T9 | `forja status --json` — 6 chaves + `status:"ok"`, subs `available:false` |
| AC-3 | T6, T7 | `forja next` — 1 linha `→ forja …`; `--json` → `{action,command,reason}` |
| AC-4 | T6, T9 | testes dos 7 ramos de `recommendNext` |
| AC-5 | T8 | registry `readonly:true`, sem gate `workspace`; `forja next` não escreve estado |
| AC-6 | T8 | `forja help` lista `status`/`next`; `orchestrate` no topo do bloco GSD |
| AC-7 | T1, T2, T4 | hook importa de `lib/specs-index`, `lib/handoffs-index`; corrida via `loadState`/`listRuns` |
| AC-8 | T9 | `node --test test/forja-status.test.js` |
| AC-9 | T11 | bateria completa verde |

## Handoffs entre agentes

SDD Architect (spec+plan+tasks, feito) → **Worker** (T1–T10) → **Governance** (T11 + `project:check`).

```bash
node bin/forja.ts hermes:handoff '{"from":"sdd-architect","to":"worker","intent":"implement","context":"SPEC-044 forja-status-caminho-feliz, branch feat/forja-status (empilhada sobre feat/cli-intuitiva-v1)","acceptance":"AC-1..AC-9 + bateria verde","constraints":"read-only, sem ADR, sem mudar comando existente; depende de SPEC-043","return":"diff + parecer"}'
```

## Evidências e estado real

- Nada executado — todas as caixas `[ ]` abertas.
- **Dependência viva**: `feat/cli-intuitiva-v1` (PR #61). Se #61 mudar `forja setup` ou os campos
  do registry, revisar T5/T8.
- **Hipótese, não medição**: métricas de §8 da spec dependem de instrumentação inexistente.
