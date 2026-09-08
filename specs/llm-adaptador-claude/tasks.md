# Tasks: llm-adaptador-claude

- **Spec**: ./spec.md
- **Plan**: ./plan.md
- **Status**: approved
- **Criado em**: 2026-09-08

```
T1 ─┐
T2 ─┼─ T3 ─ T4 ─ T5
```

Paralelizável: **T1 · T2**.

---

## T1 — `buildLlmExecution` claude + `RESUME_PROVIDERS`
- **Owner**: Worker · **Est**: M · **Depende de**: —
- **Paths**: `packages/llm/src/index.ts`, `lib/llm/session.ts`
- **Escopo**: `lib/llm/session.ts`: `export const RESUME_PROVIDERS = new Set(['codex', 'claude'])`;
  `require()` troca `profile.provider !== 'codex'` por `!RESUME_PROVIDERS.has(profile.provider)`.
  `packages/llm/src/index.ts`: guard de `resume` usa `!RESUME_PROVIDERS.has(profile.provider)`;
  ramo `claude` de `buildLlmExecution` →
  `[...base, ...(model!=='default'?['--model',model]:[]), '-p', prompt, '--output-format', 'json',
  ...(resume?['--resume', resume]:[])]`.
- **Done**:
  - [ ] `tsc --noEmit` verde
  - [ ] `buildLlmExecution(claudeProfile, 'x')` → argv com `--output-format json`, sem `--resume`
  - [ ] com `{ resume: '<uuid>' }` → argv com `--resume <uuid>`; provedor fora do set + resume → erro

## T2 — `lib/llm/claude-output.ts`
- **Owner**: Worker · **Est**: M · **Depende de**: —
- **Paths**: `lib/llm/claude-output.ts` (novo)
- **Escopo**: `normalizeClaudeResult(result): NormalizedLlmResult`. `JSON.parse(result.stdout)`
  (falha → `errorCode: 'INVALID_PROVIDER_OUTPUT'`, `stdout: ''`). Objeto: `stdout` ← `result`
  (string; ausente/não-string → `INVALID_PROVIDER_OUTPUT`); `sessionId` ← `session_id` se string;
  `usage` ← `{ inputTokens: usage.input_tokens, outputTokens: usage.output_tokens,
  cachedInputTokens: usage.cache_read_input_tokens? }` quando `usage` presente e válido;
  `is_error === true` ou `subtype` presente e `!== 'success'` → `errorCode: 'PROVIDER_FAILED'`.
  `exitCode` como no `normalizeCodexResult` (não-zero preservado; senão 1 se errorCode, senão 0).
- **Done**:
  - [ ] teste: `{type:'result',subtype:'success',result:'ok',session_id:'u-1',usage:{input_tokens:10,output_tokens:2}}` → `{stdout:'ok', sessionId:'u-1', usage:{inputTokens:10,outputTokens:2}, exitCode:0}`
  - [ ] `is_error:true` → `errorCode: 'PROVIDER_FAILED'`; `"não é json"` → `INVALID_PROVIDER_OUTPUT`

## T3 — `run()` + `doctor()` no `llm-fit.ts`
- **Owner**: Worker · **Est**: M · **Depende de**: T1, T2
- **Paths**: `scripts/llm-fit.ts`
- **Escopo**: `run()`: `let result = selected.provider === 'codex' ? normalizeCodexResult(raw) :
  selected.provider === 'claude' ? normalizeClaudeResult(raw) : raw`. A checagem de
  `SESSION_MISMATCH` (que hoje roda sempre) fica; `if (selected.provider === 'codex' && sessionId
  !== undefined)` para `sessions.save` → `if (RESUME_PROVIDERS.has(selected.provider) && sessionId
  !== undefined)`. `--output-schema` não vira flag do claude — `buildLlmExecution` não passa
  (T1), e o `fullPrompt` já ganha a instrução de schema (código atual). `doctor()`: ramo
  `else if (value.provider === 'claude')` → `const help = spawnSync(value.command, ['--help'], …);
  features = { resume: !help.error && help.stdout.includes('--resume'), outputSchema: false }`.
- **Done**:
  - [ ] `forja llm:run --profile claude …` (fixture) registra observação normalizada + salva sessão
  - [ ] `forja llm:run --profile claude --resume <id>` (fixture) reusa o id; `llm:sessions show <id>` mostra
  - [ ] `forja llm:probe claude` → `features: { resume: true, outputSchema: false }`

## T4 — Documentação + CHANGELOG
- **Owner**: Worker · **Est**: P · **Depende de**: T3
- **Paths**: `docs/llm-fit-loop.md`, `docs/llm-evolution.md`, `CHANGELOG.md`
- **Escopo**: `llm-fit-loop.md` — seção "Adaptador Claude" (resume nativo, JSON do provedor, e a
  **nota**: `--output-schema` é validação **local** para Claude, não garantia do provedor).
  `llm-evolution.md` — C3 fechado. CHANGELOG `[Unreleased]`.
- **Done**:
  - [ ] `forja tools:doctor` → `docs-commands`, `commands-documented`, `docs-links`, `adr-refs` verdes

## T5 — Testes + validação final + fecho
- **Owner**: Worker → Governance · **Est**: M · **Depende de**: T1–T4
- **Paths**: `test/llm-fit.test.js` / `test/llm-integration.test.js` / novo
- **Escopo**: cobrir AC-8; um fixture `claude` que ecoa um objeto JSON válido (`process.execPath -e
  "..."`), como o fixture Codex já faz. Bateria; `spec.md` §Evidências; status; handoff.
- **Done**:
  - [ ] `tsc --noEmit`, `node --test test/*.test.js`, `forja spec:check`, `forja project:check` verdes — AC-9
  - [ ] testes de Codex/`buildLlmExecution`/sessão existentes verdes (só o que muda por desenho)
  - [ ] `spec:set-status llm-adaptador-claude spec implementing` no início; handoff `review` ao fim

---

## Mapa AC → task

| AC | Tasks |
|---|---|
| AC-1 / AC-2 | T1 |
| AC-3 | T2 |
| AC-4 / AC-5 / AC-6 | T3 |
| AC-7 | T4 |
| AC-8 / AC-9 | T5 |

## Handoffs

SDD Architect (spec+plan+tasks + ADR-0085) → **Worker** (T1–T4) → **Governance** (T5 + `project:check`).

## Evidências e estado real

- Nada executado.
- **De `main`** (com W10 + W11). ADR-0085 cobre o desenho. Caminho Codex inalterado.
- **Limitação assumida**: `--output-schema` para Claude é garantia local (Ajv), não do provedor.
