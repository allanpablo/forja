# Tasks: agent-dashboard

- **Spec**: ./spec.md
- **Plan**: ./plan.md
- **Status**: abandoned
- **Criado em**: 2026-05-11
- **Reconciliado em**: 2026-07-09 (auditoria do código em `dashboard/` contra os critérios abaixo)

Decomposição em 12 tasks. Estimativas: P=≤2h, M=2-6h, G=6h+. Ordem reflete execução padrão; T2-T9 podem rodar em paralelo após T1.

> **⚠️ Feature congelada em 2026-07-09 — ver [ADR-0022](../../memory/90-decisions/0022-congelar-dashboard-web.md).**
> O código continua em `dashboard/`, versionado e com os 68 testes passando, mas deixou de ser
> superfície pública: saiu do `files[]` do npm, os scripts `dashboard*` saíram do `package.json`
> do root, e `README`/`DOC-MAP` não o prometem mais. O handoff de governance (T12) **não** será
> aberto. Condições de retomada estão no ADR.
>
> **Nota de reconciliação**: T1-T11 estão concluídas e verificadas (68/68 testes verdes, `npm test` em `dashboard/`).
> A implementação divergiu do plan em alguns pontos — ver "Divergências" no fim do arquivo.
> T12 tem 4 de 5 critérios atendidos: o handoff `worker → governance` ficou em aberto e foi cancelado pelo congelamento.

---

## T1 — Bootstrap do projeto `dashboard/`
- **Owner**: Worker
- **Estimativa**: P
- **Depende de**: —
- **Paths**: `dashboard/package.json`, `dashboard/server/index.mjs`, `dashboard/.gitignore`, `package.json` (root)
- **Done quando**:
  - [x] `dashboard/package.json` com fastify, @fastify/static, @fastify/cors, better-sqlite3
  - [x] `dashboard/server/index.mjs` sobe Fastify em 127.0.0.1:7777 com `GET /api/health` → `{ok:true}`
  - [x] ~~Root `package.json` ganha script `"dashboard"`~~ → **revertido** pelo congelamento (ADR-0022); suba via `cd dashboard && npm start`
  - [x] `.gitignore` ignora `dashboard/node_modules`, `dashboard/web/dist`
  - [x] Servidor sobe sem erro

## T2 — Allowlist + util de spawn seguro
- **Owner**: Worker
- **Estimativa**: P
- **Depende de**: T1
- **Paths**: `dashboard/server/lib/allowlist.mjs`, `dashboard/server/lib/run-command.mjs`
- **Done quando**:
  - [x] `allowlist.mjs` exporta `COMMAND_ALLOWLIST` exato como no plan §4
  - [x] `run-command.mjs` valida nome, faz `spawn` sem `shell: true`
  - [x] Teste: comando fora da allowlist → throw `CommandNotAllowed`
  - [x] Teste: comando válido devolve stream readable de stdout

## T3 — Rota Specs (read-only)
- **Owner**: Worker
- **Estimativa**: P
- **Depende de**: T1
- **Paths**: `dashboard/server/routes/specs.mjs`
- **Done quando**:
  - [x] `GET /api/specs` lê `specs/*/spec.md`, retorna array conforme contrato §4
  - [x] `GET /api/specs/:slug` devolve conteúdo cru de spec/plan/tasks
  - [x] Teste de integração com fixture: 2 specs fake → 2 itens

## T4 — Rota Handoffs com transição
- **Owner**: Worker
- **Estimativa**: M
- **Depende de**: T1
- **Paths**: `dashboard/server/routes/handoffs.mjs`
- **Done quando**:
  - [x] `GET /api/handoffs?status=&to=` consulta `universal.db.handoffs`
  - [x] `POST /api/handoffs/:id/transition` valida `to ∈ {in_progress,done,cancelled}` e shell-out para `agent-router.mjs`
  - [x] Teste: transição inválida → 400; válida → 200 + status atualizado

## T5 — Rota Projects
- **Owner**: Worker
- **Estimativa**: P
- **Depende de**: T1
- **Paths**: `dashboard/server/routes/projects.mjs`
- **Done quando**:
  - [x] `GET /api/projects` lê `projects/*`, cruza com SQLite por slug
  - [x] `last_commit` via `git -C` (null se não-git)
  - [x] `memory_bytes` = `du -sb` de `projects/<name>/memory/`

