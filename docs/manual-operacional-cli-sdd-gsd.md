# Manual Operacional CLI-First, SDD, GSD e Orquestracao

Este manual e o guia principal para operar o framework de agentes com excelencia, sem depender do dashboard web. A web fica como consulta opcional. A operacao diaria, o acompanhamento de sprint, as passagens entre papeis, a validacao e a governanca acontecem por linha de comando.

## 1. Visao Geral

O framework organiza desenvolvimento com agentes em quatro pilares:

1. **Orquestracao**: cada demanda passa pelo papel certo, no momento certo.
2. **SDD**: toda entrega relevante e descrita antes como `spec -> plan -> tasks`.
3. **GSD**: cada execucao vira um runbook com gates verificaveis.
4. **Hermes**: toda passagem de responsabilidade vira handoff registrado com 7 campos obrigatorios.

O objetivo nao e criar burocracia. O objetivo e impedir retrabalho, decisao perdida, implementacao sem criterio de aceite e sprint sem visibilidade.

## 2. Mentalidade CLI-First

Use o terminal como console operacional. O dashboard nao deve ser necessario para responder:

- O que esta na sprint?
- Qual spec esta ativa?
- Quem recebeu o handoff?
- O que falta para implementar?
- A entrega passou nos gates?
- O projeto esta pronto para release?

Comandos centrais:

```bash
npm run sprint:status
npm run gsd:plan -- <slug> "<objetivo>"
npm run gsd:handoff -- spec <slug>
npm run gsd:handoff -- plan <slug>
npm run gsd:handoff -- implement <slug>
npm run gsd:handoff -- review <slug>
npm run gsd:check -- <slug>
npm run project:check
```

## 3. Estrutura do Framework

Pastas principais:

```text
AGENTS.md                 Papéis e regras canonicas
prompts/                  Prompts portaveis por papel
.claude/agents/           Sub-agents Claude Code
specs/                    Pipeline SDD por feature
memory/40-delivery/       Backlog e sprint atual
memory/50-orchestration/  Protocolos de orquestracao
memory/90-decisions/      ADRs e decisoes estruturais
scripts/                  Harness CLI, sprint, specs, checks
.context/                 Runbooks GSD e context packs
dashboard/                Web opcional/legada
```

Arquivos que voce vai abrir com frequencia:

```bash
AGENTS.md
docs/manual-operacional-cli-sdd-gsd.md
docs/cli-first-operacao.md
memory/40-delivery/backlog.md
memory/40-delivery/current-sprint.md
memory/50-orchestration/gsd-harness.md
specs/<slug>/spec.md
specs/<slug>/plan.md
specs/<slug>/tasks.md
.context/gsd-<slug>.md
```

## 4. Os 6 Papeis

Cada papel existe em tres lugares:

- `.claude/agents/<name>.md`: sub-agent executavel no Claude Code.
- `prompts/<name>-agent.md`: prompt portavel para Copilot, Gemini, Codex etc.
- `AGENTS.md`: referencia canonica de responsabilidade.

### 4.1 Orchestrator

Use quando a demanda atravessa multiplos papeis ou quando voce quer coordenar uma execucao.

Responsabilidades:

- Decompor a demanda.
- Escolher o proximo papel.
- Criar ou acionar runbook GSD.
- Registrar handoffs Hermes.
- Consolidar memoria ao fim de sprint.

Nao faz:

- Implementacao direta.
- Decisao de produto sozinho.
- Aprovar release sem Governance.

Comandos tipicos:

```bash
npm run gsd:plan -- <slug> "<objetivo>"
npm run gsd:handoff -- spec <slug>
npm run gsd:handoff -- plan <slug>
npm run gsd:handoff -- implement <slug>
npm run gsd:handoff -- review <slug>
```

### 4.2 Context Engineer

Use antes de tarefa pesada, refator multi-arquivo, analise longa ou quando o assunto envolve tokens/cache.

Responsabilidades:

- Montar contexto inteligente.
- Gerar `.context/context-*.md`.
- Medir e reduzir tokens.
- Compactar memoria quando necessario.

Comandos tipicos:

```bash
npm run dev -- context:build global <projeto>
npm run dev -- context:build domain <projeto> "<dominio>"
npm run dev -- context:build task <slug> "<palavras-chave>"
npm run memory:vacuum
```

### 4.3 Product

Use quando ainda nao esta claro o que deve ser entregue.

Responsabilidades:

- Criar `spec.md`.
- Definir problema, proposta de valor, user stories e escopo.
- Definir metrica de sucesso em 30 dias.
- Priorizar backlog via RICE.

