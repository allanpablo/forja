# ADR-0081: Sessões e validação independente de LLM

- **Status**: accepted
- **Data**: 2026-09-05
- **Autor(es)**: Allan Pablo / Codex
- **Tags**: llm, validation, sessions

## Contexto

O usuário autorizou continuar a evolução LLM após a primeira etapa. Precisamos retomar sessões
e distinguir uma resposta com formato válido de uma tarefa aprovada por critérios independentes.

## Decisão

Retomar apenas IDs registrados no Forja e vinculados a projeto real e fingerprint do perfil.
Não relançar automaticamente uma sessão que falhou nem trocar silenciosamente de modelo.
Persistir metadados nas coleções llm_session e llm_validation do SqliteJsonRepository existente.

Usar Ajv 8 para validar JSON Schema localmente, com compilação antes da chamada ao modelo,
sem coerção de dados ou carregamento remoto. Uma implementação própria parcial de JSON Schema
foi rejeitada porque aceitaria contratos que não sabe verificar.

Checks independentes vêm de um manifest explícito escolhido pelo operador antes da chamada.
Executar argv sem shell, timeout limitado e resposta por stdin. Não executar comandos sugeridos
pela resposta. Guardar somente hashes, resultado e duração dos checks.

Formato válido sozinho deixa validação inconclusive. Checks aprovados podem marcar accepted;
falha marca rejected e exit 2, mantendo executionStatus/Observation.outcome do modelo separados.
Métricas existentes permanecem; métricas adicionais descrevem validação independente.

## Consequências

Ajv entra em dependencies. Sessões dependem do histórico do provedor; não há coordenação de
retomadas simultâneas ou garantia de exactly-once no agente. Checks rodam com as permissões do
operador e aprovam somente os requisitos que efetivamente verificam.

## Rastreamento

- [Spec](../../specs/llm-resume-validation/spec.md)
- [Visão](../../docs/llm-evolution.md)
- [Codex não interativo](https://learn.chatgpt.com/docs/non-interactive-mode)
- [Ajv](https://ajv.js.org/guide/getting-started)
