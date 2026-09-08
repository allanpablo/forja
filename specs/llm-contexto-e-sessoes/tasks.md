# Tasks: llm-contexto-e-sessoes

- **Spec**: ./spec.md
- **Plan**: ./plan.md
- **Status**: approved
- **Criado em**: 2026-09-08

> Decomposição executável. Cada task tem dono, critério de done e paths.

Grafo de dependência:

```
T1 ─┐
T2 ─┼─ T3 ─┐
T1 ─── T4 ─┼─ T5 ─┐
           │      ├─ T6 ─ T7
T3,T5 ─────┘      │
todas ───────────────► T7
```

Paralelizável no início: **T1 · T2**.

---

## T1 — `LlmSessionStore.all()` + `find(id)`
- **Owner**: Worker · **Est**: P · **Depende de**: —
- **Paths**: `lib/llm/session.ts`
- **Escopo**: `all(): readonly LlmSession[]` = `repository.list<LlmSession>('llm_session')` ordenado
  por `updatedAt` desc. `find(id): LlmSession | undefined` = `repository.get<LlmSession>('llm_session', id)`,
  **sem** `assertBinding` (leitura pura). `require`/`save` inalterados.
- **Done**:
  - [ ] `tsc --noEmit` verde
  - [ ] teste unitário: `all()` devolve semeados em ordem desc; `find` acha e devolve `undefined` p/ id ausente

## T2 — `buildEngineerBlock(objective, opts?)`
- **Owner**: Worker · **Est**: M · **Depende de**: —
- **Paths**: `lib/llm/context.ts`
- **Escopo**: `buildEngineerBlock(objective, { cwd?, run? })` — `run` default = spawna
  `node <forjaBin> engineer "<objective>" --json` (cwd), captura `{ code, stdout, stderr }`. `code
  ≠ 0` → `throw` de um `Error` com `.code = 'ENGINEER_FAILED'` e `.detail` = 1ª linha do stderr.
  `code 0` → `JSON.parse(stdout)` e devolve `{ text, ref }` onde `text` é um bloco rotulado
  (`=== Contexto do engineer (objetivo: <obj>) ===\n<JSON compacto>`) e `ref = "engineer:<obj>"`.
  `run` injetável para teste.
- **Done**:
  - [ ] teste: `run` fake code 0 → `{ text, ref }` com o JSON embutido
  - [ ] teste: `run` fake code 1 → lança `Error` com `.code === 'ENGINEER_FAILED'`

## T3 — `llm:run --engineer`
- **Owner**: Worker · **Est**: M · **Depende de**: T2
- **Paths**: `scripts/llm-fit.ts`
- **Escopo**: `run()`: `--engineer` entra na allowlist de flags e não pode repetir. Se presente:
  `const eng = buildEngineerBlock(obj)` dentro de try/catch — no catch com `.code ===
  'ENGINEER_FAILED'` imprime `JSON.stringify({ profile: name, errorCode: 'ENGINEER_FAILED',
  stderr: err.detail })` e `process.exit(1)` **antes** de `runLlm`. Sucesso: `prompt = eng.text +
  '\n\n' + prompt`; `refs` (linha do `recorder.record`) ganha `eng.ref`. Se `--engineer` sem
  `--prompt`/`--task`, o `<obj>` é o prompt.
- **Done**:
  - [ ] `llm:run --engineer` (com adapter fixture) → observação com `contextRefs` contendo `engineer:<obj>`; `inputHash` muda vs. sem `--engineer`
  - [ ] `engineer` fixture que sai 1 → `ENGINEER_FAILED`, exit 1, adapter LLM **não** chamado
  - [ ] `llm:run` sem `--engineer` → saída byte-idêntica à de antes (snapshot)

