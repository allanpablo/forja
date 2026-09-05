# ADR-0080: Contexto e evidência na integração LLM

- **Status**: accepted
- **Data**: 2026-09-05
- **Autor(es)**: Allan Pablo / Codex
- **Tags**: llm, cli, observability

## Contexto

O LLM Fit Loop perde contexto selecionado e não interpreta eventos do Codex. O produto requer
integração com GPT-6 e demais LLMs, distinguindo execução de validação.

## Decisão

Estender perfis v1 com timeout e esforço opcional do Codex. Enviar o prompt completo por stdin
ao Codex e normalizar JSONL em resposta, sessão e uso. Adaptadores legados mantêm argv.
Contextos são carregados antes de iniciar qualquer subprocesso.

Observation.outcome continua descrevendo execução para compatibilidade; validationStatus será
inconclusive até existir validação independente. A saída explicita essa distinção.
Falhas de protocolo/provedor prevalecem sobre exit zero.

Preços calculados com a tabela local são estimativas, mesmo com tokens do provedor. Preço ausente
é null na saída pública; a representação histórica no recorder permanece nesta etapa.
Eventos brutos não são persistidos pelo Forja. O provedor controla seu próprio histórico.

## Alternativas consideradas

- API direta: adiada, altera a fronteira de credenciais da ADR-0074.
- Reescrever storage: adiado; validationStatus existente permite evolução compatível.
- Failover automático: rejeitado, pode alterar privacidade e custo.

## Consequências

Perfis existentes seguem válidos. JSONL inválido falha explicitamente. Métricas antigas de sucesso
continuam sendo de execução. Retomada, schema da resposta, cache e benchmark seguem no roadmap.

## Rastreamento

- [Spec](../../specs/llm-integration-v2/spec.md)
- [Visão](../../docs/llm-evolution.md)
- [ADR-0074](0074-llm-fit-loop-cli-adapters.md)
