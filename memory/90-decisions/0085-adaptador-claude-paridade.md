# ADR-0085: Adaptador Claude com paridade de retomada e formato

- **Status**: accepted
- **Data**: 2026-09-08
- **Autor(es)**: Allan Pablo / Claude
- **Tags**: llm, adapters, sessions, privacy

## Contexto

O `llm:run` já tem um adaptador `claude` mínimo — `buildLlmExecution` monta `claude -p "<prompt>"`
e mais nada. Retomada (`--resume`) e formato estruturado (`--output-schema`) são **exclusivos do
Codex** por decisão explícita do ADR-0081: `buildLlmExecution` lança "resume requires codex", e
`llm:run` só chama `normalizeCodexResult` / `LlmSessionStore` para o provedor `codex`.

O `claude` CLI (Claude Code) oferece nativamente o que falta: `--print --output-format json` (um
objeto único com `result`, `session_id`, `usage`, `total_cost_usd`), `-r/--resume <session-id>` e
`--session-id <uuid>`. Um adaptador de primeira classe fecha a assimetria do C3 do roadmap v4.1.

## Decisão

**Elevar o adaptador `claude` à paridade, dentro da mesma fronteira de privacidade do Codex.**

1. **`buildLlmExecution` (`provider: 'claude'`)** passa a montar
   `claude -p "<prompt>" --output-format json [--model <m>] [--resume <session-id>]`. `shell:
   false` (argv, nunca string de shell); o Forja **não lê API keys** — a autenticação é da CLI
   do provedor, como no Codex. O prompt vai por argumento (o `claude -p` recebe assim), não por
   stdin como o Codex.

2. **`lib/llm/claude-output.ts` `normalizeClaudeResult`** parseia o objeto JSON único do
   `--output-format json`: `stdout` ← `result` (string); `sessionId` ← `session_id`; `usage` ←
   `{ input_tokens, output_tokens, cache_read_input_tokens? }`. `is_error: true` ou
   `subtype !== 'success'` → `errorCode: 'PROVIDER_FAILED'`; JSON inválido →
   `'INVALID_PROVIDER_OUTPUT'`. Mesmo contrato de `NormalizedLlmResult` do Codex — nenhum evento
   de raciocínio vira resposta final.

3. **Retomada** deixa de ser Codex-only. Um conjunto explícito `RESUME_PROVIDERS = { codex,
   claude }` rege o guard de `buildLlmExecution` e o `LlmSessionStore.require`. A fingerprint do
   perfil (`profileFingerprint`) e o binding a `cwd` + projeto continuam iguais — a sessão
   pertence a um projeto e a uma configuração de perfil, seja Codex ou Claude.

4. **`--output-schema` para Claude é validação LOCAL, não garantia do provedor.** O `claude` CLI
   não tem flag de schema. O caminho que já existe para adaptadores não-Codex vale: o Forja
   instrui "responda só JSON conforme este schema" e valida com Ajv localmente (SPEC-028). O
   `llm:probe`/`llm:doctor` reporta `features.outputSchema: false` para Claude — o operador sabe
   que a garantia é local. `features.resume: true`.

5. **Custo**: o `total_cost_usd` do `claude --output-format json` **não** substitui a tabela
   local de preço; o Forja continua estimando por `model-pricing.json` e marcando `costSource`.
   O número do provedor pode ser anotado no futuro, com ADR próprio (não nesta rodada).

## Alternativas consideradas

- **Manter Codex-only.** Rejeitado: a assimetria não tem razão técnica agora que o `claude` CLI
  expõe resume + JSON; C3 do roadmap fica aberto sem motivo.
- **`--output-format stream-json` (como o JSONL do Codex).** Rejeitado nesta rodada: o objeto
  único de `--output-format json` é mais simples e suficiente para um `llm:run` não-interativo;
  streaming é para uma UI, não para este comando.
- **Ler o `total_cost_usd` do provedor como custo real.** Rejeitado: mistura estimativa local
  com fatura parcial do provedor sem modelar descontos/assinatura — mesma cautela do ADR-0081.
- **Um `packages/llm/adapters/` genérico.** Rejeitado como over-engineering para 2 provedores com
  resume; o `if (provider === …)` de `buildLlmExecution` + um `*-output.ts` por provedor é o
  padrão vigente e continua legível.

## Consequências

**Positivas**:
- `llm:run --profile claude --resume <id>` e `llm:sessions show <id>` funcionam para Claude.
- `llm:run --profile claude --output-schema s` valida a resposta localmente.
- Um segundo provedor de primeira classe reduz o lock-in de fato no Codex.

**Negativas / Trade-offs**:
- `features.outputSchema: false` para Claude — a garantia de formato é local (Ajv), não do
  provedor. Documentado; o `llm:run` já reprova formato inválido de qualquer jeito.
- Mais um caminho de normalização para manter quando o formato do `claude --output-format json`
  mudar. Mitigado por `normalizeClaudeResult` só ler campos conhecidos e falhar visível.
- `RESUME_PROVIDERS` é um conjunto no código, não configurável — adicionar um 3º provedor com
  resume exige tocar aqui (aceitável: é uma decisão de contrato).

## Rastreamento

- Implementação: `packages/llm/src/index.ts` (`buildLlmExecution` claude, guard de resume),
  `lib/llm/claude-output.ts` (novo), `lib/llm/session.ts` (`RESUME_PROVIDERS`),
  `scripts/llm-fit.ts` (normalização + probe/doctor)
- [Spec](../../specs/llm-adaptador-claude/spec.md) · ADR-0081 (sessões e validação), SPEC-028
- Docs: `docs/llm-fit-loop.md`, `docs/llm-evolution.md`
