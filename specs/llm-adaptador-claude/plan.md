# Plan: llm-adaptador-claude

- **Spec**: ./spec.md
- **Status**: approved
- **Criado em**: 2026-09-08

## 1. Abordagem técnica

O padrão já existe (`if (provider === 'codex') …` + `lib/llm/codex-output.ts`); W12 preenche o
ramo `claude`. `buildLlmExecution` monta `claude -p "<prompt>" --output-format json [--model]
[--resume <id>]`. `lib/llm/claude-output.ts` `normalizeClaudeResult` parseia o **objeto JSON
único** do `--output-format json` (não JSONL). `RESUME_PROVIDERS = { 'codex', 'claude' }`
(exportado de `lib/llm/session.ts`) substitui os dois `provider === 'codex'` que travam a
retomada. `run()` escolhe o normalizador por provedor e salva a sessão para os dois. `doctor()`
ganha um ramo `claude` para `features`. Sem framework de adaptadores — ADR-0085 §alt.

## 2. Módulos afetados

| Caminho | Mudança | Risco |
|---|---|---|
| `packages/llm/src/index.ts` | editar — ramo `claude` de `buildLlmExecution` (`--output-format json`, `--resume`); guard de `resume`: `provider !== 'codex'` → `!RESUME_PROVIDERS.has(provider)`. Importa `RESUME_PROVIDERS` | M |
| `lib/llm/claude-output.ts` | **criar** — `normalizeClaudeResult(result): NormalizedLlmResult` (objeto único; `result`→stdout, `session_id`→sessionId, `usage`, `is_error`/`subtype`→`PROVIDER_FAILED`, parse ruim→`INVALID_PROVIDER_OUTPUT`) | M |
| `lib/llm/session.ts` | editar — `export const RESUME_PROVIDERS = new Set(['codex', 'claude'])`; `require()`: `profile.provider !== 'codex'` → `!RESUME_PROVIDERS.has(profile.provider)` | B |
| `scripts/llm-fit.ts` | editar — `run()`: `provider === 'claude'` → `normalizeClaudeResult`; `if (selected.provider === 'codex' && sessionId …)` → `if (RESUME_PROVIDERS.has(selected.provider) && sessionId …)`. `doctor()`: ramo `value.provider === 'claude'` → `features = { resume: help.stdout.includes('--resume'), outputSchema: false }` | M |
| `docs/llm-fit-loop.md`, `docs/llm-evolution.md` | editar — adaptador Claude + nota "schema local"; C3 fechado | B |
| `test/*` | criar/estender — `buildLlmExecution` claude, `normalizeClaudeResult`, `require` claude, `doctor` features | M |

## 3. Diagrama de fluxo

```
forja llm:run --profile claude [--prompt "<t>" | --engineer "<o>"] [--resume <id>] [--output-schema s]
   │
   ├─ buildLlmExecution(claude, prompt, { resume, outputSchema }):
   │     guard: resume && !RESUME_PROVIDERS.has('claude') → erro   (agora passa)
   │     argv = [ -p, "<prompt>", --output-format, json, (--model m)?, (--resume <id>)? ]   (shell:false)
   │     outputSchema NÃO vira flag do claude — vai como instrução no prompt (caminho não-Codex)
   ├─ runLlm(...) → raw stdout = { type:"result", result, session_id, usage, is_error, subtype, ... }
   ├─ normalizeClaudeResult(raw):
   │     ok       → { stdout: result, sessionId: session_id, usage, exitCode:0 }
   │     is_error → { errorCode: 'PROVIDER_FAILED', exitCode:1 }
   │     parse ✗ → { errorCode: 'INVALID_PROVIDER_OUTPUT', exitCode:1 }
   ├─ validateLlmResponse(prepared, stdout, …)   (Ajv local — igual pra todos)
   └─ RESUME_PROVIDERS.has('claude') && sessionId → LlmSessionStore.save(sessionId, profile, cwd, obsId)

forja llm:probe claude → features: { resume: true, outputSchema: false }
```