## T6 — Rota Tokens (estimador)
- **Owner**: Worker
- **Estimativa**: M
- **Depende de**: T1
- **Paths**: `dashboard/server/routes/tokens.mjs`, `dashboard/server/lib/token-estimator.mjs`
- **Done quando**:
  - [x] `token-estimator.mjs` calcula chars/4 sobre `.context/*` e `memory/60-runs/*.json` agregado por dia
  - [x] `GET /api/tokens?project=&days=30` devolve série temporal
  - [x] Resposta < 500ms p95 com 10 projetos (kill criterion §8) — coberto pelo teste "NFR: GET /api/tokens < 500ms"
  - [x] Cada datapoint rotulado como "estimativa" — payload traz `method: 'estimate'`; UI exibe o disclaimer de chars/4

## T7 — Rota Commands com SSE
- **Owner**: Worker
- **Estimativa**: M
- **Depende de**: T2
- **Paths**: `dashboard/server/routes/commands.mjs`
- **Done quando**:
  - [x] `POST /api/commands/:name` valida allowlist, abre SSE
  - [x] Eventos `stdout`, `stderr`, `exit` (com código)
  - [x] Fora da allowlist → 403 `{error:"command not allowlisted"}`
  - [x] E2E: dispara `spec:check` e recebe ≥1 evento `stdout` + `exit:0`

## T8 — Rota Briefing → spec
- **Owner**: Worker
- **Estimativa**: M
- **Depende de**: T2
- **Paths**: `dashboard/server/routes/briefing.mjs`, `dashboard/server/lib/briefing-parser.mjs`
- **Done quando**:
  - [x] Parser: split parágrafos, detecta keywords (`problema`, `queremos`, `para que <persona>`, `como <persona>`), preenche seções 1-3
  - [x] `POST /api/briefing` valida `slug` kebab-case, cria via `spec-cli.mjs new`, sobrescreve seções 1-3
  - [x] Status fica em `draft` (nunca `approved` automático)
  - [x] Teste com 3 briefings de exemplo: cada um produz spec parseável

## T9 — Frontend bootstrap (Vite + Tailwind + shadcn)
- **Owner**: Worker
- **Estimativa**: M
- **Depende de**: T1
- **Paths**: `dashboard/web/`
- **Done quando**:
  - [x] `dashboard/web/` com Vite + React + Tailwind
  - [x] ~~shadcn instalado, 3-4 componentes copiados (button, card, badge, dialog)~~ → **divergiu**: componentes próprios em `web/src/components/` (`Badge`, `Drawer`, `Layout`, `ActivityLog`), sem dependência de shadcn
  - [x] Layout base: sidebar com links de navegação — **12 links**, não 6 (escopo cresceu; ver Divergências)
  - [x] `vite build` < 500KB gzipped (NFR) — medido em 2026-07-09: **190KB gzip** (185.92 JS + 4.55 CSS)
  - [x] `npm run dashboard` serve `dist/` via @fastify/static

## T10 — Telas Specs + Handoffs + Projetos
- **Owner**: Worker
- **Estimativa**: G
- **Depende de**: T3, T4, T5, T9
- **Paths**: `dashboard/web/src/pages/{Specs,Handoffs,Projects}.jsx` (JSX, não TSX)
- **Done quando**:
  - [x] Specs: tabela com status colorido + drawer com spec/plan/tasks markdown renderizado
  - [x] Handoffs: 3 colunas kanban com botão de transição
  - [x] Projetos: cards com badges (specs, handoffs, último commit, memória)
  - [x] Polling 30s em cada tela — via `usePolling(fetcher, 30000)`

## T11 — Telas Tokens + Comandos + Briefing
- **Owner**: Worker
- **Estimativa**: G
- **Depende de**: T6, T7, T8, T9
- **Paths**: `dashboard/web/src/pages/{Tokens,Commands,Briefing}.jsx` (JSX, não TSX)
- **Done quando**:
  - [x] Tokens: gráfico de linha (Recharts) 30d com toggle de projeto
  - [x] Comandos: 5 botões, painel lateral com stdout/stderr ao vivo — via `streamCommand()` (fetch + ReadableStream), não `EventSource`; ver Divergências
  - [x] Briefing: textarea ≥10 linhas + select de projeto + botão "Gerar spec" → redireciona para `/specs/<slug>`

