<h1 align="center">🔨 Forja</h1>

<p align="center">
  <strong>Transforme IA de codificação em uma equipe de engenharia com processo e memória:<br>todo projeto nasce com spec, toda decisão vira ADR, e nada se perde entre sessões.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/forjajs"><img src="https://img.shields.io/npm/v/forjajs?style=flat-square&color=cb3837&logo=npm" alt="npm"></a>
  <img src="https://github.com/allanpablo/forja/actions/workflows/ci.yml/badge.svg" alt="CI">
  <img src="https://img.shields.io/badge/operação-CLI--first-3553ff?style=flat-square" alt="CLI-first">
  <img src="https://img.shields.io/badge/agentes-6_papéis-orange?style=flat-square" alt="6 agentes">
  <img src="https://img.shields.io/badge/pipeline-SDD_+_GSD-teal?style=flat-square" alt="SDD+GSD">
  <img src="https://img.shields.io/badge/memória-SQLite_FTS5-green?style=flat-square" alt="Memória">
  <img src="https://img.shields.io/badge/node-%E2%89%A522-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node >= 22">
  <img src="https://img.shields.io/badge/license-MIT-1a1a1a?style=flat-square" alt="MIT">
  <img src="https://img.shields.io/badge/PRs-welcome-8957e5?style=flat-square" alt="PRs welcome">
</p>

<p align="center"><sub>🌐 <a href="README.md">English</a> · <strong>Português</strong></sub></p>

---

## Por que a Forja existe

Agentes de IA são **amnésicos e indisciplinados**: cada sessão recomeça do zero, decisões
de arquitetura evaporam, o código diverge da intenção — e quem opera vários produtos ao
mesmo tempo paga esse imposto multiplicado por N.

A **Forja** é o estúdio em volta da IA. Ela coordena **6 papéis de agentes** num pipeline
**Spec-Driven (SDD)** + **Get-Stuff-Done (GSD)**, mantém uma **memória hierárquica**
indexada em SQLite que sobrevive entre sessões, e amarra tudo num **core CLI único com
gates e trilha de auditoria** (`forja`, ADR-0020). Multi-IA por design (Claude, Copilot,
Gemini, Codex). A operação é inteiramente via CLI.

**Para quem**: o dev solo ou time pequeno que opera múltiplos produtos com IA como
principal força de trabalho — e precisa da disciplina de um time grande sem ter esse time.

## Os 3 pilares

| Pilar | O que entrega | Prova |
|---|---|---|
| **Memória que sobrevive** | contexto hierárquico, buscável, compartilhado entre sessões e IAs | SQLite FTS5, smart-context (ADR-0003) |
| **Processo que governa** | nada vira código sem spec; nada estrutural sem ADR; comandos auditados | SDD+GSD, handoffs 7 campos (ADR-0005), core `forja` (ADR-0020) |
| **Fábrica, não projeto único** | workspace multi-produto, times de agentes por projeto | ADR-0019, harness, codegraph (ADR-0017) |

> Este repositório é o **motor (framework)** — não hospeda aplicações em produção.
> Os produtos do usuário vivem no **workspace Forja** (`~/forja-workspace` por padrão), fora deste repo.
> Veja ADR-0019 para a rationale.

## 60 segundos de Forja

```console
$ forja spec:new pagamentos-pix
✓ Spec criada: specs/pagamentos-pix/spec.md          # nada vira código sem isso

$ forja gsd:handoff plan pagamentos-pix
Handoff registrado: product → sdd-architect          # 7 campos, auditável (ADR-0005)

$ forja code:impact processPayment
Mapa de impacto: processPayment (profundidade 2)     # blast radius ANTES de editar
--- Chamadores diretos ---
BillingController.charge · RetryWorker.run

$ forja gsd:check pagamentos-pix
OK   GSD runbook      OK   Spec directory
OK   SDD spec check   OK   Codegraph
Resultado: gates básicos prontos.                    # governança executável, não checklist
```

E cada comando acima ficou gravado em `.context/forja-runs.jsonl` — quando a governança pergunta "o processo foi seguido?", a resposta é um arquivo, não uma promessa.

## Por que não só…?

