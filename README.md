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
  <img src="https://img.shields.io/badge/node-%E2%89%A520-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node >= 20">
  <img src="https://img.shields.io/badge/license-MIT-1a1a1a?style=flat-square" alt="MIT">
  <img src="https://img.shields.io/badge/PRs-welcome-8957e5?style=flat-square" alt="PRs welcome">
</p>

<p align="center"><sub>🌐 <a href="README.en.md">English</a> · <strong>Português</strong></sub></p>

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
- **Geração de projetos** — `project:new` cria scaffold completo no workspace (memória, agentes, instruções multi-IA, backend NestJS como boilerplate padrão) e registra a ficha do projeto automaticamente.
- **3 capacidades integradas** (ADR-0016): **codegraph** (análise de código via MCP), **harness** (desenho de times de agentes), **ai-engineering** (base de conhecimento).

## ⚡ Quick start

```bash
# Instalar (o pacote é forjajs; o comando é forja)
npm install -g forjajs
forja                    # help agrupado por domínio

# Preparar o workspace de produção (canto fixo dos projetos)
forja workspace:init

# Criar um projeto novo (gera em ~/forja-workspace/projects/<nome>)
forja project:new meu-projeto --ai claude,copilot

# Entrar no ciclo SDD/GSD da primeira feature
forja spec:new minha-feature
forja spec:plan minha-feature
forja spec:tasks minha-feature
forja spec:check minha-feature
```

> Clonou o repo em vez de instalar? Os mesmos comandos rodam como
> `node bin/forja.mjs <comando>` — os scripts npm são apenas aliases finos do core.

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
forja <comando> [args]             # no repo clonado: node bin/forja.mjs <comando>
```

O core aplica **gates** antes de executar (ex.: comandos de produto falham cedo sem
workspace) e grava **auditoria** de cada execução (comando, args, exit code, duração)
em `<workspace>/.context/forja-runs.jsonl` — a trilha que a governança usa no review.
Os scripts npm do repo são aliases finos que roteiam pelo core.

## Comandos essenciais

```bash
# Workspace & projetos
forja workspace:init                       # cria ~/forja-workspace
forja project:new <nome> --ai claude,copilot  # cria projeto no workspace
forja project:list                         # lista projetos do workspace
forja project:upgrade                      # traz peças novas de scaffold p/ um projeto (aditivo; --apply)
forja workspace:project:check <nome>       # valida padrões num projeto do workspace

# Pipeline SDD
forja spec:new <slug>                      # também: spec:plan · spec:tasks · spec:check

# Sprint & handoffs (GSD)
forja sprint:start                         # também: sprint:status · sprint:complete
forja gsd:plan <slug>                      # runbook GSD em .context/
forja gsd:handoff <intent> <slug>          # handoff entre papéis (ADR-0005)
forja gsd:check <slug>                     # gates básicos do runbook

# Análise de código (codegraph)
forja code:check                           # índice confiável (worktree + freshness)
forja code:impact <símbolo>                # chamadores + blast radius antes de editar
forja code:context <domínio>               # pacote de contexto mínimo (o mapa; --code p/ o código)
forja code:query "<termo>"                 # também: code:index · code:sync · code:status

# Memória & contexto (workspace)
forja sync:universal                       # reindexa SQLite FTS5 do workspace
forja query:universal "<query>"            # busca FTS5
forja context:smart                        # smart-context (3 modos, ADR-0003)
forja token:economy [--project <path>]     # economia de token; --project mede seus domínios reais (ADR-0009)
forja memory:compress                      # arquiva runs antigos + VACUUM
forja memory:extract                       # extrai conhecimento global da memória
forja memory:audit                         # coerência mapa↔código: mapa não mente + módulo sem mapa (SPEC-017)

# Qualidade & release
forja project:check                        # standards do framework (pre-commit)
forja tools:doctor                         # raio-x do núcleo; exit 1 se quebrou
forja release:check --publish              # gate do tarball antes de publicar
forja project:smoke                        # gate do projeto gerado; --full instala e builda o backend
forja project:dashboard                    # relatório estático de status

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
bin/          CLIs (init-project, create-memory-nest-kit)
lib/          Módulos reutilizáveis (workspace, generators, validators, context-builder)
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
- **pt-BR** — comunicação e documentação em português.

## Roadmap

O fio condutor: **converter conhecimento que vive em convenção em invariante executável.** Cada
item abaixo ou fecha uma fronteira do framework por um gate, ou leva esse padrão para os projetos
gerados.

**Recém-entregue** (v1.2.0)

- [x] **Gate do núcleo** — `tools:doctor` reprova (exit 1) quando o que impede o framework de
  trabalhar está quebrado (ABI, memória, deps de runtime) — ADR-0023.
- [x] **Gate do tarball** — `release:check` prova que uma instalação limpa funciona antes do
  `npm publish`; os três bugs históricos de release reprovam o gate — ADR-0024.
- [x] **Gate de coerência da doc** — a documentação não pode citar comando fantasma nem link para o
  nada; verificado no CI — ADR-0025.
- [x] **TypeScript como gate** — `checkJs` estrito no CI; os contratos do núcleo tipados. Achou três
  bugs latentes que nenhum teste pegava (SPEC-012, em curso).
- [x] **Boilerplate Clean Architecture calibrado** — DDD por camadas onde se paga, enxuto onde não
  (`boilerplates/06-clean-arch`, ADR-0027).

**Próximos passos** (por dependência, não por desejo)

- [x] **Migração TypeScript fechada** — fonte 100% `.ts`, publica `dist/`, `noImplicitAny` ON
  (SPEC-012, v1.3.x).
- [x] **Benchmark de token do clean-arch** — medido, não mais argumentado (`forja token:economy`,
  ADR-0027). Veredito honesto: para feature pequena o flat é mais barato; a economia do clean-arch é
  função da escala, e a justificativa das camadas é **isolamento**, não token.
- [ ] **`release-auditor` consome o gate** — a terceira superfície do ADR-0024: o agente roda
  `release:check` em vez de reimplementar o procedimento em prosa.
- [ ] **Boilerplates além de NestJS** — o processo é agnóstico de stack; os templates vão atrás.
- [ ] **Auditoria consultável + painel gerado** — promover `.context/forja-runs.jsonl` a tabela
  FTS5, e gerar um painel de governança **estático** por comando (leitura, sem servidor — a lição
  do ADR-0022, que congelou o dashboard-servidor).

Sugestões? Abra uma issue — feature não-trivial aqui começa por spec, inclusive as suas.

## English

Full English version: **[README.en.md](README.en.md)**. In short — **Forja** turns coding AI into an
engineering team with process and memory: every project starts from a spec, every structural
decision becomes an ADR, and nothing is lost between sessions. Documentation is in Brazilian
Portuguese — that's part of the project's identity; the CLI and the code are readable regardless.

---

<p align="center">
  <strong>A Forja te ajudou a domar seus agentes?</strong><br>
  Uma ⭐ é o que faz o projeto chegar a mais devs que estão pagando o imposto da IA amnésica.
</p>

<p align="center"><sub>Forja (npm: <code>forjajs</code>) · MIT License · <a href="CONTRIBUTING.md">Contribuindo</a></sub></p>
