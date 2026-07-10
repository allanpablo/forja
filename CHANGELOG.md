# Changelog

Histórico consolidado das mudanças estruturais do framework. Para decisões arquiteturais com rationale, ver `memory/90-decisions/`.

---

## [Unreleased] — Dashboard congelado

SPEC-002 (`specs/agent-dashboard/`) passa a `abandoned`. O código permanece em `dashboard/`,
versionado e com os 68 testes verdes, mas deixa de ser superfície pública. Ver
ADR-0022 (`memory/90-decisions/0022-congelar-dashboard-web.md`) para rationale e condições de retomada.

### Corrigido
- **Bug de release**: `docs/dashboard.md` e o script `npm run dashboard` eram publicados no npm,
  mas a pasta `dashboard/` nunca esteve no `files[]`. Quem instalava o pacote recebia a documentação
  e o comando, sem o código. Ambos saíram do tarball.
- `README.md` descrevia o dashboard como "visão opcional read-only"; ele expõe rotas que executam
  processos (`POST /api/workflow/:project/run/:role`). Descrição corrigida.
- `scripts/spec-cli.mjs` — `abandoned` é status válido, mas o `check` o rejeitava como incoerente
  quando havia `plan.md`/`tasks.md`, derrubando o gate com exit 1. Agora é tratado como terminal,
  junto de `done`.

### Removido
- Scripts `dashboard`, `dashboard:dev`, `dashboard:install`, `dashboard:web:dev` e
  `dashboard:web:build` do `package.json` do root.
- `docs/dashboard.md` e `specs/agent-dashboard/` do `files[]` do pacote npm.

## [Unreleased] — Workspace separado

SPEC-028 (`specs/reestruturacao-forja-v2/`): separação do framework Forja do workspace de produção.

- `lib/workspace.mjs` — resolução centralizada do workspace (`FORJA_WORKSPACE` > `~/.forjarc.json` > `~/forja-workspace`).
- `bin/init-project.js` — projetos de produto obrigatoriamente em `~/forja-workspace/projects/<nome>`.
- `scripts/sync-universal-memory.js`, `query-universal-memory.js`, `build-smart-context.js`, `memory-schema.mjs` — memória universal (SQLite) movida para o workspace.
- `scripts/check-standards.js` — `npm run project:check <nome>` resolve projeto no workspace.
- `scripts/agent-harness.mjs` + `package.json` — comandos `workspace:init`, `project:new`, `project:list`, `workspace:project:check`.
- Documentação atualizada: `README.md`, `AGENTS.md`, `docs/init-project.md`, `docs/structure.md`.
- ADR-0019 (`memory/90-decisions/0019-workspace-separado.md`) documenta a decisão.
- `.gitignore` reforça que projetos de produto não entram no repo do framework.

## [Unreleased] — Dashboard local

SPEC-002 (`specs/agent-dashboard/`) implementada em 12 tasks (T1-T12).

- `dashboard/server/` — Fastify 5 com 7 rotas (specs, handoffs, projects, tokens, commands SSE, briefing, health)
- `dashboard/web/` — Vite + React + Tailwind + Recharts; 6 telas; bundle 166KB gzip (NFR < 500KB ✓)
- `dashboard/server/lib/` — allowlist hard-coded, run-command, spec-parser, briefing-parser, token-estimator
- Scripts: `npm run dashboard`, `dashboard:dev`, `dashboard:install`, `dashboard:web:build`
- **60 testes verde** (55 dashboard + 5 root)
- `docs/dashboard.md` cobre uso, allowlist, troubleshooting, segurança

## [v1.1] — 2026-05-10 — Refator SDD + Orquestração

### Frente 1 — Cleanup + ADRs
- 13 relatórios históricos movidos para `docs/archive/`
- 4 guias úteis migrados para `docs/{structure,init-project,examples,publishing}.md`
- 2 exemplos antigos arquivados em `docs/archive/examples/`
- Monolito bin (1486 LOC) preservado em `docs/archive/legacy-bin/`
- `DOC-MAP.md` reescrito (204 → 50 linhas)
- 6 ADRs criados a partir de decisões dispersas (`memory/90-decisions/0001-0006`)

