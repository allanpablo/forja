# Spec: llm-adaptador-claude — adaptador Claude com paridade de retomada e formato

- **ID**: SPEC-050
- **Status**: implementing
- **Owner**: apk
- **Criado em**: 2026-09-08
- **Sprint alvo**: <a definir>
- **ADRs relacionadas**: **ADR-0085** (o desenho do adaptador). ADR-0081 (sessões e validação).
- **Origem**: `docs/roadmap-v4.1.md`, Onda 4 (W12) — fecha C3.

## 1. Problema

O adaptador `claude` do `llm:run` é mínimo: `buildLlmExecution` monta `claude -p "<prompt>"` e
nada mais. **Retomada** e **formato estruturado** são Codex-only por decisão do ADR-0081 —
`buildLlmExecution` lança `"resume requires codex"`, e `llm:run` só normaliza/salva sessão para
`codex`. O `claude` CLI (Claude Code) já expõe `--print --output-format json` (objeto único com
`result`, `session_id`, `usage`), `-r/--resume <session-id>` e `--session-id <uuid>` — a
assimetria não tem mais razão técnica.

## 2. Proposta de valor

`llm:run --profile claude` passa a: emitir JSON estruturado do provedor, registrar `sessionId`
retomável, aceitar `--resume`, e validar `--output-schema` localmente. `llm:probe claude` reporta
`features.resume: true` / `features.outputSchema: false`. Dentro da mesma fronteira de privacidade
do Codex — `shell: false`, sem ler API keys.

## 3. User stories

- **Como** operador com um perfil Claude, **quero** `llm:run --profile claude --resume <id>` para
  continuar uma conversa, **para que** eu não perca contexto entre execuções.
- **Como** operador, **quero** `llm:run --profile claude --output-schema s` com validação local,
  **para que** eu tenha a mesma garantia de formato do fluxo Codex (mesmo que local).
- **Como** operador, **quero** `llm:probe claude` mostrando quais recursos o adaptador suporta,
  **para que** eu não descubra a limitação só na execução.

## 4. Critérios de aceite (Definition of Done)

- [ ] **AC-1**: `buildLlmExecution` para `provider: 'claude'` monta
      `claude -p "<prompt>" --output-format json [--model <m>] [--resume <session-id>]`
      (`shell: false`, prompt por argumento). Sem `--resume`, sem esse par.
- [ ] **AC-2**: o guard de `resume` deixa de ser Codex-only — `RESUME_PROVIDERS = { 'codex',
      'claude' }` rege `buildLlmExecution` e `LlmSessionStore.require`. `validSessionId` já aceita
      UUID (não muda). Um provedor fora do conjunto com `--resume` → erro claro.
- [ ] **AC-3**: `lib/llm/claude-output.ts` `normalizeClaudeResult(result): NormalizedLlmResult`
      parseia o objeto JSON único: `stdout` ← `result`; `sessionId` ← `session_id`; `usage` ←
      `{ inputTokens: input_tokens, outputTokens: output_tokens, cachedInputTokens:
      cache_read_input_tokens? }`. `is_error: true` ou `subtype !== 'success'` → `errorCode:
      'PROVIDER_FAILED'`; JSON inválido → `'INVALID_PROVIDER_OUTPUT'`; nunca devolve o objeto cru
      como resposta.
- [ ] **AC-4**: `llm:run` `run()` — `provider === 'claude'` → `normalizeClaudeResult(raw)`;
      `sessionId` gravado em `llm_session` via `LlmSessionStore.save` para `claude` também (a
      condição `provider === 'codex'` vira `RESUME_PROVIDERS.has(provider)`).
- [ ] **AC-5**: `--output-schema` com um perfil Claude — o Forja instrui "responda só JSON
      conforme o schema" e valida com Ajv localmente (caminho não-Codex já existente); nenhum
      flag de schema é passado ao `claude`.
- [ ] **AC-6**: `doctor()` (`llm:probe`/`llm:doctor`) — para `provider: 'claude'` disponível,
      `features = { resume: <`claude --help` tem `--resume`>, outputSchema: false }`.
