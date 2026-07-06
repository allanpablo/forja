# Tasks: agent-dashboard

- **Spec**: ./spec.md
- **Plan**: ./plan.md
- **Criado em**: 2026-05-11

Decomposição em 12 tasks. Estimativas: P=≤2h, M=2-6h, G=6h+. Ordem reflete execução padrão; T2-T9 podem rodar em paralelo após T1.

---

## T1 — Bootstrap do projeto `dashboard/`
- **Owner**: Worker
- **Estimativa**: P
- **Depende de**: —
- **Paths**: `dashboard/package.json`, `dashboard/server/index.mjs`, `dashboard/.gitignore`, `package.json` (root)
- **Done quando**:
  - [ ] `dashboard/package.json` com fastify, @fastify/static, @fastify/cors, better-sqlite3
  - [ ] `dashboard/server/index.mjs` sobe Fastify em 127.0.0.1:7777 com `GET /api/health` → `{ok:true}`
  - [ ] Root `package.json` ganha script `"dashboard": "cd dashboard && npm start"`
  - [ ] `.gitignore` ignora `dashboard/node_modules`, `dashboard/web/dist`
  - [ ] `npm run dashboard` sobe sem erro

## T2 — Allowlist + util de spawn seguro
- **Owner**: Worker
- **Estimativa**: P
- **Depende de**: T1
- **Paths**: `dashboard/server/lib/allowlist.mjs`, `dashboard/server/lib/run-command.mjs`
- **Done quando**:
  - [ ] `allowlist.mjs` exporta `COMMAND_ALLOWLIST` exato como no plan §4
  - [ ] `run-command.mjs` valida nome, faz `spawn` sem `shell: true`
  - [ ] Teste: comando fora da allowlist → throw `CommandNotAllowed`
  - [ ] Teste: comando válido devolve stream readable de stdout

## T3 — Rota Specs (read-only)
- **Owner**: Worker
- **Estimativa**: P
- **Depende de**: T1
- **Paths**: `dashboard/server/routes/specs.mjs`
- **Done quando**:
  - [ ] `GET /api/specs` lê `specs/*/spec.md`, retorna array conforme contrato §4
  - [ ] `GET /api/specs/:slug` devolve conteúdo cru de spec/plan/tasks
  - [ ] Teste de integração com fixture: 2 specs fake → 2 itens

## T4 — Rota Handoffs com transição
- **Owner**: Worker
- **Estimativa**: M
- **Depende de**: T1
- **Paths**: `dashboard/server/routes/handoffs.mjs`
- **Done quando**:
  - [ ] `GET /api/handoffs?status=&to=` consulta `universal.db.handoffs`
  - [ ] `POST /api/handoffs/:id/transition` valida `to ∈ {in_progress,done,cancelled}` e shell-out para `agent-router.mjs`
  - [ ] Teste: transição inválida → 400; válida → 200 + status atualizado

## T5 — Rota Projects
- **Owner**: Worker
- **Estimativa**: P
- **Depende de**: T1
- **Paths**: `dashboard/server/routes/projects.mjs`
- **Done quando**:
  - [ ] `GET /api/projects` lê `projects/*`, cruza com SQLite por slug
  - [ ] `last_commit` via `git -C` (null se não-git)
  - [ ] `memory_bytes` = `du -sb` de `projects/<name>/memory/`

## T6 — Rota Tokens (estimador)
- **Owner**: Worker
- **Estimativa**: M
- **Depende de**: T1
- **Paths**: `dashboard/server/routes/tokens.mjs`, `dashboard/server/lib/token-estimator.mjs`
- **Done quando**:
  - [ ] `token-estimator.mjs` calcula chars/4 sobre `.context/*` e `memory/60-runs/*.json` agregado por dia
  - [ ] `GET /api/tokens?project=&days=30` devolve série temporal
  - [ ] Resposta < 500ms p95 com 10 projetos (kill criterion §8)
  - [ ] Cada datapoint rotulado como "estimativa"

## T7 — Rota Commands com SSE
- **Owner**: Worker
- **Estimativa**: M
- **Depende de**: T2
- **Paths**: `dashboard/server/routes/commands.mjs`
- **Done quando**:
  - [ ] `POST /api/commands/:name` valida allowlist, abre SSE
  - [ ] Eventos `stdout`, `stderr`, `exit` (com código)
  - [ ] Fora da allowlist → 403 `{error:"command not allowlisted"}`
  - [ ] E2E: dispara `spec:check` e recebe ≥1 evento `stdout` + `exit:0`

