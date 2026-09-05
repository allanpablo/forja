# Plan: Sessões e validação LLM

- **Spec**: ./spec.md
- **Status**: approved
- **Criado em**: 2026-09-05

## Arquitetura

Reusar SqliteJsonRepository para metadados de sessões e evidências. Vincular sessão ao caminho
real do projeto e fingerprint do perfil de execução (provedor, modelo, comando, argumentos e
privacidade). Esforço e timeout podem mudar sem trocar a identidade.

Estender buildLlmExecution com opções resume/outputSchema. Resume só Codex, ID explícito e sem
seleção automática da última sessão. Opções exec/resume verificadas no help local 0.153.4.

Criar lib/llm/validation.ts com compilação Ajv e execução sequencial dos checks via runLlm.
Pré-carregar manifest e schema antes de chamar provedor. Schema valida formato; aprovação de
tarefa exige checks locais. scripts/llm-fit.ts coordena e grava evidências sanitizadas.

## Impacto e dependências

- packages/llm: construção de argv; chamado por scripts/llm-fit.ts e testes.
- lib/llm/session.ts e validation.ts: metadados e verificação; Ajv 8 como dependência runtime.
- packages/evals: métricas adicionais de validação, preservando métricas existentes.
- docs/llm-fit-loop.md: comandos e exemplos; nenhum comando novo no registry.
- Sem migration: coleções adicionais em forja_records existente.

Codegraph ausente; code:check/code:impact executados e chamadas mapeadas com rg.
Testar com fixtures independentes do provedor, depois suíte completa, tipos, build e gates.


## Evidências da entrega — 2026-09-05

- npm test: 472 testes passaram, zero falhas e zero skips.
- npm run types:check e npm run build: passaram.
- spec:check, gsd:check e project:check: passaram.
- tools:doctor: núcleo operante; ferramentas opcionais ausentes e memória ainda não sincronizada.
- git diff --check: passou.
- Argv de retomada conferido no parser/help local do Codex 0.153.4, sem iniciar modelo.
- Fixtures exercitam sessão inicial e continuação, isolamento de projeto e perfil, troca indevida
  de sessão, schemas draft-07/2020-12, checks de requisito, timeout e persistência sem conteúdo.
- Ajv 8.20.0 instalado como dependência runtime; npm também alinhou a versão raiz do lockfile
  à versão 3.0.0 já declarada no package.json.
- Não houve chamada real a LLM. Acesso da conta ao GPT-6 e retenção de sessões do provedor
  não foram exercitados nesta entrega.

## Continuidade

Etapa 2 concluída. Próximo escopo: benchmark com tarefas reais e melhoria das recomendações por
qualidade, custo, risco e latência. Cache/API e MCP continuam nas etapas posteriores da visão.
