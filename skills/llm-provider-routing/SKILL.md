# Skill: Roteamento de LLM Providers

## Objetivo
Selecionar e configurar uma LLM por papel sem amarrar o projeto a um unico fornecedor.

## Quando usar
- O usuario pedir DeepSeek, MiniMax, Mistral, Qwen, Ollama, OpenRouter, Together, Groq, xAI, Cohere, Perplexity ou outro provider.
- Um papel precisar trocar de modelo por custo, cota, latencia, contexto, privacidade ou qualidade.
- Uma CLI/API externa precisar entrar no fluxo de handoffs sem alterar o SDD.

## Regras
- Preferir providers locais para tarefas sensiveis quando o modelo disponivel for suficiente.
- Usar `manual` quando o provider nao tiver CLI local confiavel.
- Registrar `provider`, `model`, `command`, `taskTypes` e `notes` em `.memory/agent-llm-routing.json`.
- Nao assumir que uma CLI existe: validar o binario ou documentar o comando esperado.
- Nao colocar API keys em memoria, specs, handoffs ou logs.

## Providers padrao
| Provider | Uso recomendado | Observacao |
| --- | --- | --- |
| `codex` | Mudancas em repositorio e execucao CLI-first | Local/autenticado pela CLI |
| `claude` | Analise longa, arquitetura e escrita | Local/autenticado pela CLI |
| `gemini-cli` | Contexto amplo e alternativas rapidas | Local/autenticado pela CLI |
| `deepseek` | Raciocinio/codigo com custo controlado | Exige CLI ou wrapper configurado |
| `minimax` | Texto, agentes e tarefas multimodais quando disponivel | Exige CLI ou wrapper configurado |
| `mistral` | Codigo e agentes via stack europeia | Exige CLI ou wrapper configurado |
| `qwen` | Codigo e modelos abertos/chineses | Exige CLI ou wrapper configurado |
| `ollama` | Execucao local/offline | Usa `ollama run <model> <prompt>` |
| `openrouter` | Agregador multi-modelo | Exige wrapper/CLI configurado |
| `together` | Modelos abertos hospedados | Exige wrapper/CLI configurado |
| `groq` | Baixa latencia | Exige wrapper/CLI configurado |
| `xai` | Grok e modelos xAI | Exige wrapper/CLI configurado |
| `cohere` | RAG, classificacao e Command R | Exige wrapper/CLI configurado |
| `perplexity` | Pesquisa/resposta com busca | Exige wrapper/CLI configurado |

## Checklist
1. Identificar papel e tipo de tarefa.
2. Escolher provider e modelo no dashboard ou via API `/api/llm-routing/:role`.
3. Preencher `command` com a CLI real ou wrapper local.
4. Rodar um teste pequeno antes de delegar sprint inteira.
5. Registrar handoff Hermes quando a troca impactar entrega.
