# Skill: Roteamento de LLM Providers

## Objetivo
Selecionar e configurar uma LLM por papel sem amarrar o projeto a um unico fornecedor, usando o ciclo verificável do Forja.

## Quando usar
- O usuario pedir DeepSeek, MiniMax, Mistral, Qwen, Ollama, OpenRouter, Together, Groq, xAI, Cohere, Perplexity ou outro provider.
- Um papel precisar trocar de modelo por custo, cota, latencia, contexto, privacidade ou qualidade.
- Uma CLI/API externa precisar entrar no fluxo de handoffs sem alterar o SDD.

## Regras
- Preferir providers locais para tarefas sensiveis quando o modelo disponivel for suficiente.
- Usar `manual` quando o provider nao tiver CLI local confiavel.
- Registrar perfis no workspace em `.context/llm-profiles.json` com `provider`, `model`, `command`, `commandArgs`, `roles`, `taskTypes`, `privacy` e `enabled`.
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
2. Inicializar ou revisar os perfis com `forja llm:profiles:init`.
3. Preencher `command` com um único executável e `commandArgs` para argumentos fixos; nunca use shell ou grave credenciais.
4. Rodar `forja llm:probe <perfil>` antes de delegar uma sprint inteira.
5. Consultar `forja llm:recommend --role <papel> --task <tipo>` e aprovar explicitamente a escolha.
6. Executar `forja llm:run --profile <perfil> --task <arquivo>` e avaliar com `forja llm:eval --scope model --id <provider:model>`.
7. Registrar handoff Hermes quando a troca impactar entrega.
