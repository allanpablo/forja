# Plan: Integrações LLM

- **Spec**: ./spec.md
- **Status**: approved
- **Criado em**: 2026-09-05

## Abordagem e contratos

Estender packages/llm com timeoutMs, reasoningEffort, stdin e normalização de eventos Codex.
Manter perfil version 1 e adaptadores legados. Criar helper de composição de contexto em lib/llm.
scripts/llm-fit usa o prompt completo, telemetria normalizada e validationStatus inconclusive.
Doctor verifica --json e --sandbox no help do Codex sem autenticar ou consumir tokens.

## Fluxo

Perfil validado → arquivos de contexto → prompt completo → subprocesso sem shell → normalização
→ observação sem conteúdo → resposta ao operador com execução, validação e origem dos tokens.

## Impacto

- packages/llm/src/index.ts: contratos e execução; único chamador de produção em scripts/llm-fit.ts.
- scripts/llm-fit.ts: contexto, doctor, observação e resposta.
- lib/llm/context.ts e lib/llm/codex-output.ts: helpers testáveis.
- test/llm-fit.test.js, test/cost-economy.test.js e novos testes de integração.
- docs/llm-fit-loop.md: exemplos e limites; nenhuma alteração de schema SQLite.

## Decisão

[ADR-0080](../../memory/90-decisions/0080-llm-execution-evidence.md). Contratos HTTP, schema da
resposta final e retomada serão tratados em etapas próprias. Nenhuma nova dependência.

## Validação e rollout

Testes locais com executáveis fixture, tipos, build, spec:check, gsd:check e project:check.
Codegraph ausente: code:check/code:impact executados e fallback manual com rg; AST indisponível.
Sem publicação. Alteração pública intencional: custo desconhecido será null e não zero.


## Evidências da entrega — 2026-09-05

- npm test: 467 testes passaram, zero falhas e zero skips.
- npm run types:check e npm run build: passaram.
- spec:check, gsd:check e project:check: passaram; maturidade estrutural reportada em 100%.
- tools:doctor: núcleo operante; ferramentas opcionais ausentes e memória ainda não sincronizada.
- git diff --check: passou.
- Compatibilidade de flags conferida também no help local do Codex 0.153.4.
- Nenhuma chamada real a LLM: integração exercitada por executáveis fixture sem rede.
- Workspace operacional: /home/apk/github/forja-workspace, selecionado via FORJA_WORKSPACE;
  não houve alteração na configuração global do usuário.

## Continuidade

Etapa 1 concluída. A próxima entrega é retomada por sessão e validação independente, seguida
pelos benchmarks e melhorias de cache/MCP registrados na visão do produto. O fato de esta spec
estar done não significa que as demais etapas foram implementadas.