### Frente 2 — Bins e exemplos consolidados
- `bin/create-memory-nest-kit-v2.js` promovido a oficial (substituiu monolito)
- `package.json`: bin secundário, novos scripts `spec:*`, `agent:route`, `memory:vacuum`
- `exemplo-v3` mantido como exemplo canônico

### Frente 3 — Pipeline SDD
- `specs/_templates/{spec,plan,tasks}.md`
- `scripts/spec-cli.mjs` com `new`/`plan`/`tasks`/`check` (4/4 testes verdes)
- ADR-0007 estabelece SDD como obrigatório para features não-triviais
- SPEC-001 (`specs/pipeline-sdd-e-orquestracao/`) é a meta-spec deste refator

### Frente 4 — Sub-agents executáveis
- 6 sub-agents em `.claude/agents/`: orchestrator, context-engineer, sdd-architect, product, marketing, governance
- 3 prompts portáveis novos em `prompts/`
- `scripts/agent-router.mjs` persiste handoffs em `universal.db.handoffs` (7 campos validados)
- ADR-0008 documenta migração handoff markdown → SQLite
- `AGENTS.md` reescrito

### Frente 5 — Hooks token-economy
- `.claude/settings.json` com hooks `SessionStart` e `UserPromptSubmit`
- `scripts/hook-session-start.mjs` injeta status de specs + handoffs abertos
- `scripts/hook-user-prompt.mjs` opt-in (`FRAMEWORK_HOOK_INJECT=1`), cache 30min, cap 4KB
- `scripts/pre-commit.sh` agora roda `spec:check` + `check-standards`
- ADR-0009 documenta trade-offs
- `.memoryrc.json` ganha seção `hooks`; `handoff` aponta para SQLite

---

## [v1.0] — 2026-05-02 — 4 Fases Estruturais

Detalhes completos em `docs/archive/PROJETO-COMPLETO.md`.

### Fase 1 — Arquitetura
- Monolito `bin/create-memory-nest-kit.js` (1486 LOC) refatorado em 5 módulos em `lib/`
- Orquestrador final: 125 LOC (redução de 91%)
- 1.820 LOC reutilizáveis em `lib/generators/`, `lib/validators/`, `lib/utils/`, `lib/context-builder.js`
- 7/7 testes passando; backward compatible

### Fase 2 — Documentação por Persona
- `docs/personas/{executive,architect,developer,qa}/` — guias estruturados
- `docs/quick-reference.md`, `docs/glossary.md`, `DOC-MAP.md`
- Onboarding reduzido em ~83% (medido em tempo de leitura)

### Fase 3 — Economia de Tokens
- `lib/context-builder.js` — API com 3 modos (`global`, `domain`, `task`), FTS5, cache LRU
- `scripts/compress-memory.mjs` — archive de runs > 30 dias, VACUUM
- `.memoryrc.json` — configuração centralizada
- `docs/token-optimization.md`, `scripts/token-benchmark.mjs`
- Redução estimada: 40-60% em tokens enviados ao modelo

### Fase 4 — Dev Workflow
- `scripts/dev.mjs` — CLI unificada (health/build-context/sprint/check)
- `scripts/pre-commit.sh` — validação automática
- `scripts/check-standards.js`, `scripts/generate-dashboard.js`
- 100% das operações cobertas por scripts npm

---

## [v0.x] — 2026-04 — Bootstrap

- Estrutura inicial `memory/` hierárquica (00-global a 90-decisions)
- `bin/create-memory-nest-kit.js` — scaffold inicial monolítico
- SQLite universal (`.memory/sqlite/universal.db`) com FTS5
- Scripts `sprint-manager.js`, `sync-universal-memory.js`, `query-universal-memory.js`
- AGENTS.md com topologia de 6 papéis
- `exemplo-projeto/`, `exemplo-v2/`, `exemplo-v3/` — outputs de referência
