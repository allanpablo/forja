---
name: llm-provider-routing
description: Use quando uma tarefa exige trocar de provedor ou modelo de LLM no Forja: seleciona, configura e verifica perfis, executa com contexto pela CLI, retoma sessões do Codex e valida as respostas com evidências.
---

# Roteamento de LLMs

Siga o `AGENTS.md` do projeto. Para sintaxe e limites de cada comando, use `forja help <comando>`; não carregue catálogos de provedores sem necessidade.

1. Identifique papel, tarefa, privacidade e restrições de custo/latência. Respeite a escolha autorizada pelo usuário; não troque modelo silenciosamente.
2. Use `forja llm:profiles:init` e revise `.context/llm-profiles.json` no workspace. Configure um executável em `command`, argumentos em `commandArgs` e o identificador real do modelo. Não inclua credenciais nem comandos de shell.
3. Execute `forja llm:probe <perfil>`. Registre versão e recursos detectados. Probe bem-sucedido não comprova autenticação nem acesso ao modelo.
4. Consulte `forja llm:recommend --role <papel> --task <tipo>` como evidência auxiliar, sem tratar ranking como garantia de qualidade.
5. Execute `forja llm:run --profile <perfil> --task <arquivo>`. Se necessário, use `--context <arquivo>` repetido. Confira o conteúdo antes de enviá-lo ao provedor.
6. Para Codex compatível, use `--resume <session-id>` apenas com sessão conhecida no mesmo projeto/perfil. Use `--output-schema <arquivo>` e `--validation <manifest>` para formato e checks independentes. Revise os executáveis do manifest: eles rodam com permissões do Forja.
7. Informe execução, validação, origem do uso de tokens e custo separadamente. Schema sozinho não comprova qualidade. Não afirme custo zero quando ele é desconhecido.

Se não houver adapter ou CLI compatível, explique a lacuna e configure um wrapper revisável somente dentro do escopo autorizado. Não invente suporte a API, MCP ou recursos de sessão. Não recomende um provedor por reputação sem evidência atual da tarefa.