## T4 — `cmdSessions()` (list | show)
- **Owner**: Worker · **Est**: M · **Depende de**: T1
- **Paths**: `scripts/llm-fit.ts`
- **Escopo**: `main()` ganha `else if (command === 'sessions') cmdSessions()`. `cmdSessions` parseia
  `argv[3]` (`list`|`show`), `argv[4]` (id p/ show), `--json` em qualquer posição — **não** usa
  `flags()`. `list`: `store.all()` → tabela (`id  projeto(basename cwd)  updatedAt  obs`) ou array
  `--json`. `show <id>`: `store.find(id)` (ausente → stderr + `process.exit(1)`); + observação por
  `observationStore.list().find(o => o.id === session.observationId)`; + `repository.get('llm_validation',
  session.observationId)`; monta `{ session, observation?, validation? }` com fallback `null`.
- **Done**:
  - [ ] `forja llm:sessions list` e `--json` num workspace com sessões semeadas
  - [ ] `forja llm:sessions show <id>` mostra sessão + observação; `show <id-ruim>` → exit 1
  - [ ] nenhuma escrita (verificar: `forja_records` de `llm_session` inalterado após os comandos)

## T5 — Registry
- **Owner**: Worker · **Est**: P · **Depende de**: T3, T4
- **Paths**: `lib/core/registry.ts`
- **Escopo**: `llm:run.desc` cita `--engineer`. Entrada `llm:sessions`: `domain: 'llm'`,
  `node: 'scripts/llm-fit.ts'`, `args: ['sessions']`, `gates: ['workspace']`, `readonly: true`,
  `json: true`, `usage: 'forja llm:sessions <list|show> [id] [--json]'`, `examples`.
- **Done**:
  - [ ] `forja llm:sessions` roteia; `test/forja-core.test.js` (integridade do registry) verde

## T6 — Documentação + CHANGELOG
- **Owner**: Worker · **Est**: P · **Depende de**: T3, T4, T5
- **Paths**: `docs/llm-fit-loop.md`, `docs/llm-evolution.md`, `CHANGELOG.md`
- **Escopo**: `llm-fit-loop.md` — subseções `--engineer` (com a nota de privacidade: relatório vai
  ao prompt e ao hash, não ao banco) e `llm:sessions`. `llm-evolution.md` — C2/C5 fecharam.
  CHANGELOG `[Unreleased]` — Adicionado.
- **Done**:
  - [ ] `forja tools:doctor` → `docs-commands`, `commands-documented`, `docs-links` verdes

## T7 — Validação final + fecho
- **Owner**: Worker → Governance · **Est**: P · **Depende de**: T1–T6
- **Paths**: `specs/llm-contexto-e-sessoes/spec.md`
- **Escopo**: bateria; `spec.md` §Evidências; mover status; handoff `review`.
- **Done**:
  - [ ] `tsc --noEmit`, `node --test test/*.test.js`, `forja spec:check`, `forja project:check` verdes — AC-9
  - [ ] testes de `llm:run`/sessão existentes verdes sem alteração
  - [ ] `spec:set-status llm-contexto-e-sessoes spec implementing` no início; handoff `review` ao fim

---

## Mapa AC → task

| AC | Tasks | Verificação-chave |
|---|---|---|
| AC-1 | T2, T3 | `llm:run --engineer` embute o bloco |
| AC-2 | T3 | `inputHash` cobre o bloco; `contextRefs` = `engineer:<obj>` |
| AC-3 | T2, T3 | `ENGINEER_FAILED` antes do provedor |
| AC-4 | T1, T4 | `llm:sessions list` |
| AC-5 | T1, T4 | `llm:sessions show <id>` |
| AC-6 | T4, T5 | read-only; `readonly:true` |
| AC-7 | T5, T6 | registry + `llm-fit-loop.md` |
| AC-8 | T1, T2 | `all/find`; `buildEngineerBlock` testável |
| AC-9 | T7 | bateria; testes existentes intactos |

## Handoffs entre agentes

SDD Architect (spec+plan+tasks) → **Worker** (T1–T6) → **Governance** (T7 + `project:check`).

## Evidências e estado real

- Nada executado — caixas `[ ]` abertas.
- **Sem dependência de branch** — de `main`; usa `forja engineer` (SPEC-035) e `llm_session` (ADR-0081).
- **Sem mudança de contrato** na saída do `llm:run` (só `errorCode: 'ENGINEER_FAILED'`, aditivo).
