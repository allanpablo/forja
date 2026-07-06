# CLAUDE.md

Guia para Claude Code (claude.ai/code) trabalhando neste repositório.

## O que é este repositório

Framework macro de orquestração multiagente + CLI scaffold para gerar projetos NestJS com memória hierárquica. O repo **não contém aplicações em produção** — contém o gerador, scripts de orquestração e a memória/decisões do framework. Aplicações reais vivem no workspace externo (`~/forja-workspace`, ADR-0019); a pasta `projects/` do repo é legado off-limits.

## Pontos de entrada

| Bin | Quando usar |
|---|---|
| `bin/init-project.js` (npm: `init:project`) | CLI principal pública. Gera projeto completo com configs multi-IA (Claude/Copilot/Gemini/Codex) |
| `bin/create-memory-nest-kit.js` | Orquestrador modular que delega para `lib/generators/`. Usado internamente por `init-project.js` |

Monolito antigo (1486 LOC) preservado em `docs/archive/legacy-bin/` para referência histórica.

## Estrutura

```
bin/                    # CLIs (init-project, create-memory-nest-kit)
lib/                    # Módulos reutilizáveis (generators, validators, utils, context-builder)
scripts/                # Automação (sprint-manager, sync-universal-memory, dev.mjs, …)
specs/                  # Pipeline SDD (spec → plan → tasks) — em construção
docs/                   # Documentação por persona + guias temáticos
  docs/personas/        # executive | architect | developer | qa
  docs/archive/         # Relatórios históricos, exemplos antigos
memory/                 # Memória do framework (00-global a 90-decisions)
  memory/90-decisions/  # ADRs versionados
prompts/                # Prompts dos 6 papéis em AGENTS.md
.claude/agents/         # Sub-agents executáveis — em construção
projects/               # OFF-LIMITS: produtos em desenvolvimento ativo
boilerplates/           # Templates de stack (api-rest, saas, ecommerce, …)
exemplo-v3/             # Exemplo canônico do output gerado
```

## Comandos essenciais

Todo comando de processo passa pelo **core** `bin/forja.mjs` (ADR-0020): registry em
`lib/core/registry.mjs`, gates transversais e auditoria em `.context/forja-runs.jsonl`
do workspace. Os scripts npm são aliases finos do core. Comando novo = entrada nova no
registry (o teste `test/forja-core.test.js` valida a integridade).

```bash
# Core
node bin/forja.mjs               # help agrupado por domínio
node bin/forja.mjs <comando>     # qualquer comando do registry

# Gerar novo projeto (no workspace, com ficha automática)
npm run project:new meu-projeto -- --ai copilot,claude

# Sprint
npm run sprint:start
npm run sprint:status

# Memória + contexto
npm run sync:universal           # reindexa SQLite
npm run query:universal "query"  # busca FTS5
npm run context:smart            # build smart-context
npm run memory:compress          # archive runs > 30d, VACUUM

# Qualidade
npm run project:check            # standards check (pre-commit)
npm run project:dashboard

# Code intelligence + ferramentas de processo (ADR-0017, ADR-0018)
npm run code:check               # índice codegraph confiável (worktree + freshness)
npm run code:impact -- <símbolo> # chamadores + blast radius antes de editar
npm run tools:doctor             # raio-x: codegraph, gitleaks, ast-grep, lefthook, markdownlint
```

## Convenções

- **Economia de tokens (ADR-0009)**: nunca ler árvores inteiras de `memory/`. Ordem: `query:universal` (FTS5) → `context:smart` (modo `task`/`domain`) → `70-summaries/` → arquivo bruto só em último caso. Mais de ~2 arquivos de memória no contexto = use `context:smart`.
- **ADRs**: toda decisão arquitetural vai para `memory/90-decisions/NNNN-titulo.md` (template em `_template.md`)
- **Specs**: features não-triviais começam por `specs/<feature>/spec.md` antes de código (ver Frente SDD)
- **Handoffs**: 7 campos obrigatórios (ADR-0005)
- **Memória**: 3 modos de smart-context (ADR-0003): `global`, `domain`, `task`
- **Pasta `projects/`**: não editar — produtos em desenvolvimento ativo do usuário

## Onde olhar primeiro

- `DOC-MAP.md` — mapa por papel
- `AGENTS.md` — 6 papéis e topologia
- `CHANGELOG.md` — histórico das 4 fases anteriores
- `memory/90-decisions/` — decisões com rationale
