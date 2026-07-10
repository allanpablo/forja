# Plan: reestruturacao-forja-v2

- **Spec**: ./spec.md
- **Status**: done
- **Criado em**: 2026-07-01

> Como vamos construir o que a spec define. Sem código aqui — só estrutura e decisões.

## 1. Abordagem técnica
Criar uma camada de workspace (`lib/workspace.mjs`) que centraliza a resolução de caminhos do Forja. O framework continua no repo atual, mas todos os artefatos de produto (projetos, memória universal, specs de produto, runbooks GSD) passam a viver em `~/forja-workspace`. Os scripts são atualizados para usar essa lib; novos comandos são adicionados ao harness; documentação e ADR refletem a separação. Estratégia: extend, com fallback para comportamento antigo apenas via path explícito.

## 2. Módulos afetados
| Caminho | Mudança | Risco |
|---|---|---|
| `lib/workspace.mjs` | criar | B |
| `bin/init-project.js` | editar (usa workspace) | M |
| `bin/create-memory-nest-kit.js` | editar (usa workspace) | M |
| `scripts/agent-harness.mjs` | editar (comandos workspace/project) | M |
| `scripts/sync-universal-memory.js` | editar (DB no workspace) | M |
| `scripts/query-universal-memory.js` | editar (DB no workspace) | M |
| `scripts/build-smart-context.js` | editar (context no workspace) | M |
| `scripts/check-standards.js` | editar (resolve path via workspace) | B |
| `scripts/spec-cli.mjs` | ajustar (specs de framework vs produto) | M |
| `package.json` | adicionar scripts | B |
| `README.md` | atualizar | B |
| `AGENTS.md` | atualizar | B |
| `docs/structure.md` | atualizar | B |
| `docs/init-project.md` | atualizar | B |
| `.gitignore` | reforçar ignores | B |
| `memory/90-decisions/0019-workspace-separado.md` | criar ADR | B |

## 3. Diagrama de fluxo
```
Usuário
  │
  ▼
forja workspace:init  ──► cria ~/forja-workspace
                              ├── projects/
                              ├── memory/
                              │   ├── sqlite/universal.db
                              │   └── 30-projects/
                              ├── specs/
                              ├── .context/
                              └── .forjarc.json
  │
  ▼
forja project:new <nome>  ──► cria ~/forja-workspace/projects/<nome>
                                  ├── backend/
                                  ├── memory/
                                  ├── specs/
                                  ├── .ia-instructions/
                                  └── .context/
  │
  ▼
forja project:check <nome>  ──► valida padrões no projeto do workspace
```

## 4. Contratos (API/CLI/Schema)
- `lib/workspace.mjs`:
  - `getWorkspaceRoot(): string` — resolve o workspace ativo.
  - `getProjectsDir(): string` — `~/forja-workspace/projects`.
  - `getWorkspaceMemoryDir(): string` — `~/forja-workspace/memory`.
  - `getWorkspaceDbPath(): string` — `~/forja-workspace/memory/sqlite/universal.db`.
  - `resolveProject(name): string` — `~/forja-workspace/projects/<name>`.
  - `initWorkspace(): void` — cria estrutura base se ausente.
- CLI:
  - `npm run dev -- workspace:init`
  - `npm run dev -- project:new <nome> [--ai ...]`
  - `npm run dev -- project:list`
  - `npm run dev -- project:check <nome>`
- `.forjarc.json` no home (opcional): `{ "workspaceRoot": "/caminho/custom" }`.
- Env `FORJA_WORKSPACE` tem prioridade sobre `.forjarc.json` e default.

## 5. Decisões e alternativas
**D1**: Workspace fora do repo (`~/forja-workspace`) — alternativas rejeitadas: manter `projects/` no repo (polui worktree e git), usar submódulos (complexidade desnecessária).
**D2**: Resolução de workspace via lib central (`lib/workspace.mjs`) — alternativa rejeitada: hardcoded paths espalhados (manutenção difícil).
**D3**: Universal DB continua SQLite, mas no workspace — alternativa rejeitada: banco remoto (adiciona infra para um framework local-first).
**D4**: Comandos novos expostos via `scripts/agent-harness.mjs` usando o mesmo dispatcher `dev` — alternativa rejeitada: criar binário novo agora (custo de publicação npm; pode vir depois).

ADR estrutural: `memory/90-decisions/0019-workspace-separado.md`.

## 6. Dependências
- Outras specs: nenhuma.
- Pacotes npm: nenhum novo.
- Migrações: não migramos dados antigos automaticamente; avisamos o usuário.

## 7. Rollout
- [ ] Feature flag: não; mudança de comportamento default.
- [ ] Migração: mensagem orientando backup manual de `projects/` existente.
- [ ] Doc/persona: README, AGENTS.md, docs/structure.md, docs/init-project.md, docs/manual-operacional-cli-sdd-gsd.md.

## 8. Sinais de fracasso (kill criteria)
- `project:check` quebra no framework após mudanças.
- Não é possível criar projeto no workspace sem erros de permissão/path.
- Mais de 3 scripts precisam de path hardcoded por falha da lib workspace.