## T12 — Documentação + handoff de governance
- **Owner**: Worker → Governance
- **Estimativa**: P
- **Depende de**: T10, T11
- **Paths**: `docs/dashboard.md`, `DOC-MAP.md`, `CHANGELOG.md`
- **Done quando**:
  - [x] `docs/dashboard.md` cobre: como subir, porta, allowlist, troubleshooting
  - [x] `DOC-MAP.md` ganha entrada para o dashboard (linhas 30 e 59)
  - [x] `CHANGELOG.md` ganha entrada `[Unreleased] — Dashboard local`
  - [ ] ~~Handoff `worker → governance` aberto via `agent-router append`~~ → **cancelado pelo congelamento** (ADR-0022): sem merge a aprovar, não há o que a governança porteire
  - [x] `npm test` e `npm run spec:check` ambos verdes (68/68 testes; spec:check sem erros)

---

## Divergências entre plan e implementação

Registradas na reconciliação de 2026-07-09. Nenhuma é regressão — todas ampliam ou simplificam o escopo original.

1. **Sem shadcn/ui** (T9). O plan previa copiar componentes shadcn. A implementação usa componentes próprios sobre Tailwind puro. Menos dependências, mesmo resultado visual.
2. **JSX, não TSX** (T9-T11). O plan escrevia os paths como `.tsx`; o projeto é JavaScript puro, sem TypeScript.
3. **`streamCommand` em vez de `EventSource`** (T11). O endpoint de comandos é `POST`, e a API `EventSource` do browser só faz `GET`. O front consome o mesmo stream SSE via `fetch` + `ReadableStream`. `EventSource` é usado onde cabe: `useEvents.js` → `GET /api/events`.
4. **Allowlist maior que o plan §4** (T2). Além dos 5 comandos previstos, entraram `context:build`, `gsd:plan`, `gsd:handoff`, `gsd:check`, `design:select`, `design:check` — os parametrizados validam cada argumento por schema fechado (`ARG_SCHEMAS`).
5. **Rotas além do escopo** (T3-T8). O plan previa 7 rotas. Existem 15: as 7 originais mais `events`, `agents`, `docs`, `memory`, `functions`, `llm-routing`, `workflow`, `stacks`, `system`. Correspondem aos 6 links extras da sidebar.
6. **Rotas read-only ganharam mutações**. `specs` expõe `POST /:slug/status` e `POST /:slug/generate/:stage`; `projects` expõe `POST /:name/status` e `POST /:name/notes`. O plan as descrevia como somente-leitura.

**Consequência para a spec**: os itens 4-6 ampliam a superfície de ataque que a T12 manda auditar. O handoff para governance deve mencionar explicitamente as rotas `workflow` (que dispara execução de papéis) e `stacks`, não previstas na auditoria original de RCE.

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

Quando T1 concluir: *(já executado)*
```bash
node scripts/agent-router.mjs append '{"from":"sdd-architect","to":"worker","intent":"implement","context":"specs/agent-dashboard/plan.md §2-§5; tasks.md T2-T9 destravadas","acceptance":"rotas /api/* respondem com schema do plan §4; testes verdes","constraints":"allowlist hard-coded; bind 127.0.0.1; sem shell:true","return":"PR + handoff para governance","spec_slug":"agent-dashboard"}'
```

Antes do merge (após T11): **pendente — este é o item aberto da T12**
```bash
node scripts/agent-router.mjs append '{"from":"worker","to":"governance","intent":"review","context":"agent-dashboard; 15 rotas + 12 telas + allowlist de 11 comandos","acceptance":"project:check verde, spec:check verde, auditoria de RCE em /api/commands, /api/workflow e /api/stacks","constraints":"bloquear merge se allowlist contornável ou se rota mutável aceitar path traversal","return":"veredicto APROVADO ou findings","spec_slug":"agent-dashboard"}'
```