| Alternativa | Onde ela para | O que a Forja acrescenta |
|---|---|---|
| **Claude Code / Copilot puros** | brilhantes na sessão, amnésicos entre sessões | memória FTS5 + processo + auditoria em volta da IA |
| **LangGraph / CrewAI** | infraestrutura para *construir* agentes | a camada de cima: opera o time de agentes no dia a dia |
| **Templates & spec kits** | param quando a spec está escrita | pipeline completo até a governança, com gates que executam |

## Capacidades-chave

- **Core CLI único** — todo comando de processo passa por `forja <comando>`: registry declarativo, gates transversais (workspace) e auditoria append-only em `.context/forja-runs.jsonl` (ADR-0020).
- **Orquestração multiagente** — 6 papéis (orchestrator, context-engineer, sdd-architect, product, marketing, governance) com handoffs rastreados (7 campos, ADR-0005).
- **Memória hierárquica** — global → domínio → tarefa → resumo, com busca FTS5 e *smart-context* em 3 modos (ADR-0003).
- **Pipeline SDD + GSD** — `spec → plan → tasks → check`, decisões registradas como ADRs.
- **Auto-verificação (invariantes que rodam)** — o framework prova a si mesmo: uma família de gates guarda cada fronteira (núcleo, tarball, coerência de doc, topologia de agentes, projeto gerado), e `check:all` roda a bateria inteira num veredito só. A governança deixa de depender de disciplina — vira harness.
- **Economia de token medida, não afirmada** — a memória (`context.md` como mapa) economiza ~60% vs explorar no frio, e `token:economy` **prova** isso nos seus domínios. `code:context` entrega o mapa pronto; `memory:audit` garante que ele não mente sobre o código.
- **Projetos que nascem conectados à sua IA** — `project:new` cria o scaffold completo (memória, agentes, backend NestJS como boilerplate padrão) e liga o projeto à IA que você usa: instruções nativas (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, Copilot), hooks do Claude Code que abrem cada sessão com o estado do projeto e anexam a spec citada no prompt, seis sub-agents por papel e o servidor MCP do Forja no Claude, Codex, Gemini e Copilot (VS Code). A memória já nasce indexada. `project:wire --check` prova a conexão; `project:upgrade --apply` religa projetos antigos sem tocar no código do usuário — ou o workspace inteiro com `--all` (ADR-0086). O backend NestJS segue o padrão oficial do NestJS 12 (ESM, Vitest, oxlint), e a página `/api/ops` mostra specs, handoffs em aberto e a memória indexada do projeto.
- **Templates validados** — `project:new <nome> --template clean-arch` parte de um boilerplate cuja instalação, build, testes e lint são provados no CI; `project:templates` lista o que é template e o que é arquitetura de referência (ADR-0088).
- **A jornada do usuário é gate** — `npm test` e `release:check` percorrem a jornada inteira (workspace → projeto → memória, contexto, specs, hooks, MCP e handoffs dentro do projeto), contra o fonte e contra o pacote instalado, e reprovam se algum comando escrever dentro do pacote.
- **3 capacidades integradas** (ADR-0016): **codegraph** (análise de código via MCP), **harness** (desenho de times de agentes), **ai-engineering** (base de conhecimento).
- **Engineering Control Plane** (v3.0, ADR-0078) — o Engineering Graph vira ADRs/SPECs em nós de primeira classe consultáveis; a Architecture Constitution checa o código real contra decisões já registradas; o Change Risk Engine pontua uma mudança 0-100 com fatores nomeados e evidenciados; `forja simulate` testa um ref num worktree isolado e nunca promove sozinho. Uma façade só, `forja engineer "<objetivo>"`, compõe tudo isso — contexto, ADRs relevantes, checagem de arquitetura, risco, agentes recomendados, incidentes parecidos — antes de você começar. Todo score é informação pra um humano/regra de política consultar, nunca uma decisão autônoma por si só.

## ⚡ Quick start

```bash
# Instalar (o pacote é forjajs; o comando é forja)
npm install -g forjajs
forja                    # help agrupado por domínio

# Preparar o workspace de produção (canto fixo dos projetos)
forja workspace:init

# Criar um projeto novo (gera em ~/forja-workspace/projects/<nome>, já conectado à sua IA)
forja project:new meu-projeto --ai claude,copilot
cd ~/forja-workspace/projects/meu-projeto
forja project:wire --check     # instruções, hooks, sub-agents e MCP conectados
forja status                   # memória indexada, specs, handoffs — depois abra sua IA aqui

# Entrar no ciclo SDD/GSD da primeira feature
forja spec:new minha-feature
forja spec:plan minha-feature
forja spec:tasks minha-feature
forja spec:check minha-feature
```