## 4. Contratos (API/CLI/Schema)

```ts
// packages/llm — buildLlmExecution(provider:'claude'):
//   args = [...base, ...(model!=='default'?['--model',model]:[]), '-p', prompt,
//           '--output-format','json', ...(resume?['--resume',resume]:[])]

// lib/llm/session.ts
export const RESUME_PROVIDERS: ReadonlySet<string>;   // { 'codex', 'claude' }

// lib/llm/claude-output.ts
export function normalizeClaudeResult(result: LlmExecutionResult): NormalizedLlmResult;
```

Nenhuma chave nova na saída JSON do `llm:run` — Claude usa o mesmo `NormalizedLlmResult`.

## 5. Decisões e alternativas

**D1 — `RESUME_PROVIDERS` como `Set` exportado, não um campo no perfil.** Suportar retomada é
propriedade do *adaptador* (o que a CLI oferece), não escolha do operador. Rejeitado: `resume:
boolean` no `LlmProfile` (operador não deveria poder mentir sobre a capacidade da CLI).

**D2 — `--output-format json` (objeto único), não `stream-json`.** ADR-0085 §alt. Menos parsing,
suficiente para não-interativo.

**D3 — `--output-schema` para Claude = instrução + Ajv local; `features.outputSchema: false`.**
O `claude` não tem flag de schema. O caminho não-Codex já faz isso (SPEC-028). `false` é honesto:
a garantia é local. Rejeitado: fingir `true` (o operador confiaria numa garantia que não existe).

**D4 — `doctor` probe de `claude --help` para `features.resume`.** Espelha o probe do Codex
(`codex exec resume --help`). `outputSchema` fixo em `false` para claude (não há o que probar).

ADR-0085 cobre o desenho; sem ADR adicional.

## 6. Dependências

- De `main` (com W10 + W11). Reusa `NormalizedLlmResult` (`lib/llm/codex-output.ts` exporta o
  tipo), `LlmSessionStore`, `prepareValidation`/`validateLlmResponse`.
- `claude` CLI ≥ o que tem `--print --output-format json --resume` (2.x). Testes usam fixture.
- Pacotes npm: nenhum. Migrações: nenhuma.

## 7. Rollout

- [ ] Feature flag: não. O perfil `claude` já existe em `DEFAULT_LLM_PROFILES`; ganha capacidade.
- [ ] Doc: `docs/llm-fit-loop.md` (adaptador Claude, nota do schema local), `docs/llm-evolution.md`
      (C3 → fechado).
- [ ] `CHANGELOG.md` `[Unreleased]`: Adicionado (adaptador Claude com resume + JSON + schema local).

## 8. Sinais de fracasso (kill criteria)

- O `claude --output-format json` real diverge do formato assumido a ponto de `normalizeClaudeResult`
  virar um parser frágil → congelar no formato do fixture, marcar `INVALID_PROVIDER_OUTPUT` em
  tudo que não bater, e abrir issue para revisar quando um humano rodar contra o CLI real.
- Relaxar o guard de `resume` quebra um teste do Codex que assumia "só codex" → o teste vira
  "só RESUME_PROVIDERS"; se for mais que 1–2 asserções, manter Codex-only e entregar só o
  `--output-format json` + normalização nesta rodada, resume numa spec própria.

## Evidências e estado real

| AC | Task | Verificação |
|---|---|---|
| AC-1/AC-2 | T1 | argv exato de `buildLlmExecution` claude com/sem resume; guard aceita claude |
| AC-3 | T2 | `normalizeClaudeResult` — sucesso / `is_error` / parse ruim |
| AC-4 | T3 | `run()` normaliza e salva sessão para claude |
| AC-5 | T3 | `--output-schema` + claude → instrução + Ajv, sem flag no claude |
| AC-6 | T3 | `doctor` `features` para claude |
| AC-7 | T4 | docs + CHANGELOG |
| AC-8/AC-9 | T5 | testes; caminho Codex intacto |

- **Sem mudança no contrato de saída.** Limitação assumida: schema local para Claude.
