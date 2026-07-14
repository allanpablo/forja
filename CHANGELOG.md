# Changelog

Histórico consolidado das mudanças estruturais do framework. Para decisões arquiteturais com rationale, ver `memory/90-decisions/`.

---

## [1.1.5] — 2026-07-14 — O comando é forja

A documentação pública ainda falava a língua interna do repo: `npm run x -- args` onde o usuário
do pacote tem `forja x args`. Esta versão alinha o que o README promete com o que o binário faz.

### Corrigido

- **README inteiro migrado para `forja` como forma canônica** — os scripts npm continuam
  existindo como aliases do repo clonado, mas deixam de ser a vitrine.
- **Exemplos do "60 segundos" estavam quebrados**: `forja gsd:handoff -- plan …` passa o `--`
  cru para o script (o core não filtra separador) e o comando falha. O `--` só era necessário
  na forma `npm run`; removido dos exemplos diretos.
- **Comando errado na lista de essenciais**: validar projeto do workspace é
  `workspace:project:check <nome>`, não `project:check <nome>` (que é o standards check do framework).
- **Links mortos**: `projects/ai-engineering-from-scratch-main/` não existe no repo;
  `docs/capacidades-externas.md` agora aponta para as fontes upstream (ADR-0016) e a
  reinstalação segue a prescrição do `tools:doctor` (`npm i -g @codegraph/cli`) em vez do
  symlink manual antigo.
- **`package-lock.json` preso em 1.1.3** desde o bump da 1.1.4; sincronizado.

### Adicionado

- Seção "Comandos essenciais" do README ampliada com o que já existia no registry mas não
  aparecia: `gsd:plan`/`gsd:check`, `code:check`/`code:impact`, `memory:compress`,
  `tools:doctor`, `release:check --publish`.
- `allowScripts` no `package.json`: instalações com política allow-scripts ativa deixam de
  bloquear silenciosamente o prebuild do `better-sqlite3` — exatamente o modo de falha que
  matava a memória (ADR-0023).

---

## [1.1.4] — 2026-07-14 — Os gates

Duas fronteiras do framework funcionavam por disciplina, e a disciplina falhou nas duas. Esta versão
as fecha com gates executáveis — e, pela primeira vez, com **prova**: os bugs históricos foram
reintroduzidos um a um, e o gate reprovou cada um deles.

> "Uma regra que depende de memória não é uma regra; é uma sugestão." — ADR-0021

### O que muda para quem usa

- **`npm publish` está bloqueado** se a instalação limpa não funcionar (`prepublishOnly` → ADR-0024).
- **`tools:doctor` reprova** (exit 1) quando o núcleo está quebrado — antes ele auditava só
  ferramentas opcionais e saía com 0 mesmo com a memória morta (ADR-0023).
- Quando algo quebra, a saída traz **o comando que corrige**, não um stack trace.

### Adicionado

- **`lib/core/health.mjs`** — saúde do núcleo como dados: ABI do `better-sqlite3`, memória, índice,
  workspace, `engines`, deps de runtime, `.mcp.json`. Fonte única do `tools:doctor` e do hook
  `SessionStart` (ADR-0023).
- **`lib/core/release.mjs` + `release:check`** — o gate do tarball. Empacota, instala num diretório
  isolado e **executa** os comandos. Grep não prova ausência; instalação prova (ADR-0024).
- **`lib/core/checks.mjs`** — runner compartilhado. Uma máquina, dois catálogos: um guarda o repo,
  outro guarda o pacote publicado.
- **CI**: `tools:doctor` na matriz de Nodes e `release:check` em job próprio. A evidência do release
  passa a viver no log do CI, não na memória de quem publica.
- `spec:new` mantém a allow-list do `.gitignore` — toda spec nova do framework nascia invisível ao git.

### Corrigido

- **A memória morria em silêncio.** Com o `better-sqlite3` compilado contra outra major do Node,
  `query:universal`, `sync:universal`, `context:smart`, `agent:route` e `memory:compress` ficavam
  todos inoperantes — e o `SessionStart` prescrevia `npm install`, que **não** recompila binário
  nativo. A correção é `npm rebuild better-sqlite3`, e agora é isso que o framework diz.
- **`docs/token-optimization.md` mandava rodar quatro comandos inexistentes** (`context:build`,
  `memory:db:reindex`, `memory:db:stats`, `cache:clear`) e linkava um `DEPLOYMENT.md` que nunca
  existiu. É o documento que ensina a economia de tokens (ADR-0009) — um agente obediente executava
  fantasmas.
- **O Governance não conhecia os gates**: descrevia o `tools:doctor` pela definição anterior ao
  ADR-0023 e ignorava o `release:check`.
- `runtime-deps` passava por sorte: os geradores emitem `import … from '@nestjs/common'` dentro de
  template literal, e o parser contava como dependência do framework.

### Evidência

| Bug histórico | Reintroduzido → |
|---|---|
| `better-sqlite3` como `devDependency` (ADR-0021) | reprovado por **dois** checks independentes |
| `dashboard/` fora do `files[]` (v1.1.3) | reprovado: 4 comandos mortos, 19 imports sem destino |
| `otplib`/`qrcode` publicados sem existir no git (v1.1.1) | reprovado sob `--publish`; `npm publish` aborta |

**88 testes** (eram 28). ADR-0023 e ADR-0024. SPEC-009 e SPEC-010.

## [1.1.3] — 2026-07-09 — Dashboard congelado

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