### Já tem um repositório?

```bash
cd meu-app-existente
forja project:wire --ai claude,codex   # instruções nativas, hooks, sub-agents, MCP
forja project:upgrade --apply          # camada de memória e agentes (aditivo: sem backend, sem sobrescrever)
forja sync:universal                   # indexa a memória
```

### Provar autonomia supervisionada localmente

A prova offline determinística usa uma fixture externa, Git worktree real,
aprovação humana, `npm test` real, validação de diff, promoção, estado SQLite,
evidências no GraphLoop e handoff compacto:

```bash
npm run demo:autonomy
```

O fluxo completo está documentado em [`docs/2x/SPRINT-12-REAL-AUTONOMY-PLAN.md`](docs/2x/SPRINT-12-REAL-AUTONOMY-PLAN.md).

Meça o baseline determinístico de contexto e a evidência de cache:

```bash
npm run benchmark:context
```

O sandbox também expõe rollback explícito e auditável após promoção. Os limites
oficiais dos plugins `@forja/plugin-github` e `@forja/plugin-docker` estão disponíveis;
handlers externos de rede ou Docker precisam ser injetados e permissionados pelo host.

> Clonou o repo em vez de instalar? Os mesmos comandos rodam como
> `node bin/forja.ts <comando>` — os scripts npm são apenas aliases finos do core.
> A fonte é TypeScript e roda nativa: **dev exige Node ≥ 22.6** (strip-types). O pacote *publicado*
> embarca `dist/*.js` e exige **Node ≥ 22** — o `release-gate` instala o tarball e percorre a jornada inteira do usuário nele a cada release (SPEC-012, ADR-0086).

Passo a passo de **criar vs atualizar** projeto: [`docs/processo-projeto.md`](docs/processo-projeto.md).

## Como funciona — o processo

```
💡 Demanda
   ├─ projeto NÃO existe ─► project:new + boilerplate + harness (desenha o time)
   └─ projeto JÁ existe ──► overlay --only-memory + codegraph init (entende o código)
                                              │
                                              ▼
   CICLO CLI-first (docs/fluxo.md):
   1·Entender → 2·Especificar → 3·Arquitetar → 4·Decompor → 5·Implementar → 6·Governar → ✅
```

| Etapa | Papel | Capacidade |
|-------|-------|------------|
| 1 Entender | context-engineer | codegraph · ai-engineering |
| 2 Especificar | product | — |
| 3 Arquitetar | sdd-architect | harness · ADR |
| 4 Decompor | sdd-architect | — |
| 5 Implementar | orchestrator + worker | codegraph (MCP) |
| 6 Governar | governance | codegraph (`affected`) |

Mapa completo do ciclo: [`docs/fluxo.md`](docs/fluxo.md).

## As 3 capacidades integradas

| Capacidade | Papel | Como usar |
|---|---|---|
| **codegraph** | análise de código (MCP local) | `forja code:index` · `codegraph explore "<área>"` · ferramentas MCP `codegraph_explore`/`codegraph_node` |
| **harness** | desenho de times de agentes (plugin) | na sessão Claude Code: _"build a harness for this project"_ → gera `.claude/agents` + `.claude/skills` |
| **ai-engineering** | base de conhecimento (referência) | ver [`docs/capacidades-externas.md`](docs/capacidades-externas.md) |

Detalhes e reinstalação: [`docs/capacidades-externas.md`](docs/capacidades-externas.md) · [ADR-0016](memory/90-decisions/0016-integracao-capacidades-externas.md).

## O core `forja`

Todos os comandos de processo passam por um único ponto de entrada (ADR-0020):

```bash
forja                              # help agrupado por domínio
forja <comando> [args]             # no repo clonado: node bin/forja.ts <comando>
```

O core aplica **gates** antes de executar (ex.: comandos de produto falham cedo sem
workspace) e grava **auditoria** de cada execução (comando, args, exit code, duração)
em `<workspace>/.context/forja-runs.jsonl` — a trilha que a governança usa no review.
Os scripts npm do repo são aliases finos que roteiam pelo core.