Comandos tipicos:

```bash
npm run spec:new -- <slug>
npm run spec:check -- <slug>
```

### 4.4 SDD Architect

Use quando a spec esta aprovada e precisa virar plano tecnico.

Responsabilidades:

- Criar `plan.md`.
- Criar `tasks.md`.
- Abrir ADRs quando houver decisao estrutural.
- Recusar specs vagas.

Comandos tipicos:

```bash
npm run spec:plan -- <slug>
npm run spec:tasks -- <slug>
npm run gsd:handoff -- plan <slug>
```

### 4.5 Marketing

Use antes de release, landing, copy, posicionamento, instrumentacao AARRR ou analise pos-launch.

Responsabilidades:

- Escrever copy conectada a dor da spec.
- Propor eventos de funil.
- Analisar metricas reais.

Nao faz:

- Inventar numeros.
- Decidir arquitetura.
- Mudar escopo tecnico.

### 4.6 Governance

Use antes de merge, release ou encerramento de sprint.

Responsabilidades:

- Rodar checks.
- Auditar handoffs.
- Validar criterios de aceite.
- Bloquear entrega se houver risco, falta de spec, falta de teste ou quebra de seguranca.

Comandos tipicos:

```bash
npm run gsd:check -- <slug>
npm run spec:check -- <slug>
npm test
npm run project:check
```

## 5. Fluxo SDD

SDD significa Spec-Driven Development. O codigo so deve vir depois de clareza.

Fluxo:

```text
Product        -> spec.md   -> por que fazer
SDD Architect  -> plan.md   -> como fazer
SDD Architect  -> tasks.md  -> passos executaveis
Worker         -> codigo    -> implementacao
Governance     -> checks    -> validacao
```

### 5.1 Spec

Arquivo:

```text
specs/<slug>/spec.md
```

Deve responder:

- Qual problema esta sendo resolvido?
- Quem sente essa dor?
- O que fica dentro e fora do escopo?
- Quais criterios de aceite provam que acabou?
- Quais restricoes existem?
- Qual metrica de sucesso em 30 dias?

Criar spec:

```bash
npm run spec:new -- <slug>
```

Validar spec:

```bash
npm run spec:check -- <slug>
```

### 5.2 Plan

Arquivo:

```text
specs/<slug>/plan.md
```

Deve responder:

- Qual abordagem tecnica?
- Quais modulos mudam?
- Quais contratos/API/CLI/schema mudam?
- Quais decisoes foram tomadas?
- Quais alternativas foram rejeitadas?
- Precisa de ADR?

Gerar plan:

```bash
npm run spec:plan -- <slug>
```

Regra: `spec:plan` so deve rodar quando a spec estiver aprovada.

### 5.3 Tasks

Arquivo:

```text
specs/<slug>/tasks.md
```

Deve conter tarefas executaveis com:

- ID da tarefa.
- Owner.
- Dependencias.
- Paths afetados.
- Criterio de done.

Gerar tasks:

```bash
npm run spec:tasks -- <slug>
```

Regra: `spec:tasks` so deve rodar quando o plano estiver aprovado.

## 6. Fluxo GSD

GSD e o harness de execucao. Ele cria e valida um runbook para a entrega.

Criar runbook:

```bash
npm run gsd:plan -- <slug> "<objetivo>"
```

Isso gera:

```text
.context/gsd-<slug>.md
```

Esse arquivo acompanha os gates:

1. Briefing.
2. Estrutura.
3. Sprints.
4. Contexto.
5. Spec.
6. Design, somente se houver UI.
7. Plano.
8. Desenvolvimento.
9. Validacao.
10. Governance.

Validar:

```bash
npm run gsd:check -- <slug>
```

Se houver impacto visual:

```bash
npm run design:select -- agent-console tecnico
npm run design:check -- design-md/examples/agent-console-brief.md
npm run gsd:check -- <slug> design-md/examples/agent-console-brief.md
```

Se nao houver UI, nao passe brief. O fluxo CLI-only nao deve ser bloqueado por design.

## 7. Handoffs Hermes

Handoff e passagem formal de responsabilidade.

Todo handoff precisa dos 7 campos da ADR-0005:

| Campo | Significado |
|---|---|
| `from` | Quem esta entregando |
| `to` | Quem recebe |
| `intent` | Intencao da passagem |
| `context` | Contexto minimo para continuar |
| `acceptance` | Como saber que o trabalho foi aceito |
| `constraints` | Restrições obrigatorias |
| `return` | Para quem devolver |

Comando generico:

```bash
npm run hermes:handoff -- '{"from":"orchestrator","to":"product","intent":"spec","context":"specs/<slug>","acceptance":"spec aprovada com AC testaveis","constraints":"pt-BR; nao implementar codigo","return":"orchestrator"}'
```

Atalhos do GSD:

```bash
npm run gsd:handoff -- spec <slug>
npm run gsd:handoff -- plan <slug>
npm run gsd:handoff -- implement <slug>
npm run gsd:handoff -- review <slug>
```

Ordem recomendada:

```text
Orchestrator -> Product       spec
Product      -> SDD Architect plan
SDD Architect-> Worker        implement
Worker       -> Governance    review
Governance   -> Orchestrator  fechamento
```

## 8. Sprints

O acompanhamento de sprint fica em:

```text
memory/40-delivery/current-sprint.md
```

O backlog fica em:

```text
memory/40-delivery/backlog.md
```

### 8.1 Iniciar sprint no framework raiz

```bash
npm run sprint:start
```

O script busca itens de alta prioridade. Se o backlog estiver em tabela RICE, ele seleciona itens `P0` e `P1`.

### 8.2 Ver status

```bash
npm run sprint:status
```

### 8.3 Encerrar sprint

```bash
npm run sprint:complete
```

O fechamento cria relatorio em:

```text
memory/60-runs/sprint-close-<timestamp>.md
```

### 8.4 Operar sprint de um projeto no workspace

```bash
npm run sprint:start -- NomeDoProjeto
npm run sprint:status -- NomeDoProjeto
npm run sprint:complete -- NomeDoProjeto
```

Os projetos de produto vivem em `~/forja-workspace/projects/<NomeDoProjeto>` (configurável via `FORJA_WORKSPACE` ou `~/.forjarc.json`). Veja ADR-0019.

## 9. Rotina Recomendada

### 9.1 Inicio do dia

```bash
git status --short
npm run sprint:status
npm run spec:check
```

Leia:

```bash
memory/40-delivery/current-sprint.md
```

Escolha uma entrega e confirme se existe:

```text
specs/<slug>/spec.md
specs/<slug>/plan.md
specs/<slug>/tasks.md
```

### 9.2 Antes de mexer em codigo

```bash
npm run dev -- context:build task <slug> "<palavras-chave>"
npm run gsd:plan -- <slug> "<objetivo>"
npm run gsd:handoff -- implement <slug>
```

Leia:

```text
.context/gsd-<slug>.md
specs/<slug>/tasks.md
```

### 9.3 Durante a implementacao

Mantenha foco em:

- Paths definidos em `tasks.md`.
- Criterios de aceite da spec.
- Contratos do plano.
- Nenhuma refatoracao fora do escopo.

Checklist local:

```bash
npm run spec:check -- <slug>
npm run gsd:check -- <slug>
```

### 9.4 Antes de entregar

```bash
npm run gsd:handoff -- review <slug>
npm run gsd:check -- <slug>
npm run spec:check -- <slug>
npm test
npm run project:check
```

Se algum comando falhar, nao entregue como pronto. Registre a pendencia no handoff ou em `tasks.md`.

### 9.5 Fechamento da sprint

```bash
npm run sprint:status
npm run sprint:complete
```

Depois consolide memoria:

```bash
npm run memory:vacuum
npm run sync:universal
```

## 10. Governanca

Governance nao e opiniao. Governance e evidencia.

Uma entrega so esta pronta quando:

- A spec existe e esta coerente.
- O plano existe quando houve decisao tecnica.
- As tasks refletem o que foi implementado.
- O GSD check passa.
- Testes relevantes passaram.
- `project:check` passou.
- Handoffs foram registrados.
- Riscos residuais foram explicitados.

Comandos:

```bash
npm run gsd:check -- <slug>
npm run spec:check -- <slug>
npm test
npm run project:check
```

`project:check` sem argumento valida o framework raiz. Com argumento, valida projeto em `~/forja-workspace/projects/<nome>`.

```bash
npm run project:check
npm run project:check -- NomeDoProjeto
```

## 11. Contexto e Memoria

Use contexto inteligente para reduzir custo mental e tokens.

Modos:

| Modo | Uso |
|---|---|
| `global` | Entender padroes gerais |
| `domain` | Entender um dominio especifico |
| `task` | Executar uma entrega |

Comandos:

```bash
npm run dev -- context:build global <projeto>
npm run dev -- context:build domain <projeto> "<dominio>"
npm run dev -- context:build task <slug> "<palavras-chave>"
```

Memoria relevante:

```text
memory/00-global/       Missao e padroes
memory/10-product/      Produto e personas
memory/20-architecture/ Arquitetura
memory/40-delivery/     Backlog e sprint
memory/50-orchestration Protocolos
memory/60-runs/         Logs e fechamentos
memory/90-decisions/    ADRs

# Workspace (fora do repo do framework)
~/forja-workspace/projects/              Projetos de produto
~/forja-workspace/memory/30-projects/    Projetos rastreados
~/forja-workspace/memory/sqlite/         Memoria universal
```

Sincronizar memoria universal:

```bash
npm run sync:universal
```

Consultar memoria:

```bash
npm run query:universal -- "<termo>"
```

Compactar:

```bash
npm run memory:vacuum
```

## 12. Potencia de Desenvolvimento e Economia de Tokens

Use estes comandos para transformar contexto em artefatos pequenos, medidos e reutilizaveis.

### 12.1 Schema auxiliar do banco

```bash
npm run memory:schema
```

Cria tabelas aditivas em `~/forja-workspace/memory/sqlite/universal.db`:

| Tabela | Uso |
|---|---|
| `spec_summaries` | resumo compacto por spec |
| `context_runs` | historico de contextos gerados e budget |
| `asset_catalog` | boilerplates e referencias design-md catalogados |

Essas tabelas nao substituem `memory_nodes` nem `handoffs`. Elas melhoram consulta e governanca sem quebrar o schema principal.

### 12.2 Sprint pack

```bash
npm run context:sprint
```

Gera:

```text
.context/sprint-pack.md
```

Use como primeiro contexto de qualquer sessao. Ele inclui somente sprint atual, specs ativas, handoffs abertos e ADRs recentes.

### 12.3 Agent brief

```bash
npm run agent:brief -- <role> <slug>
```

Exemplo:

```bash
npm run agent:brief -- governance dev-token-assets-db
```

Gera:

```text
.context/agent-brief-<role>-<slug>.md
```

Use antes de chamar um agente especifico. Ele evita carregar `spec.md`, `plan.md` e `tasks.md` completos quando um resumo operacional basta.

### 12.4 Token budget

```bash
npm run context:budget -- <slug|arquivo> [limite]
```

Exemplos:

```bash
npm run context:budget -- .context/sprint-pack.md
npm run context:budget -- .context/asset-catalog.md 12000
```

Padrao: usa `tokenLimits.task` de `.memoryrc.json`, hoje 8000 tokens.

Se passar do limite, o comando falha. Isso deve ser tratado como sinal de contexto inchado.

### 12.5 Catalogo de boilerplates e design system

Gere ou atualize manifests normalizados:

```bash
npm run catalog:manifests
```

Isso cria:

```text
boilerplates/<nome>/boilerplate.manifest.json
design-md/<nome>/design.manifest.json
```

Depois gere o catalogo:

```bash
npm run catalog:assets
```

Gera:

```text
.context/asset-catalog.md
```

Tambem popula `asset_catalog` no SQLite com:

- boilerplates
- referencias de `design-md`
- caminho do README
- resumo curto
- tags vindas dos manifests

Use antes de escolher base tecnica ou referencia visual.

### 12.6 Benchmark de tokens

```bash
npm run token:benchmark
```

Use para comparar contexto completo versus modos `global`, `domain` e `task`.

## 13. Design e Web

Design entra apenas quando existe impacto visual real.

Use:

```bash
npm run design:select -- <surface> <tom>
npm run design:check -- <brief.md>
```

Exemplo:

```bash
npm run design:select -- agent-console tecnico
npm run design:check -- design-md/examples/agent-console-brief.md
```

Nao use design como etapa obrigatoria para:

- CLI.
- Scripts.
- Specs.
- Handoffs.
- Checks.
- Refatoracoes sem interface.

Dashboard:

```bash
npm run dashboard
```

Use somente para consulta visual ou depuracao de telas. Nao trate como fonte primaria de operacao.

## 14. Comandos por Objetivo

### Criar nova entrega

```bash
npm run spec:new -- <slug>
npm run gsd:plan -- <slug> "<objetivo>"
npm run gsd:handoff -- spec <slug>
```

### Planejar entrega aprovada

```bash
npm run spec:plan -- <slug>
npm run spec:tasks -- <slug>
npm run gsd:handoff -- plan <slug>
```

### Implementar

```bash
npm run dev -- context:build task <slug> "<palavras-chave>"
npm run gsd:handoff -- implement <slug>
```

### Revisar

```bash
npm run gsd:handoff -- review <slug>
npm run gsd:check -- <slug>
npm run spec:check -- <slug>
npm test
npm run project:check
```

### Auditar todas as specs

```bash
npm run spec:check
```

### Ver sprint

