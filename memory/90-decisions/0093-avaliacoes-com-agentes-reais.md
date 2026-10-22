# ADR-0093: Avaliações com agentes reais em projeto descartável

- **Status**: accepted
- **Data**: 2026-10-21
- **Autor(es)**: Allan Pablo / Claude
- **Tags**: llm, evals, qualidade, security

## Contexto

Os testes do Forja provam que o projeto gerado tem instruções, skills, hooks e MCP no lugar. Não
provam que um agente real, lendo isso, segue o método. O `llm:run` roda os agentes somente leitura
(ADR-0090), o que impede avaliar tarefas que exigem escrever: registrar um ADR, criar uma spec,
escrever um teste.

## Decisão

1. **`forja eval:agents` é a única exceção à regra de somente leitura**, e só porque o alvo é
   descartável: workspace e projeto criados num diretório temporário para a execução e apagados no
   fim. Nunca roda no projeto do usuário.
2. **Escrita confinada pelo próprio agente**: Codex com sandbox `workspace-write` (projeto e workspace
   descartáveis como raízes graváveis); Claude com `acceptEdits` (edições no diretório de trabalho e no
   `--add-dir`), lista fechada de comandos Bash e teto de custo por caso.
3. **Casos são dados e a correção é determinística**: arquivos, comandos executados, resposta e
   `spec:trace`. Sem juiz LLM, para que o resultado não oscile por causa do corretor.
4. **Sob demanda, fora do CI**: custa dinheiro e exige credenciais. O histórico em
   `.context/agent-evals.jsonl` permite comparar versões do Forja, agentes e modelos.

## Alternativas consideradas

- **Avaliar só respostas em modo somente leitura.** Rejeitada: os comportamentos que importam
  (ADR, spec, teste) são escritas.
- **Juiz LLM para corrigir.** Rejeitada por ora: adiciona custo e uma segunda fonte de variação.
- **Rodar no CI com credenciais de serviço.** Rejeitada: custo recorrente e segredos no CI para um
  sinal que é útil antes de release, não a cada commit.

## Consequências

- Mudanças em AGENTS.md, skills e hooks podem ser medidas antes do release.
- Agentes não são determinísticos; um caso pode oscilar entre execuções, e o histórico mostra isso.
- O Claude roda com as configurações globais do usuário (não é um ambiente estéril).