## Comandos essenciais

```bash
# Workspace & projetos
forja workspace:init                       # cria ~/forja-workspace
forja project:new <nome> --ai claude,copilot  # cria projeto no workspace, conectado à IA
forja project:wire [--check]               # (no projeto) conecta/verifica instruções, hooks, MCP
forja project:upgrade --apply              # (no projeto) peças novas de scaffold + religa (aditivo); --all p/ o workspace
forja project:templates                    # templates validados (project:new --template) × referência
forja project:list                         # lista projetos do workspace
forja workspace:project:check <nome>       # valida padrões num projeto do workspace

# Pipeline SDD
forja spec:new <slug>                      # também: spec:plan · spec:tasks · spec:check

# Sprint & handoffs (GSD)
forja sprint:start                         # também: sprint:status · sprint:complete
forja gsd:plan <slug>                      # runbook GSD em .context/
forja gsd:handoff <intent> <slug>          # handoff entre papéis (ADR-0005)
forja agent:route list --open --mine       # handoffs em aberto deste projeto (cada um carimbado com o projeto)
forja gsd:check <slug>                     # gates básicos do runbook
forja orchestrate "<objetivo>" --slug <s>  # abre a corrida: a cadeia SDD/GSD como máquina de estados (SPEC-021)
forja orchestrate:status <slug>            # o estado da máquina: etapas, gates, vereditos
forja orchestrate:advance <slug>           # roda o gate da etapa; verde → próxima; vermelho → trava

# Análise de código (codegraph)
forja code:check                           # índice confiável (worktree + freshness)
forja code:impact <símbolo>                # chamadores + blast radius antes de editar
forja code:context <domínio>               # pacote de contexto mínimo (o mapa; --code p/ o código)
forja code:query "<termo>"                 # também: code:index · code:sync · code:status

# Memória & contexto (workspace)
forja sync:universal                       # reindexa SQLite FTS5 do workspace
forja query:universal "<query>"            # busca FTS5
forja context:smart --mode task --task pix # smart-context: global | domain | task (ADR-0003)
forja token:economy [--project <path>]     # economia de token; --project mede seus domínios reais (ADR-0009)
forja memory:compress                      # arquiva runs antigos + VACUUM
forja memory:extract                       # extrai conhecimento global da memória
forja memory:audit                         # coerência mapa↔código: mapa não mente + módulo sem mapa (SPEC-017)

# Qualidade & release
forja project:check                        # standards do framework (pre-commit)
forja tools:doctor                         # raio-x do núcleo; separa permissão/lock de corrupção; exit 1 se quebrou
forja release:check --publish              # gate do tarball antes de publicar
forja project:smoke                        # gate do projeto gerado; --full instala e builda o backend
forja check:all                            # a bateria inteira de gates, um veredito; --full inclui os caros (SPEC-020)
forja project:dashboard                    # relatório estático de status
forja hook:session-start                   # o que o Claude Code roda ao abrir a sessão (briefing)
forja hook:user-prompt                     # o que roda a cada prompt (anexa a spec citada)

# Governança & auditoria
forja audit:sync                           # projeta a trilha de auditoria numa tabela consultável
forja audit:query --failed                 # consulta: --failed, --cmd <x>, --since 7d
forja governance:dashboard                 # painel HTML estático (gates, SDD, auditoria) — sem servidor
```

## Separação framework × workspace

O Forja é dividido em duas partes:

1. **Framework** (este repositório): motor, convenções, scripts e memória do próprio framework.
2. **Workspace** (`~/forja-workspace` por padrão): "canto fixo" onde vivem os projetos de produto, a memória universal deles e as specs de produto.

O caminho do workspace é resolvido por prioridade:

1. Variável de ambiente `FORJA_WORKSPACE`
2. Campo `workspaceRoot` em `~/.forjarc.json`
3. Padrão: `~/forja-workspace`

Veja ADR-0019 para a decisão arquitetural.

## Estrutura do repositório (framework)