```bash
npm run sprint:status
```

### Encerrar sprint

```bash
npm run sprint:complete
```

## 15. Padroes de Qualidade

### 14.1 Uma spec boa

Uma spec boa tem:

- Problema concreto.
- Persona clara.
- Criterios de aceite testaveis.
- Escopo fora explicito.
- NFRs objetivos.
- Metrica de sucesso.

Uma spec ruim diz:

- "Melhorar o sistema."
- "Deixar mais bonito."
- "Fazer funcionar."
- "Otimizar performance" sem numero.

### 14.2 Um plan bom

Um plan bom tem:

- Modulos afetados.
- Contratos alterados.
- Riscos.
- Alternativas rejeitadas.
- Necessidade ou nao de ADR.

### 14.3 Tasks boas

Tasks boas tem:

- Owner.
- Paths.
- Dependencias.
- Done verificavel.
- Teste ou check associado.

### 14.4 Handoff bom

Handoff bom permite que outro agente continue sem perguntar:

- O que foi feito?
- O que falta?
- Onde esta o contexto?
- Qual criterio de aceite?
- Quais restricoes?
- Para quem devolver?

## 16. Erros Comuns

### Erro: implementar sem spec

Sintoma:

```text
Codigo muda, mas ninguem sabe qual AC ele atende.
```

Correcao:

```bash
npm run spec:new -- <slug>
```

### Erro: plan criado com spec em draft

Sintoma:

```text
spec:check falha porque plan existe antes da spec aprovada.
```

Correcao:

- Aprovar ou corrigir status da spec.
- Ou remover plan/tasks se foram criados cedo demais e ainda nao devem existir.

### Erro: design bloqueando CLI

Sintoma:

```text
Entrega sem UI tentando passar por design:check.
```

Correcao:

```bash
npm run gsd:check -- <slug>
```

Sem brief visual.

### Erro: sprint sem criterio de fechamento

Sintoma:

```text
Itens ficam eternamente em current-sprint.md.
```

Correcao:

```bash
npm run sprint:complete
```

Pendencias voltam para backlog quando aplicavel.

## 17. Exemplo Completo

Objetivo: criar uma feature `inventario-ativos`.

### 16.1 Criar spec

```bash
npm run spec:new -- inventario-ativos
```

Editar:

```text
specs/inventario-ativos/spec.md
```

Quando aprovada:

```bash
npm run spec:check -- inventario-ativos
```

### 16.2 Criar runbook GSD

```bash
npm run gsd:plan -- inventario-ativos "criar inventario multiempresa e CRUD de ativos"
```

### 16.3 Registrar handoff para Product

```bash
npm run gsd:handoff -- spec inventario-ativos
```

### 16.4 Planejar

```bash
npm run spec:plan -- inventario-ativos
npm run spec:tasks -- inventario-ativos
npm run gsd:handoff -- plan inventario-ativos
```

### 16.5 Implementar

```bash
npm run dev -- context:build task inventario-ativos "inventario ativos CRUD empresa"
npm run gsd:handoff -- implement inventario-ativos
```

Implementar somente o que esta em `tasks.md`.

### 16.6 Revisar

```bash
npm run gsd:handoff -- review inventario-ativos
npm run gsd:check -- inventario-ativos
npm run spec:check -- inventario-ativos
npm test
npm run project:check
```

### 16.7 Fechar sprint

```bash
npm run sprint:status
npm run sprint:complete
```

## 18. Checklist de Excelencia

Antes de dizer "pronto", confira:

- [ ] Existe `spec.md`.
- [ ] Existe `plan.md` quando houve decisao tecnica.
- [ ] Existe `tasks.md`.
- [ ] Handoff Hermes foi registrado.
- [ ] `gsd:check` passou.
- [ ] `spec:check` passou.
- [ ] Testes relevantes passaram.
- [ ] `project:check` passou.
- [ ] Sprint foi atualizada.
- [ ] Riscos residuais foram reportados.
- [ ] Web/design nao foi usado como bloqueio quando a tarefa era CLI-only.

## 19. Comando de Bolso

Para operar uma entrega comum:

```bash
npm run sprint:status
npm run dev -- context:build task <slug> "<palavras-chave>"
npm run gsd:plan -- <slug> "<objetivo>"
npm run gsd:handoff -- spec <slug>
npm run gsd:handoff -- plan <slug>
npm run gsd:handoff -- implement <slug>
npm run gsd:handoff -- review <slug>
npm run gsd:check -- <slug>
npm run spec:check -- <slug>
npm test
npm run project:check
```

Se isso estiver verde, a operacao esta sob controle.