## T8 — Rota Briefing → spec
- **Owner**: Worker
- **Estimativa**: M
- **Depende de**: T2
- **Paths**: `dashboard/server/routes/briefing.mjs`, `dashboard/server/lib/briefing-parser.mjs`
- **Done quando**:
  - [ ] Parser: split parágrafos, detecta keywords (`problema`, `queremos`, `para que <persona>`, `como <persona>`), preenche seções 1-3
  - [ ] `POST /api/briefing` valida `slug` kebab-case, cria via `spec-cli.mjs new`, sobrescreve seções 1-3
  - [ ] Status fica em `draft` (nunca `approved` automático)
  - [ ] Teste com 3 briefings de exemplo: cada um produz spec parseável

## T9 — Frontend bootstrap (Vite + Tailwind + shadcn)
- **Owner**: Worker
- **Estimativa**: M
- **Depende de**: T1
- **Paths**: `dashboard/web/`
- **Done quando**:
  - [ ] `dashboard/web/` com Vite + React + Tailwind
  - [ ] shadcn instalado, 3-4 componentes copiados (button, card, badge, dialog)
  - [ ] Layout base: sidebar com 6 links (Briefing, Specs, Handoffs, Tokens, Comandos, Projetos)
  - [ ] `vite build` < 500KB gzipped (NFR)
  - [ ] `npm run dashboard` serve `dist/` via @fastify/static

## T10 — Telas Specs + Handoffs + Projetos
- **Owner**: Worker
- **Estimativa**: G
- **Depende de**: T3, T4, T5, T9
- **Paths**: `dashboard/web/src/pages/{Specs,Handoffs,Projects}.tsx`
- **Done quando**:
  - [ ] Specs: tabela com status colorido + drawer com spec/plan/tasks markdown renderizado
  - [ ] Handoffs: 3 colunas kanban com botão de transição
  - [ ] Projetos: cards com badges (specs, handoffs, último commit, memória)
  - [ ] Polling 30s em cada tela

## T11 — Telas Tokens + Comandos + Briefing
- **Owner**: Worker
- **Estimativa**: G
- **Depende de**: T6, T7, T8, T9
- **Paths**: `dashboard/web/src/pages/{Tokens,Commands,Briefing}.tsx`
- **Done quando**:
  - [ ] Tokens: gráfico de linha (Recharts) 30d com toggle de projeto
  - [ ] Comandos: 5 botões, painel lateral com stdout/stderr ao vivo via EventSource
  - [ ] Briefing: textarea ≥10 linhas + select de projeto + botão "Gerar spec" → redireciona para `/specs/<slug>`

## T12 — Documentação + handoff de governance
- **Owner**: Worker → Governance
- **Estimativa**: P
- **Depende de**: T10, T11
- **Paths**: `docs/dashboard.md`, `DOC-MAP.md`, `CHANGELOG.md`
- **Done quando**:
  - [ ] `docs/dashboard.md` cobre: como subir, porta, allowlist, troubleshooting
  - [ ] `DOC-MAP.md` ganha entrada para o dashboard
  - [ ] `CHANGELOG.md` ganha entrada `[Unreleased]`
  - [ ] Handoff `worker → governance` aberto via `agent-router append`
  - [ ] `npm test` e `npm run spec:check` ambos verdes

---

## Caminho crítico

```
T1 ─┬─ T2 ─┬─ T7 ─┐
    ├─ T3 ─┤      │
    ├─ T4 ─┤      ├─ T10 ─┐
    ├─ T5 ─┤      │       ├─ T12
    ├─ T6 ─┤      ├─ T11 ─┘
    ├─ T9 ─┘      │
    └─ T2 → T8 ───┘
```

T1 destrava todas. T10 espera rotas read-only + frontend base. T11 espera rotas mutáveis + frontend base. T12 fecha com Governance.

## Handoffs sugeridos

Quando T1 concluir:
```bash
node scripts/agent-router.mjs append '{"from":"sdd-architect","to":"worker","intent":"implement","context":"specs/agent-dashboard/plan.md §2-§5; tasks.md T2-T9 destravadas","acceptance":"rotas /api/* respondem com schema do plan §4; testes verdes","constraints":"allowlist hard-coded; bind 127.0.0.1; sem shell:true","return":"PR + handoff para governance","spec_slug":"agent-dashboard"}'
```

Antes do merge (após T11):
```bash
node scripts/agent-router.mjs append '{"from":"worker","to":"governance","intent":"review","context":"PR agent-dashboard; rotas + 5 telas + allowlist","acceptance":"project:check verde, spec:check verde, auditoria de RCE na rota /api/commands","constraints":"bloquear merge se allowlist contornável","return":"veredicto APROVADO ou findings","spec_slug":"agent-dashboard"}'
```