```
bin/          CLIs (forja — o core; init-project, create-memory-nest-kit)
lib/          Módulos reutilizáveis; lib/core/ é o motor de invariantes (registry, checks, health, release, doc-graph, gates)
scripts/      Automação (sprint-manager, agent-router, sync-universal-memory, …)
specs/        Pipeline SDD do próprio framework (spec → plan → tasks)
boilerplates/ Templates de stack (api-rest, saas, ecommerce, microservices, monorepo)
memory/       Memória do framework (00-global … 90-decisions/ADRs)
docs/         Documentação por persona e por tópico (ver DOC-MAP.md)
prompts/      Prompts portáteis dos 6 papéis
.claude/      Sub-agents e settings do Claude Code
projects/     LEGADO — não usar; projetos vivem no workspace externo
```

## Estrutura do workspace

```
~/forja-workspace/
  projects/              # produtos gerados
  memory/
    sqlite/universal.db  # SQLite FTS5 dos produtos
    30-projects/         # fichas dos projetos
  specs/                 # specs de produto
  .context/              # runbooks GSD de produto
  README.md
```

## Dentro de um projeto gerado

```
meu-projeto/
  AGENTS.md              # como operar o projeto — lido nativamente por Codex, Copilot agent, Gemini
  CLAUDE.md, GEMINI.md   # importam o AGENTS.md (+ .github/copilot-instructions.md para o Copilot)
  .claude/
    settings.json        # hooks: forja hook:session-start / hook:user-prompt
    agents/              # orchestrator, product, sdd-architect, context-engineer, governance, marketing
  .mcp.json              # servidor MCP do forja (+ codegraph quando instalado)
  .codex/config.toml     # MCP do forja no Codex · .gemini/settings.json (Gemini) · .vscode/mcp.json (Copilot)
  .forja/models.json     # cadeia de fallback entre IAs (troca de motor)
  memory/                # memória hierárquica, indexada em memory/sqlite/ (fora do git)
  specs/                 # spec → plan → tasks
  backend/               # NestJS 12, ESM + Vitest + oxlint (exceto com --skip-backend; ou o do --template)
```

A parte gerenciada pelo Forja em cada arquivo de instrução fica entre `<!-- forja:begin -->` e
`<!-- forja:end -->`; o que estiver fora é seu e sobrevive a `project:wire`/`project:upgrade`.

## Documentação

- [`DOC-MAP.md`](DOC-MAP.md) — mapa por papel e por tópico (comece aqui)
- [`docs/processo-projeto.md`](docs/processo-projeto.md) — criar vs atualizar projeto
- [`docs/fluxo.md`](docs/fluxo.md) — mapa do ciclo CLI-first
- [`AGENTS.md`](AGENTS.md) — os 6 papéis e a topologia
- [`memory/90-decisions/`](memory/90-decisions/) — ADRs com rationale
- [`CHANGELOG.md`](CHANGELOG.md) — histórico

## Convenções

- **CLI-first** — sprints, SDD, GSD, handoffs e governança por comando; o front nunca é gate.
- **ADRs** — toda decisão estrutural vira `memory/90-decisions/NNNN-titulo.md`.
- **Handoffs** — 7 campos obrigatórios (ADR-0005), gravados no SQLite (ADR-0008).
- **Releases** — toda versão nova reconcilia o README com o seu comportamento e abre a entrada do
  `CHANGELOG.md` por uma seção `### O que melhorou` (diff em linguagem de produto vs. a versão
  anterior, reusada como nota de release no GitHub). Runbook: [`docs/publishing.md`](docs/publishing.md).
- **pt-BR** — comunicação e documentação em português.

## Roadmap

O fio condutor: **converter conhecimento que vive em convenção em invariante executável.** Cada
item abaixo ou fecha uma fronteira do framework por um gate, ou leva esse padrão para os projetos
gerados.

**Entregue** (v3.0.0 — Engineering Control Plane, ADR-0078)

- [x] **Engineering Graph** — ADRs/SPECs como nós de primeira classe consultáveis
  (`adr:list/show/impact/graph`), extração determinística, sem LLM (SPEC-032).
- [x] **Architecture Constitution** — `## Constraints` de ADR viram regras checadas contra o código
  real (`architecture:compile/check/status/explain/approve`), reaproveitando o `ApprovalLedger`, não
  um sistema de aprovação paralelo (SPEC-033).
- [x] **Change Risk Engine** — score 0-100 com 7 fatores nomeados e evidenciados
  (`risk:assess/explain`); o `PolicyEngine` pode opcionalmente consultá-lo (`riskScoreRange`), nunca
  um motor de decisão paralelo (SPEC-034).
