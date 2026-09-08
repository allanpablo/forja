# Tasks: contrato-saida-cli

- **Spec**: ./spec.md
- **Plan**: ./plan.md
- **Status**: approved
- **Criado em**: 2026-09-08

> Decomposição executável. Cada task tem dono, critério de done e paths.

Grafo de dependência:

```
T1 ─┐
T2 ─┤
T3 ─┼─ T5 ─┬─ T4 ─┬─ T7 ─┐
    └─ T6 ─┘      │       │
T8 ─────────────────────► T9
todas ─────────────────► T9
```

Paralelizável no início: **T1 · T2 · T3 · T8**.

---

## T1 — ADR-0082
- **Owner**: SDD Architect · **Est**: P · **Depende de**: —
- **Paths**: `memory/90-decisions/0082-contrato-saida-cli.md`
- **Escopo**: registrar o contrato — chave `status` (`ok`|`error`|`rejected`), tabela de exit
  codes (0/1/2/127), regra "stdout = um objeto JSON, diagnóstico no stderr", natureza **aditiva e
  incremental** (só rege quem opta por `json: true`). Documentar as duas quebras: `token:economy
  --json` (array → objeto) e `simulate` discard (exit 1 → 2). Status `accepted`.
- **Done**:
  - [ ] ADR existe; `forja tools:doctor` → `adr-refs` verde (78 ADRs)

## T2 — `docs/contrato-saida-cli.md` + DOC-MAP
- **Owner**: SDD Architect · **Est**: P · **Depende de**: —
- **Paths**: `docs/contrato-saida-cli.md` (novo), `DOC-MAP.md`, `docs/llm-fit-loop.md`
- **Escopo**: o contrato para quem escreve script e para quem consome, com exemplos de cada
  `status` e do exit code. Linha no `DOC-MAP.md` (tabela por tópico). Nota em `llm-fit-loop.md`
  apontando o doc novo (o contrato de `llm:run` é o caso de referência).
- **Done**:
  - [ ] `forja tools:doctor` → `docs-links`, `docs-commands`, `commands-documented` verdes

## T3 — `lib/cli-output.ts`
- **Owner**: Worker · **Est**: P · **Depende de**: —
- **Paths**: `lib/cli-output.ts` (novo), `test/cli-output.test.js` (novo)
- **Escopo**: `emitOk(fields?)`, `emitError(message, { code?, detail? })`, `emitRejected(fields?)`
  (contrato no plan §4). Cada uma: `console.log(JSON.stringify({ status, ...fields }))` no stdout,
  `detail` (se houver) no stderr, `process.exit(0|1|2)`. Sem cor, sem prompt.
- **Done**:
  - [ ] testes unitários: cada função → objeto com `status` correto, exit code correto, stdout com
        exatamente uma linha JSON
  - [ ] `tsc --noEmit` verde

## T4 — Registry: `json: true` no conjunto + `--json` no help
- **Owner**: Worker · **Est**: P · **Depende de**: T5, T6
- **Paths**: `lib/core/registry.ts`
- **Escopo**: `json: true` em `status`, `next`, `spec:check`, `tools:doctor`, `engineer`,
  `simulate`, `cost:economy`, `token:economy`. Garantir que `usage` ou um `example` de cada um
  cita `--json`.
- **Done**:
  - [ ] `forja help spec:check` (e os demais) mostram `--json`
  - [ ] `test/forja-core.test.js` verde

## T5 — Conformar os que já têm `--json`
- **Owner**: Worker · **Est**: M · **Depende de**: T3
- **Paths**: `scripts/forja-status.ts`, `scripts/engineer.ts`, `scripts/simulate.ts`,
  `scripts/cost-economy.ts`, `scripts/token-economy.ts`
- **Escopo**:
  - `forja-status.ts` — trocar os `console.log(JSON.stringify(...))` por `emitOk` (forma já OK).
  - `engineer.ts` — `--json` → `emitOk({ ...report })`; erro de arg → `emitError`.
  - `simulate.ts` — caminho normal → `emitOk`; **recommendation `discard` → `emitRejected` (exit
    2)**; erro de arg → `emitError`.
  - `cost-economy.ts` — mover os `console.log` de aviso para **stderr**; `--json` → `emitOk`.
  - `token-economy.ts` — `--json` **deixa de emitir array cru** → `emitOk({ rows: [...] })`.
  - Nenhuma mudança na saída **sem** `--json`.
- **Done**:
  - [ ] cada um, com `--json`, emite um objeto com `status`
  - [ ] `simulate` com ref cujo teste falha → exit 2, `status:"rejected"`
  - [ ] snapshot da saída default (sem `--json`) inalterada

