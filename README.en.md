<h1 align="center">🔨 Forja</h1>

<p align="center">
  <strong>Turn coding AI into an engineering team with process and memory:<br>every project starts from a spec, every decision becomes an ADR, and nothing is lost between sessions.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/forjajs"><img src="https://img.shields.io/npm/v/forjajs?style=flat-square&color=cb3837&logo=npm" alt="npm"></a>
  <img src="https://github.com/allanpablo/forja/actions/workflows/ci.yml/badge.svg" alt="CI">
  <img src="https://img.shields.io/badge/operation-CLI--first-3553ff?style=flat-square" alt="CLI-first">
  <img src="https://img.shields.io/badge/agents-6_roles-orange?style=flat-square" alt="6 agents">
  <img src="https://img.shields.io/badge/pipeline-SDD_+_GSD-teal?style=flat-square" alt="SDD+GSD">
  <img src="https://img.shields.io/badge/memory-SQLite_FTS5-green?style=flat-square" alt="Memory">
  <img src="https://img.shields.io/badge/node-%E2%89%A520-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node >= 20">
  <img src="https://img.shields.io/badge/license-MIT-1a1a1a?style=flat-square" alt="MIT">
  <img src="https://img.shields.io/badge/PRs-welcome-8957e5?style=flat-square" alt="PRs welcome">
</p>

<p align="center"><sub>🌐 <strong>English</strong> · <a href="README.md">Português</a></sub></p>

---

## Why Forja exists

Coding agents are **amnesiac and undisciplined**: every session starts from zero, architecture
decisions evaporate, code drifts from intent — and if you run several products at once, you pay
that tax multiplied by N.

**Forja** is the studio around the AI. It coordinates **6 agent roles** through a
**Spec-Driven (SDD)** + **Get-Stuff-Done (GSD)** pipeline, keeps a **hierarchical memory** indexed
in SQLite that survives across sessions, and ties it all together behind **a single core CLI with
gates and an audit trail** (`forja`, ADR-0020). Multi-AI by design (Claude, Copilot, Gemini,
Codex). Everything is driven from the CLI.

**Who it's for**: the solo dev or small team running multiple products with AI as the main
workforce — and needing the discipline of a big team without having one.

## The 3 pillars

| Pillar | What it delivers | Proof |
|---|---|---|
| **Memory that survives** | hierarchical, searchable context, shared across sessions and AIs | SQLite FTS5, smart-context (ADR-0003) |
| **Process that governs** | nothing becomes code without a spec; nothing structural without an ADR; every command audited | SDD+GSD, 7-field handoffs (ADR-0005), `forja` core (ADR-0020) |
| **A factory, not a single project** | multi-product workspace, per-project agent teams | ADR-0019, harness, codegraph (ADR-0017) |

> This repository is the **engine (framework)** — it does not host production apps.
> Your products live in the **Forja workspace** (`~/forja-workspace` by default), outside this repo.
> See ADR-0019 for the rationale.

## Forja in 60 seconds

```console
$ forja spec:new pix-payments
✓ Spec created: specs/pix-payments/spec.md            # nothing becomes code without this

$ forja gsd:handoff plan pix-payments
Handoff recorded: product → sdd-architect             # 7 fields, auditable (ADR-0005)

$ forja code:impact processPayment
Impact map: processPayment (depth 2)                  # blast radius BEFORE you edit
--- Direct callers ---
BillingController.charge · RetryWorker.run

$ forja gsd:check pix-payments
OK   GSD runbook      OK   Spec directory
OK   SDD spec check   OK   Codegraph
Result: baseline gates ready.                         # executable governance, not a checklist
```

And each command above was recorded in `.context/forja-runs.jsonl` — when governance asks "was the
process followed?", the answer is a file, not a promise.

## Why not just…?