- [x] **Evidence Ledger + `forja engineer`** — view agregada por run, e a façade que compõe contexto
  + ADRs relevantes + arquitetura + risco + agentes recomendados + incidentes parecidos + fluxo
  recomendado antes de você começar (SPEC-035, estendida em SPEC-042).
- [x] **Agent Identity & Reputation, Smart Routing** — registro persistente de agente com reputação
  derivada de comportamento real, nunca auto-declarada (`agent:register/score/recommend`,
  SPEC-036/037).
- [x] **Predictive Change Simulation** — `forja simulate <ref>` testa um ref num worktree git
  isolado; nunca promove sozinho (SPEC-038).
- [x] **AI Code Provenance + Runtime Monitoring** — `forja blame`/`sbom` (proveniência em
  granularidade de arquivo), `agent:monitor` (detecção de anomalia de comportamento contra a
  própria linha de base do agente) — os dois são informação pro `PolicyEngine`/um humano consultar,
  nunca automático (SPEC-039/040).
- [x] **Learning Loop** — `incident:record/list/similar`, sugestão por palavra-chave, nunca
  aplicação automática (SPEC-041).
- [x] **Prontidão de Autonomous Maintenance** — ADR-0079 documenta os guardrails que qualquer spec
  futura de manutenção autônoma real precisará respeitar; deliberadamente não habilitada ainda, por
  desenho explícito da própria visão.

**Entregue** (até v1.6.0)

- [x] **Família de gates** — cada fronteira do framework guarda por um invariante que roda: núcleo
  (`tools:doctor`, ADR-0023), tarball (`release:check`, ADR-0024), coerência de doc + ADRs + topologia
  de agentes (ADR-0025, SPEC-019), projeto gerado (`project:smoke`, ADR-0029). E `check:all` reúne a
  bateria num veredito (SPEC-020).
- [x] **Migração TypeScript completa** — fonte 100% `.ts`, publica `dist/`, `noImplicitAny` ON. Achou
  bugs latentes que nenhum teste pegava (SPEC-012).
- [x] **Economia de memória como sistema** — **medida** (`token:economy` prova ~60% vs frio),
  **entregue** (`code:context`), **protegida** (`memory:audit`, nas duas direções) e **propagada**: o
  projeto gerado herda o gate dos mapas (ADR-0030).
- [x] **`project:upgrade`** — atualizar um projeto já gerado sem perder código: aditivo, nunca
  sobrescreve (SPEC-018).
- [x] **Clean Architecture calibrado** — camadas onde se pagam, enxuto onde não; e a claim de token
  **medida e corrigida** — a economia é da memória, não das camadas (ADR-0027).
- [x] **`builds` do backend gerado sob toolchain novo** — o template alinhou o `better-sqlite3` ao
  do framework (^12, com prebuilds); o `check:all --full` compila o backend gerado em Node 26.
- [x] **`release-auditor` consome o gate** — o agente executa e julga `release:check --publish`
  (ADR-0024), incluindo o `consumer-spec-new`; não reimplementa o procedimento.

**Próximos passos** (por dependência, não por desejo)

- [ ] **Cross-project Intelligence** (resto da Fase 6) — correlacionar incidentes entre múltiplos
  repositórios; exige uma fonte de dado que este workspace de um único repositório ainda não tem.
- [ ] **Boilerplates além de NestJS** — o processo é agnóstico de stack; os templates vão atrás.

Sugestões? Abra uma issue — feature não-trivial aqui começa por spec, inclusive as suas.

## English

Full English version: **[README.md](README.md)**. In short — **Forja** turns coding AI into an
engineering team with process and memory: every project starts from a spec, every structural
decision becomes an ADR, and nothing is lost between sessions. Documentation is in Brazilian
Portuguese — that's part of the project's identity; the CLI and the code are readable regardless.

---

<p align="center">
  <strong>A Forja te ajudou a domar seus agentes?</strong><br>
  Uma ⭐ é o que faz o projeto chegar a mais devs que estão pagando o imposto da IA amnésica.
</p>

<p align="center"><sub>Forja (npm: <code>forjajs</code>) · MIT License · <a href="CONTRIBUTING.md">Contribuindo</a></sub></p>