- [ ] **AC-7**: `docs/llm-fit-loop.md` (seção do adaptador Claude + a nota "schema é garantia
      local, não do provedor") e `docs/llm-evolution.md` (C3 fechado). Registry: `llm:run.desc`
      pode citar `--profile claude` sem mudança estrutural.
- [ ] **AC-8**: testes — `buildLlmExecution` claude com/sem `--resume` (argv exato);
      `normalizeClaudeResult` (sucesso, `is_error`, JSON inválido); `LlmSessionStore.require`
      aceita `claude`; `doctor` reporta `features` para claude (probe do binário fake).
- [ ] **AC-9**: `tsc --noEmit`, `node --test test/*.test.js`, `forja spec:check`,
      `forja project:check` verdes. Testes de Codex/sessão/`buildLlmExecution` existentes
      inalterados (o caminho Codex não muda).

## 5. Escopo

**Dentro**:
- `packages/llm/src/index.ts` — `buildLlmExecution` claude; guard de `resume` por `RESUME_PROVIDERS`.
- `lib/llm/claude-output.ts` (novo) — `normalizeClaudeResult`.
- `lib/llm/session.ts` — `RESUME_PROVIDERS` exportado; `require` usa o conjunto.
- `scripts/llm-fit.ts` — normalização por provedor; `save` de sessão para `claude`; `features` no `doctor`.
- `docs/llm-fit-loop.md`, `docs/llm-evolution.md`; testes.

**Fora** (evita scope creep):
- `--output-format stream-json` (streaming) — o objeto único basta para o `llm:run` não-interativo.
- Ler `total_cost_usd` do Claude como custo real — segue a estimativa por `model-pricing.json`
  (ADR-0085 §5); anotar o número do provedor é ADR/spec própria.
- Adaptador Gemini/outros à paridade — cada um é sua rodada.
- `--session-id <uuid>` para *fixar* uma sessão nova — nesta rodada só se consome o `session_id`
  que o provedor devolve; fixar é backlog.
- `packages/llm/adapters/` genérico — mantém o `if (provider === …)` + `*-output.ts` (ADR-0085).

## 6. NFRs / restrições

- **Privacidade**: `shell: false`; o Forja não lê API keys — auth é da CLI do Claude, igual ao
  Codex. O relatório/prompt vai ao provedor e ao hash, nunca ao banco (contrato de `llm:run`).
- **Compatibilidade**: o caminho Codex de `buildLlmExecution`/`run()` **não muda**. Só o ramo
  `claude` cresce e o guard de `resume` passa a aceitar um conjunto.
- **Determinismo**: `normalizeClaudeResult` só lê campos conhecidos; formato inesperado → erro
  visível, nunca resposta silenciosa.
- **Sem rede nos testes**: `claude` é um binário fixture nos testes (como o Codex já é).

## 7. Riscos e mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Formato do `claude --output-format json` muda numa versão | M | M | `normalizeClaudeResult` lê só campos conhecidos e falha com `INVALID_PROVIDER_OUTPUT`; teste fixture congela o formato esperado |
| `--output-schema` para Claude dá falsa sensação de garantia do provedor | M | M | `features.outputSchema: false` explícito + nota na doc; a validação Ajv reprova formato inválido de qualquer forma |
| `RESUME_PROVIDERS` como conjunto no código vira dívida ao crescer | B | B | É uma decisão de contrato (ADR-0085); 2 provedores hoje, aditivo |
| Prompt por argumento (Claude) vs stdin (Codex) — divergência de tratamento | B | B | `buildLlmExecution` já ramifica por provedor; o `runLlm` lida com ambos (o Codex usa `stdin`, o Claude não) |

## 8. Métricas de sucesso

- `llm:run --profile claude --output-schema s` num fixture valida a resposta localmente e
  registra observação normalizada (mesmos campos do Codex).
- `llm:run --profile claude` seguido de `llm:run --profile claude --resume <id>` (fixture)
  registra e reusa o `sessionId`; `llm:sessions show <id>` mostra a sessão Claude.
- `llm:probe claude` reporta `features.resume: true`, `features.outputSchema: false`.
- Zero regressão no caminho Codex.

## Evidências e estado real

- AC-1 a AC-9 → tasks em `spec:tasks`.
- **Sem mudança no contrato de saída do `llm:run`** — os campos são os mesmos do Codex
  (`sessionId`, `usage`, `errorCode`, `validationStatus`, …).
- **Limitação assumida**: `--output-schema` para Claude é garantia **local** (Ajv), não do
  provedor — `features.outputSchema: false`.
- **Dependência**: de `main` (com W10 + W11). Reusa `NormalizedLlmResult`, `LlmSessionStore`,
  `prepareValidation`.