| Alternative | Where it stops | What Forja adds |
|---|---|---|
| **Plain Claude Code / Copilot** | brilliant in-session, amnesiac between sessions | FTS5 memory + process + audit around the AI |
| **LangGraph / CrewAI** | infrastructure to *build* agents | the layer above: it *operates* the agent team day to day |
| **Templates & spec kits** | stop once the spec is written | the full pipeline through governance, with gates that execute |

## Key capabilities

- **Single core CLI** — every process command goes through `forja <command>`: a declarative
  registry, cross-cutting gates (workspace), and append-only audit in
  `.context/forja-runs.jsonl` (ADR-0020).
- **Multi-agent orchestration** — 6 roles (orchestrator, context-engineer, sdd-architect, product,
  marketing, governance) with tracked handoffs (7 fields, ADR-0005).
- **Hierarchical memory** — global → domain → task → summary, with FTS5 search and *smart-context*
  in 3 modes (ADR-0003).
- **SDD + GSD pipeline** — `spec → plan → tasks → check`, decisions recorded as ADRs.
- **Self-verification (invariants that run)** — the framework proves itself: a family of gates guards
  each frontier (core, tarball, doc coherence, agent topology, generated project), and `check:all`
  runs the whole battery into a single verdict. Governance stops depending on discipline — it becomes
  harness.
- **Token economy measured, not asserted** — memory (the `context.md` as a map) saves ~60% vs
  exploring cold, and `token:economy` **proves** it across your domains. `code:context` delivers the
  map ready to paste; `memory:audit` guarantees it doesn't lie about the code.
- **Project generation** — `project:new` scaffolds a full project (memory, agents, multi-AI
  instructions, a NestJS backend as the default boilerplate) and registers the record; `project:upgrade`
  brings new scaffold pieces to already-generated projects without touching the user's code.
- **3 integrated capabilities** (ADR-0016): **codegraph** (code analysis via MCP), **harness**
  (agent-team design), **ai-engineering** (knowledge base).

## ⚡ Quick start

```bash
# Install (the package is forjajs; the command is forja)
npm install -g forjajs
forja                    # help grouped by domain

# Prepare the production workspace (the fixed home for your projects)
forja workspace:init

# Create a new project (generated in ~/forja-workspace/projects/<name>)
forja project:new my-project --ai claude,copilot

# Enter the SDD/GSD cycle for the first feature
forja spec:new my-feature
forja spec:plan my-feature
forja spec:tasks my-feature
forja spec:check my-feature
```

> Cloned the repo instead of installing? The same commands run as
> `node bin/forja.ts <command>` — the npm scripts are just thin aliases of the core.
> The source is TypeScript and runs natively: **dev needs Node ≥ 22.6** (type stripping). The
> *published* package ships `dist/*.js` and runs on **Node ≥ 20** — the `release-gate` proves it
> every release (SPEC-012).

Step by step on **create vs update** a project: [`docs/processo-projeto.md`](docs/processo-projeto.md).

## How it works — the process

```
💡 Demand
   ├─ project does NOT exist ─► project:new + boilerplate + harness (designs the team)
   └─ project DOES exist ─────► overlay --only-memory + codegraph init (understands the code)
                                              │
                                              ▼
   CLI-first CYCLE (docs/fluxo.md):
   1·Understand → 2·Specify → 3·Architect → 4·Decompose → 5·Implement → 6·Govern → ✅
```

| Step | Role | Capability |
|------|------|------------|
| 1 Understand | context-engineer | codegraph · ai-engineering |
| 2 Specify | product | — |
| 3 Architect | sdd-architect | harness · ADR |
| 4 Decompose | sdd-architect | — |
| 5 Implement | orchestrator + worker | codegraph (MCP) |
| 6 Govern | governance | codegraph (`affected`) |

Full cycle map: [`docs/fluxo.md`](docs/fluxo.md).

## The 3 integrated capabilities

| Capability | Role | How to use |
|---|---|---|
| **codegraph** | code analysis (local MCP) | `forja code:index` · `codegraph explore "<area>"` · MCP tools `codegraph_explore`/`codegraph_node` |
| **harness** | agent-team design (plugin) | in a Claude Code session: _"build a harness for this project"_ → generates `.claude/agents` + `.claude/skills` |
| **ai-engineering** | knowledge base (reference) | see [`docs/capacidades-externas.md`](docs/capacidades-externas.md) |

