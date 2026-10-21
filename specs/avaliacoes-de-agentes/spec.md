# Spec: avaliacoes-de-agentes

- **ID**: SPEC-054
- **Status**: done
- **Owner**: apk
- **Criado em**: 2026-10-21
- **Sprint alvo**: 5.2
- **ADRs relacionadas**: [ADR-0090](../../memory/90-decisions/0090-adapters-de-agente-somente-leitura.md) (adapters somente leitura), ADR-0093 (esta feature)

## 1. Problema
O Forja promete que, num projeto conectado, a IA segue o método: registra ADR em
`memory/90-decisions/`, cria spec com `forja spec:new`, liga teste a critério, consulta a memória antes
de responder. Os testes provam que os arquivos (AGENTS.md, skills, hooks, MCP) estão no lugar, mas
nada prova que um agente de verdade, lendo esses arquivos, faz a coisa certa. Uma mudança no
AGENTS.md ou numa skill pode piorar o comportamento sem nenhum teste ficar vermelho. O `llm:eval`
agrega execuções do `llm:run`, que é somente leitura e não tem tarefa nem gabarito. Medição hoje:
nenhuma.

## 2. Proposta de valor
`forja eval:agents` roda uma suíte fixa de tarefas com um agente real (Claude Code ou Codex) num
projeto Forja descartável e corrige cada uma de forma determinística, olhando o que ficou no disco,
os comandos executados e a resposta. O resultado vira histórico, comparado com a execução anterior
do mesmo agente e modelo.

## 3. User stories
- **Como** mantenedor do Forja, **quero** saber se uma mudança no AGENTS.md ou numa skill piorou o
  comportamento dos agentes, **para que** a regressão apareça antes do release.
- **Como** usuário escolhendo entre Claude e Codex, **quero** ver qual segue melhor o método do Forja, **para que** a escolha tenha evidência.
- **Como** dono da máquina, **quero** que o agente avaliado só escreva no projeto descartável e que o custo tenha teto, **para que** rodar a suíte não tenha efeito colateral.

## 4. Critérios de aceite (Definition of Done)
- [ ] AC-1: `forja eval:agents [--agent claude|codex] [--case a,b] [--model m] [--budget-usd n] [--json]` cria um workspace e um projeto descartáveis (`project:new --ai claude,codex`), aplica a semente de cada caso, roda o agente no projeto e corrige; o `forja` que o agente chama é o da instalação em teste.
- [ ] AC-2: os casos são dados (`templates/evals/agents/*.json`: id, prompt, semente, checks) e os checks são determinísticos: arquivo por glob com conteúdo, resposta, comando executado, critério coberto (`spec:trace`), comando que passa e arquivos inalterados.
- [ ] AC-3: a suíte inicial cobre ADR no lugar certo, spec criada pelo `spec:new`, teste que cita `SPEC-NNN AC-N`, resposta tirada da memória do projeto e próxima ação via `forja next`/`status`.
- [ ] AC-4: o agente só escreve no projeto e no workspace descartáveis: Codex com `-s workspace-write` (`-C` projeto, `--add-dir` workspace); Claude com `--permission-mode acceptEdits`, lista fechada de comandos Bash e `--max-budget-usd` por caso.
- [ ] AC-5: o resultado (por caso e por check, custo, duração) é anexado a `<workspace>/.context/agent-evals.jsonl` e comparado com a última execução do mesmo agente e modelo (casos que passaram a falhar ou a passar).
- [ ] AC-6: exit 0 quando todos os casos passam, 2 (`rejected`) quando algum falha, 1 quando o agente não está instalado ou o caso não existe; `--json` segue o contrato (ADR-0082).
- [ ] AC-7: o runner e os checks são testados offline com um agente falso; nenhum teste da suíte chama um provedor real.

## 5. Requisitos não-funcionais
- **Custo**: teto por caso (`--budget-usd`, padrão 1,00 no Claude); timeout por caso (padrão 300 s) nos dois.
- **Segurança**: nada fora dos diretórios descartáveis; o workspace real do usuário só recebe a linha de histórico.
- **Reprodutibilidade**: o histórico registra versão do Forja, agente, modelo e versão da CLI.

## 6. Fora de escopo
- Rodar no CI (custa e exige credenciais); fica sob demanda.
- Gemini, Cursor, opencode e Copilot CLI (entram com adapters de escrita confinada depois).
- Correção por LLM (juiz); só checks determinísticos.

## 7. Riscos e dependências
- Agentes não são determinísticos: um caso pode oscilar. O histórico mostra a oscilação; `--repeat` fica para depois.
- O Claude usa as configurações globais do usuário (hooks, plugins) além das do projeto; é o ambiente real, mas não é estéril.
