# ADR-0090: Adapters de agente em modo somente leitura (Gemini, Copilot CLI, Cursor, opencode)

- **Status**: accepted
- **Data**: 2026-10-21
- **Autor(es)**: Allan Pablo / Claude
- **Tags**: llm, adapters, security

## Contexto

O `llm:run` só tinha adapters completos para Codex e Claude (ADR-0081, ADR-0085). O adapter
`gemini-cli` chamava `gemini -p` em texto: sem uso de tokens e com as permissões padrão da CLI. O
`copilot` chamava `gh copilot suggest -t shell`, um sugeridor de comandos de shell, não um agente. Hoje
existem CLIs de agente com modo não interativo e somente leitura: Gemini CLI (`--approval-mode plan`,
`-o json`), GitHub Copilot CLI (`copilot -p`), Cursor Agent (`--print --mode plan --output-format json`)
e opencode (`run --agent plan`). Os formatos JSON do Gemini e do Cursor foram conferidos no código das
próprias CLIs instaladas (Gemini 0.64.0, Cursor Agent 2026.10.19).

## Decisão

1. **Todo adapter de agente roda em modo somente leitura/planejamento.** O `llm:run` é supervisionado
   e quem aplica mudanças é o fluxo do Forja, não o provedor. Isso já valia para o Codex (`--sandbox
   read-only`) e agora vale para Gemini (`--approval-mode plan`), Cursor (`--mode plan`), opencode
   (`--agent plan`) e Copilot CLI (`-p` sem `--allow-*`, que nega as ferramentas que pedem aprovação).
2. **Saída normalizada** para Gemini (`response`, `session_id`, tokens somados de
   `stats.models[*].tokens`) e Cursor (o mesmo envelope do Claude, com `usage` em camelCase ou
   snake_case). Uso ausente fica indefinido, e o custo fica `null`; nunca se inventa zero.
3. **`llm:doctor` verifica a compatibilidade** de cada adapter conferindo que a CLI oferece as flags de
   somente leitura que ele usa. Sem elas, o perfil é incompatível em vez de rodar com permissões que o
   Forja não pediu.
4. Os perfis padrão ganham `copilot`, `cursor` e `opencode`, **desligados** até o usuário habilitar.
5. Retomada de sessão continua só em Codex e Claude: o `--resume` do Gemini aceita "latest" ou um índice,
   não um ID explícito, e o Forja exige ID explícito (ADR-0081).

## Alternativas consideradas

- **Rodar os agentes com as permissões padrão de cada CLI.** Rejeitada: o comportamento mudaria de
  provedor para provedor e algumas CLIs editam arquivos sem perguntar no modo não interativo.
- **Manter o `gh copilot suggest`.** Rejeitada: ele não responde a tarefas, só sugere comandos de shell.
- **Retomada no Gemini com `--resume latest`.** Rejeitada: "a última sessão" é ambígua com execuções
  concorrentes e quebra a garantia de sessão explícita.

## Consequências

- `forja llm:run --profile gemini|copilot|cursor|opencode` funciona em modo de análise. Para editar
  código, o caminho continua sendo o fluxo supervisionado (spec → tasks → handoff).
- O perfil `copilot` muda de semântica (de `gh copilot` para o Copilot CLI). Perfis antigos com
  `command: "gh"` falham no `llm:doctor` e precisam de `command: "copilot"`.