## T6 — Adicionar `--json` a `spec:check` e `tools:doctor`
- **Owner**: Worker · **Est**: M · **Depende de**: T3
- **Paths**: `scripts/spec-cli.ts`, `scripts/tools-doctor.ts`
- **Escopo**:
  - `spec-cli.ts` (`check`) — `--json` → `emitOk({ features: [{ slug, spec, plan, tasks }] })`;
    sem `--json`, saída atual.
  - `tools-doctor.ts` — `--json` → `emitOk`/`emitError({ core: [...], tools: [...] })` a partir do
    que `runChecks` já devolve (id, status, detail, fix, bucket) + a detecção de ferramentas;
    falha crítica do núcleo → `status:"error"` + exit 1 (preserva o gate); sem `--json`, os 3
    blocos de texto de hoje. **Não** tocar `runChecks`/`worstStatus`.
- **Done**:
  - [ ] `forja spec:check --json` e `forja tools:doctor --json` emitem objeto com `status`
  - [ ] `forja tools:doctor` (texto) inalterado; exit-code do gate preservado (núcleo quebrado → 1)

## T7 — `test/cli-output-contract.test.js`
- **Owner**: Worker · **Est**: M · **Depende de**: T4, T5, T6
- **Paths**: `test/cli-output-contract.test.js` (novo)
- **Escopo**: para cada comando `json: true` no registry, num `FORJA_WORKSPACE` temporário com
  fixtures mínimas: (a) roda com `--json` + args válidos → stdout é **um** JSON parseável, objeto,
  `status ∈ {ok, error, rejected}`; (b) exit code casa com `status` (ok→0, error→1, rejected→2);
  (c) com args inválidos → `status:"error"` + exit 1. Itera o registry, não uma lista hardcoded.
- **Done**:
  - [ ] `node --test test/cli-output-contract.test.js` verde
  - [ ] remover `json:true` de um comando não-conforme faria o teste apontá-lo (checagem manual)

## T8 — Tabela de exit codes em `bin/forja.ts`
- **Owner**: Worker · **Est**: P · **Depende de**: —
- **Paths**: `bin/forja.ts`
- **Escopo**: bloco de comentário com a tabela (0/1/2/127) junto ao dispatch e à auditoria.
  Confirmar que exit 2 do filho passa direto (`result.status ?? 1` já faz). **Sem** mudança de
  comportamento.
- **Done**:
  - [ ] comentário presente; `test/forja-core.test.js` verde; `simulate` discard → `forja
        simulate` sai 2

## T9 — CHANGELOG + validação final + fecho
- **Owner**: Worker → Governance · **Est**: P · **Depende de**: T1–T8
- **Paths**: `CHANGELOG.md`, `specs/contrato-saida-cli/spec.md`
- **Escopo**: `[Unreleased]` — Adicionado (contrato, `--json` em `spec:check`/`tools:doctor`,
  `lib/cli-output.ts`); **Alterado (breaking, só `--json`)**: `token:economy` array→objeto,
  `simulate` discard exit 1→2. Atualizar `spec.md` §Evidências. Mover status. Handoff `review`.
- **Done**:
  - [ ] `tsc --noEmit`, `node --test test/*.test.js`, `forja spec:check`, `forja project:check` verdes — AC-9
  - [ ] `spec:set-status contrato-saida-cli spec implementing` no início; handoff `worker →
        governance (review)` registrado ao fim

---

## Mapa AC → task

| AC | Tasks | Verificação-chave |
|---|---|---|
| AC-1 | T1 | ADR-0082, `adr-refs` verde |
| AC-2 | T2 | doc + DOC-MAP; `docs-*` verdes |
| AC-3 | T3 | `lib/cli-output.ts` + testes das 3 funções |
| AC-4 | T8 | comentário da tabela em `bin/forja.ts` |
| AC-5 | T4, T5, T6 | registry `json:true` no conjunto |
| AC-6 | T7 | `test/cli-output-contract.test.js` |
| AC-7 | T5, T6 | `token:economy --json`→objeto; `simulate` discard→exit 2; default inalterada |
| AC-8 | T4 | `--json` no `usage`/`examples` dos `json:true` |
| AC-9 | T9 | bateria completa verde |

## Handoffs entre agentes

SDD Architect (spec+plan+tasks + ADR-0082 na T1) → **Worker** (T3–T8) → **Governance** (T9 +
`project:check`). Registrar via Hermes no início da implementação.

## Evidências e estado real

- Nada executado — caixas `[ ]` abertas.
- **Dependência viva**: `feat/forja-status` (PR #62) e, por baixo, `feat/cli-intuitiva-v1` (#61).
- **Quebras deliberadas** (ADR-0082 + CHANGELOG): `token:economy --json`, `simulate` discard exit.
