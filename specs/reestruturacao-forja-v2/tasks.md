# Tasks: reestruturacao-forja-v2

- **Spec**: ./spec.md
- **Plan**: ./plan.md
- **Status**: approved
- **Criado em**: 2026-07-01

> Decomposição executável. Cada task tem dono claro, critério de done e referência a arquivos.

Convenção de IDs: `T1`, `T2`, ... Sequência reflete ordem de execução padrão (pode ser paralelizada quando indicado).

---

## T1 — Criar lib/workspace.mjs
- **Owner**: worker
- **Estimativa**: P
- **Depende de**: —
- **Paths**: `lib/workspace.mjs`
- **Done quando**:
  - [ ] Resolve workspace via `FORJA_WORKSPACE` > `~/.forjarc.json` > default `~/forja-workspace`.
  - [ ] Exporta helpers: `getWorkspaceRoot`, `getProjectsDir`, `getWorkspaceMemoryDir`, `getWorkspaceDbPath`, `resolveProject`, `initWorkspace`, `getActiveWorkspaceInfo()`.
  - [ ] `initWorkspace()` cria `projects/`, `memory/`, `memory/sqlite/`, `memory/30-projects/`, `specs/`, `.context/`, `.forjarc.json`.
  - [ ] Teste básico: `node -e "import('./lib/workspace.mjs').then(w=>console.log(w.getWorkspaceRoot()))"`.

## T2 — Atualizar init-project.js para workspace fixo
- **Owner**: worker
- **Estimativa**: M
- **Depende de**: T1
- **Paths**: `bin/init-project.js`
- **Done quando**:
  - [ ] Sempre resolve projeto para `~/forja-workspace/projects/<nome>` (rejeita path relativo/externo).
  - [ ] Remove ambiguidade de `projects/` dentro do repo do framework.
  - [ ] Registra projeto em `~/forja-workspace/memory/30-projects/<nome>.md`.
  - [ ] Copia instruções, emite harness e cria backend como hoje.

## T3 — Atualizar scripts de memória universal para workspace
- **Owner**: worker
- **Estimativa**: M
- **Depende de**: T1
- **Paths**: `scripts/sync-universal-memory.js`, `scripts/query-universal-memory.js`, `scripts/build-smart-context.js`
- **Done quando**:
  - [ ] Todos leem/escrevem SQLite em `~/forja-workspace/memory/sqlite/universal.db`.
  - [ ] `build-smart-context` gera `.context/smart-context.md` dentro do projeto no workspace.
  - [ ] `sync-universal-memory` indexa `~/forja-workspace/memory/30-projects/` e `~/forja-workspace/projects/<nome>/memory/`.

## T4 — Atualizar check-standards.js
- **Owner**: worker
- **Estimativa**: P
- **Depende de**: T2
- **Paths**: `scripts/check-standards.js`
- **Done quando**:
  - [ ] Aceita `npm run project:check` no framework (comportamento atual).
  - [ ] Aceita `npm run project:check -- <nome>` resolvendo `~/forja-workspace/projects/<nome>`.
  - [ ] Mensagem clara quando projeto não existe no workspace.

## T5 — Adicionar comandos workspace:* e project:* ao harness
- **Owner**: worker
- **Estimativa**: M
- **Depende de**: T1, T2
- **Paths**: `scripts/agent-harness.mjs`, `package.json`
- **Done quando**:
  - [ ] `workspace:init` cria estrutura do workspace.
  - [ ] `project:new <nome>` encapsula init-project.js.
  - [ ] `project:list` lista projetos em `~/forja-workspace/projects/`.
  - [ ] `project:check <nome>` valida padrões no projeto do workspace.
  - [ ] Scripts mapeados em `package.json`.

## T6 — Ajustar .gitignore e garantir separação
- **Owner**: worker
- **Estimativa**: P
- **Depende de**: T2
- **Paths**: `.gitignore`
- **Done quando**:
  - [ ] `projects/` e `projects/**` permanecem ignorados.
  - [ ] Adiciona comentário explicando que projetos de produto vivem no workspace externo.
  - [ ] Garante que `~/forja-workspace` nunca seja trackeado.

## T7 — Atualizar documentação
- **Owner**: worker
- **Estimativa**: M
- **Depende de**: T5
- **Paths**: `README.md`, `AGENTS.md`, `docs/structure.md`, `docs/init-project.md`, `docs/manual-operacional-cli-sdd-gsd.md`
- **Done quando**:
  - [ ] README explica separação framework/workspace e comando `workspace:init`.
  - [ ] AGENTS.md menciona workspace como canto fixo de produtos.
  - [ ] docs/init-project.md atualizado com `project:new`.
  - [ ] docs/structure.md reflete nova topologia.

## T8 — Criar ADR-0019
- **Owner**: sdd-architect
- **Estimativa**: P
- **Depende de**: T1
- **Paths**: `memory/90-decisions/0019-workspace-separado.md`
- **Done quando**:
  - [ ] Documenta contexto, decisão, consequências e alternativas rejeitadas.
  - [ ] Referenciado no plan.md.

## T9 — Teste de fumaça
- **Owner**: governance
- **Estimativa**: P
- **Depende de**: T2, T3, T4, T5
- **Paths**: `~/forja-workspace/projects/forja-smoke-test`
- **Done quando**:
  - [ ] `npm run dev -- workspace:init` executa sem erro.
  - [ ] `npm run dev -- project:new forja-smoke-test --ai claude` cria projeto no workspace.
  - [ ] `npm run project:check -- forja-smoke-test` passa ≥ 70%.
  - [ ] `npm run project:check` no framework continua 100%.
  - [ ] `npm run spec:check` passa.

---

## Handoffs entre agentes
Se este conjunto de tasks atravessa papéis (Product → SDD Architect → Worker → Governance), registre handoff via `scripts/append-handoff.mjs` ou tabela `handoffs` do `universal.db` (ADR-0005).