Details and reinstall: [`docs/capacidades-externas.md`](docs/capacidades-externas.md) · [ADR-0016](memory/90-decisions/0016-integracao-capacidades-externas.md).

## The `forja` core

Every process command goes through a single entry point (ADR-0020):

```bash
forja                              # help grouped by domain
forja <command> [args]             # in a cloned repo: node bin/forja.ts <command>
```

The core applies **gates** before running (e.g. product commands fail fast without a workspace) and
records an **audit** of each run (command, args, exit code, duration) in
`<workspace>/.context/forja-runs.jsonl` — the trail governance uses at review. The repo's npm
scripts are thin aliases that route through the core.

## Essential commands

```bash
# Workspace & projects
forja workspace:init                       # create ~/forja-workspace
forja project:new <name> --ai claude,copilot  # create a project in the workspace
forja project:list                         # list workspace projects
forja workspace:project:check <name>       # validate standards in a workspace project

# SDD pipeline
forja spec:new <slug>                      # also: spec:plan · spec:tasks · spec:check

# Sprint & handoffs (GSD)
forja sprint:start                         # also: sprint:status · sprint:complete
forja gsd:plan <slug>                      # GSD runbook in .context/
forja gsd:handoff <intent> <slug>          # role-to-role handoff (ADR-0005)
forja gsd:check <slug>                     # baseline runbook gates
forja orchestrate "<goal>" --slug <s>      # open a run: the SDD/GSD chain as a gated state machine (SPEC-021)
forja orchestrate:status <slug>            # the machine state: stages, gates, verdicts
forja orchestrate:advance <slug>           # run the stage gate; green → next; red → blocked

# Code analysis (codegraph)
forja code:check                           # trustworthy index (worktree + freshness)
forja code:impact <symbol>                 # callers + blast radius before you edit
forja code:query "<term>"                  # also: code:index · code:sync · code:status

# Memory & context (workspace)
forja sync:universal                       # reindex the workspace SQLite FTS5
forja query:universal "<query>"            # FTS5 search
forja context:smart                        # smart-context (3 modes, ADR-0003)
forja memory:compress                      # archive old runs + VACUUM
forja memory:extract                       # extract global knowledge from memory

# Quality & release
forja project:check                        # framework standards (pre-commit)
forja tools:doctor                         # core X-ray; exit 1 if broken
forja release:check --publish              # tarball gate before publishing
forja project:smoke                        # generated-project gate; --full installs and builds the backend
forja project:dashboard                    # static status report

# Governance & audit
forja audit:sync                           # project the audit trail into a queryable table
forja audit:query --failed                 # query: --failed, --cmd <x>, --since 7d
forja governance:dashboard                 # static HTML panel (gates, SDD, audit) — no server
```

## Framework vs workspace separation

Forja is split in two:

1. **Framework** (this repository): the engine, conventions, scripts, and the framework's own memory.
2. **Workspace** (`~/forja-workspace` by default): the "fixed home" where product projects, their
   universal memory, and product specs live.

The workspace path is resolved by priority:

1. `FORJA_WORKSPACE` environment variable
2. `workspaceRoot` field in `~/.forjarc.json`
3. Default: `~/forja-workspace`

See ADR-0019 for the architectural decision.

## Repository structure (framework)

```
bin/          CLIs (forja — the core; init-project, create-memory-nest-kit)
lib/          Reusable modules; lib/core/ is the invariant engine (registry, checks, health, release, doc-graph, gates)
scripts/      Automation (sprint-manager, agent-router, sync-universal-memory, …)
specs/        The framework's own SDD pipeline (spec → plan → tasks)
boilerplates/ Stack templates (api-rest, saas, ecommerce, microservices, monorepo)
memory/       Framework memory (00-global … 90-decisions/ADRs)
docs/         Documentation by persona and by topic (see DOC-MAP.md)
prompts/      Portable prompts for the 6 roles
.claude/      Claude Code sub-agents and settings
projects/     LEGACY — do not use; projects live in the external workspace
```

