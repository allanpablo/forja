# Evolução do ForjaJS com LLMs

- Data: 2026-09-05
- Direção de Allan Pablo: melhorar integrações com LLMs, incluindo GPT-6, documentar o desejo
  do produto e começar a trabalhar usando o próprio ForjaJS.

## Desejo do produto

Entregar mudanças de software verificáveis com contexto relevante, continuidade entre sessões
e custo mensurável. O usuário descreve o resultado; o Forja prepara contexto, aplica políticas,
coordena a execução e apresenta evidências de validação.

GPT-6 Astra (`gpt-6-astra`) é um alvo configurável. Autenticação e acesso dependem do provedor
e da conta. Codex, Claude, Gemini, Ollama e executáveis locais permanecem integráveis.

## Instruções de desenvolvimento

1. Operar pela CLI do Forja: spec, plano, contexto, impacto, implementação e governança.
2. Evoluir os contratos existentes; manter perfis v1 e autenticação nas CLIs dos provedores.
3. Enviar os contextos selecionados ao modelo; falhar antes da execução se um arquivo faltar.
   Registrar hashes e referências, sem persistir seu conteúdo no Forja.
4. Separar execução concluída, validação da entrega e medição do provedor. Estimativa não é fatura.
5. Testar com executáveis locais controlados antes de consumir modelos externos.
6. Manter leitura como padrão; escrita, retomada e API devem respeitar runtime e privacidade.
7. Registrar limitações e resultados reais. Uma CLI instalada não comprova acesso a GPT-6.

## Entregas incrementais

| Etapa | Entrega | Evidência |
|---|---|---|
| 1 — implementada e testada | Contexto enviado; Codex JSONL; esforço e timeout configuráveis; telemetria e validação explícitas | Testes sem rede, tipos e build |
| 2 — implementada e testada | Retomada por sessão, resposta com schema e validação por testes/requisitos | Continuação sem replay pelo Forja; checks independentes rejeitam resultados inválidos |
| 3 — planejada | Benchmark real; recomendação por qualidade, risco, custo e latência | Custo por tarefa aprovada, regressões e retrabalho |
| 4 — planejada | Contexto incremental e cache medido; adaptador de API opcional com ADR próprio | Economia total sem perda de qualidade |
| 5 — planejada | Expandir MCP existente; ferramentas sob demanda; checkpoints no runtime | Mesmas políticas e auditoria para CLI e agentes |

A etapa 1 está na [spec de integração](../specs/llm-integration-v2/spec.md); a etapa 2, na
[spec de retomada e validação](../specs/llm-resume-validation/spec.md). As seguintes são direção
de produto; seus contratos serão definidos antes de cada implementação.

## Métricas

Em 30 dias comparar tarefas aprovadas, custo por tarefa aprovada, duração p50/p95, retrabalho,
tokens de contexto e cache quando disponível. Coletar baseline antes de prometer percentuais.

## Fontes verificadas

- [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra)
- [Codex não interativo](https://learn.chatgpt.com/docs/non-interactive-mode)
- [Cache de prompts](https://developers.openai.com/api/docs/guides/prompt-caching)
- [LLM Fit Loop local](llm-fit-loop.md)
