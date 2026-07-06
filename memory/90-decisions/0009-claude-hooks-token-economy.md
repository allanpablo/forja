# ADR-0009: Hooks Claude Code para contexto e economia de tokens

- **Status**: accepted
- **Data**: 2026-05-10
- **Tags**: tokens, hooks, claude-code

## Contexto
A Fase 3 entregou smart-context API (ADR-0003) mas o agente precisava invocá-la manualmente. Resultado: economia teórica de 40-60% só se materializa quando alguém lembra de chamar. Pre-commit também era leve — não validava SDD nem standards.

## Decisão
Três pontos de hook em `.claude/settings.json`:

1. **`SessionStart`** → `scripts/hook-session-start.mjs`
   Imprime status do framework (specs ativas, handoffs abertos) como `additionalContext`. Roda 1×/sessão. Sem custo recorrente.

2. **`UserPromptSubmit`** → `scripts/hook-user-prompt.mjs`
   Opt-in via env `FRAMEWORK_HOOK_INJECT=1`. Só injeta quando prompt casa com keywords (`implement`, `refactor`, `criar feature`, `spec:`, …). Cache TTL 30min por hash do prompt. Cap configurável em `.memoryrc.json::hooks.userPromptCap` (default 4KB).

3. **Pre-commit ampliado** (`scripts/pre-commit.sh`)
   Adicionados passos 6 (`spec:check`) e 7 (`check-standards`). Bloqueia commit se SDD inconsistente.

## Alternativas consideradas
- **Sempre injetar contexto** — rejeitada: gasta tokens em prompts triviais, atrasa primeiros tokens
- **Injetar via slash command manual** — rejeitada: vira esquecível; já tem `npm run context:smart`
- **Hook em `PreToolUse`** — rejeitada nesta versão: ruído alto, ganho duvidoso para o caso de uso (framework, não app de produção)

## Consequências
**Positivas**:
- Status do framework sempre visível ao iniciar sessão
- Injeção opt-in com safeguards (keyword, cache, cap)
- Pre-commit catch dívida de SDD antes do PR

**Negativas / Trade-offs**:
- `UserPromptSubmit` adiciona ≤200ms (cache) ou ≤1s (cold) ao primeiro token. Mitigado por trigger restrito.
- Comportamento muda quando `FRAMEWORK_HOOK_INJECT=1` — documentar em onboarding.
- Hooks só rodam no Claude Code; outras IAs (Copilot/Gemini) seguem fluxo manual.

## Rastreamento
- `.claude/settings.json`
- `scripts/hook-session-start.mjs`, `scripts/hook-user-prompt.mjs`
- `scripts/pre-commit.sh` (passos 6-7)
- `.memoryrc.json` (chave `hooks`)
- SPEC-001 AC-7