## Workspace structure

```
~/forja-workspace/
  projects/              # generated products
  memory/
    sqlite/universal.db  # SQLite FTS5 for the products
    30-projects/         # project records
  specs/                 # product specs
  .context/              # product GSD runbooks
  README.md
```

## Documentation

The docs are written in **Brazilian Portuguese** — that's part of the project's identity. The CLI
output, code, and ADRs are readable regardless of language.

- [`DOC-MAP.md`](DOC-MAP.md) — map by role and by topic (start here)
- [`docs/processo-projeto.md`](docs/processo-projeto.md) — create vs update a project
- [`docs/fluxo.md`](docs/fluxo.md) — the CLI-first cycle map
- [`AGENTS.md`](AGENTS.md) — the 6 roles and the topology
- [`memory/90-decisions/`](memory/90-decisions/) — ADRs with rationale
- [`CHANGELOG.md`](CHANGELOG.md) — history

## Conventions

- **CLI-first** — sprints, SDD, GSD, handoffs, and governance by command; the UI is never a gate.
- **ADRs** — every structural decision becomes `memory/90-decisions/NNNN-title.md`.
- **Handoffs** — 7 required fields (ADR-0005), stored in SQLite (ADR-0008).
- **pt-BR** — communication and documentation in Portuguese.

## Roadmap

The throughline: **turn knowledge that lives as convention into an executable invariant.** Each item
below either closes a framework frontier with a gate, or carries that pattern into generated projects.

**Shipped** (through v1.6.0)

- [x] **Gate family** — every framework frontier is guarded by an invariant that runs: core
  (`tools:doctor`, ADR-0023), tarball (`release:check`, ADR-0024), doc + ADR + agent-topology
  coherence (ADR-0025, SPEC-019), generated project (`project:smoke`, ADR-0029). And `check:all`
  runs the whole battery into one verdict (SPEC-020).
- [x] **TypeScript migration complete** — source 100% `.ts`, ships `dist/`, `noImplicitAny` ON. Found
  latent bugs no test caught (SPEC-012).
- [x] **Memory economy as a system** — **measured** (`token:economy` proves ~60% vs cold),
  **delivered** (`code:context`), **protected** (`memory:audit`, both directions), and **propagated**:
  the generated project inherits the maps gate (ADR-0030).
- [x] **`project:upgrade`** — update an already-generated project without losing code: additive, never
  overwrites (SPEC-018).
- [x] **Calibrated Clean Architecture** — layers where they pay off, lean where they don't; and the
  token claim **measured and corrected** — the saving is memory's, not the layers' (ADR-0027).

**Next** (by dependency, not by wish)

- [x] **Generated backend `builds` under new toolchains** — the template now matches the
  framework's `better-sqlite3` (^12, with prebuilds); `check:all --full` compiles the generated
  backend on Node 26.
- [x] **`release-auditor` consumes the gate** — the agent runs and judges `release:check --publish`
  (ADR-0024), including `consumer-spec-new`; it doesn't reimplement the procedure.
- [ ] **Boilerplates beyond NestJS** — the process is stack-agnostic; the templates will follow.
- [ ] **(vision) the orchestration engine** — the handoff chain that **runs**, not just is coherent
  (SPEC-019 left it as future). The namesake executing: a 2.0 candidate.

Suggestions? Open an issue — a non-trivial feature here starts from a spec, yours included.

---

<p align="center">
  <strong>Did Forja help you tame your agents?</strong><br>
  A ⭐ is what carries the project to more devs still paying the amnesiac-AI tax.
</p>

<p align="center"><sub>Forja (npm: <code>forjajs</code>) · MIT License · <a href="CONTRIBUTING.md">Contributing</a></sub></p>
