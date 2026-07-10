# Plan: agent-dashboard

- **Spec**: ./spec.md
- **Status**: abandoned
- **Criado em**: 2026-05-11

## 1. Abordagem técnica

Servidor único Node (Fastify) servindo: **(a)** JSON API que lê `universal.db` + filesystem, **(b)** SPA estática buildada do `dashboard/web/`. Não há SSR, não há processo separado. SPA chama `/api/*`. Comandos do framework são disparados via `child_process.spawn` com **allowlist hard-coded**, stream de stdout/stderr via SSE (Server-Sent Events — mais simples que WebSocket, suficiente para output linear). Briefing → spec é shell-out para `scripts/spec-cli.mjs` + um parser de heurística (sem LLM nesta versão).

Tudo isolado em `dashboard/` com seu próprio `package.json`. O kit raiz não ganha dependência runtime nova — `npm run dashboard` no root delega para `cd dashboard && npm start`.

## 2. Módulos afetados

| Caminho | Mudança | Risco |
|---|---|---|
| `dashboard/package.json` | criar — deps: fastify, better-sqlite3 (já existe no kit), execa | B |
| `dashboard/server/index.mjs` | criar — bootstrap Fastify + registro de rotas | B |
| `dashboard/server/routes/specs.mjs` | criar — `GET /api/specs`, `GET /api/specs/:slug` | B |
| `dashboard/server/routes/handoffs.mjs` | criar — `GET /api/handoffs`, `POST /api/handoffs/:id/transition` | M |
| `dashboard/server/routes/tokens.mjs` | criar — `GET /api/tokens?project=&days=30` | M |
| `dashboard/server/routes/projects.mjs` | criar — `GET /api/projects` | B |
| `dashboard/server/routes/commands.mjs` | criar — `POST /api/commands/:name` com SSE; allowlist | A (RCE) |
| `dashboard/server/routes/briefing.mjs` | criar — `POST /api/briefing` → cria spec | M |
| `dashboard/server/lib/allowlist.mjs` | criar — fonte única de comandos permitidos | A |
| `dashboard/server/lib/briefing-parser.mjs` | criar — heurística texto → seções spec | M |
| `dashboard/server/lib/token-estimator.mjs` | criar — chars/4 + leitura de `60-runs/` | B |
| `dashboard/web/` (Vite+React) | criar — 5 telas + layout | M |
| `package.json` (root) | editar — adicionar `dashboard` script | B |
| `.gitignore` | editar — ignorar `dashboard/web/dist`, `dashboard/node_modules` | B |
| `docs/dashboard.md` | criar — uso, troubleshooting, allowlist | B |

## 3. Diagrama de fluxo

```
Browser (localhost:7777)
    │
    ├─ HTML/JS estático ──→ dashboard/web/dist/
    │
    └─ /api/* ──→ Fastify ──┬─ better-sqlite3 ──→ .memory/sqlite/universal.db
                            ├─ fs ──→ specs/, projects/, memory/60-runs/
                            └─ spawn (allowlist) ──→ scripts/spec-cli.mjs
                                                  ──→ scripts/agent-router.mjs
                                                  ──→ scripts/compress-memory.mjs
                                                  ──→ scripts/sync-universal-memory.js
                                                  ──→ scripts/check-standards.js
                                                  ──→ scripts/sprint-manager.js

SSE stream de stdout/stderr ─────────────────→ painel lateral da UI
```

## 4. Contratos (API)

Todas as rotas montadas sob `/api`. Retorno padrão JSON. Erros 4xx/5xx em `{error: string, code: string}`.

### Leitura

```ts
GET /api/specs
  → [{ slug, status, file, sprint, owner, hasplan, hastasks }]

GET /api/specs/:slug
  → { slug, spec: string, plan: string|null, tasks: string|null }

GET /api/handoffs?status=open|in_progress|done&to=<agent>
  → [{ id, created_at, from_agent, to_agent, intent, status, spec_slug, ... }]

POST /api/handoffs/:id/transition
  body: { to: "in_progress"|"done"|"cancelled" }
  → { id, status }

GET /api/projects
  → [{ name, path, specs_open, handoffs_open, last_commit, memory_bytes }]

GET /api/tokens?project=<name>&days=30
  → { project, days, series: [{ date, tokens_in, tokens_out, mode_breakdown }] }
```

### Mutação controlada

```ts
POST /api/commands/:name
  body: { args?: string[] }   // args só usado se a entrada na allowlist permitir
  → SSE stream (text/event-stream): evento "stdout"|"stderr"|"exit"

  :name ∈ COMMAND_ALLOWLIST (commands.mjs)

POST /api/briefing
  body: { brief: string, slug?: string, projectHint?: string }
  → { slug, specPath, parsed: { problem, value, stories } }
```

### Allowlist (hard-coded)

```js
export const COMMAND_ALLOWLIST = {
  'spec:check':     { cmd: 'node', args: ['scripts/spec-cli.mjs', 'check'] },
  'sync:universal': { cmd: 'node', args: ['scripts/sync-universal-memory.js'] },
  'memory:vacuum':  { cmd: 'node', args: ['scripts/compress-memory.mjs'] },
  'project:check':  { cmd: 'node', args: ['scripts/check-standards.js'] },
  'sprint:status':  { cmd: 'node', args: ['scripts/sprint-manager.js', 'status'] },
};
```

Qualquer outro `:name` retorna `403 { error: "command not allowlisted" }`. Sem interpolação de shell — `spawn` direto sem `shell: true`. `args` do body só é apendado se a entrada da allowlist marcar `acceptsArgs: true` (nenhuma marca isso na v1).

## 5. Decisões e alternativas

**D1 — Fastify em vez de Express**
Razão: mais rápido, hooks de erro estritos, schema validation embutida. Rejeitada: Express (mais boilerplate, precisa ajv separado).

**D2 — Vite + React + shadcn/ui**
Razão: shadcn é copy-paste (não vira dep gigante), Tailwind já é stack confortável, ecossistema rico de tabelas/kanban/charts. Rejeitada: htmx puro (gráfico precisa Recharts); Svelte (menos componentes prontos).

**D3 — SSE em vez de WebSocket**
Razão: stdout/stderr é unidirecional. SSE roda em HTTP simples, sem upgrade, sem libs. Rejeitada: WebSocket (over-engineering); polling em log file (latência, cleanup).

**D4 — Allowlist literal em código, não config**
Razão: arquivo editável aumenta superfície (quem escreve no `.allowlist.json` ganha RCE). Hard-coded em `.mjs` exige PR + revisão. Rejeitada: regex `spec:*` (escapa para `spec:; rm -rf` se algum dia passar via shell).

**D5 — Briefing parser heurístico, sem LLM nesta versão**
Razão: dep zero, custo zero, latência zero. Heurística: split em parágrafos, busca palavras-chave ("problema", "queremos", "para que <persona>"), preenche seções 1-3 do template. Saída fica em `draft` — revisão humana obrigatória. Rejeitada nesta versão: Anthropic API (env var, custo, latência, dep). Evolui para v2 (potencial ADR-0011).

**D6 — Pasta `dashboard/` isolada com próprio `package.json`**
Razão: zero impacto em quem só usa o kit como scaffold. Rejeitada: workspaces npm (complica `npm publish` do kit).

**D7 — Token estimator: chars/4, sem chamada API real**
Razão: spec §5 já marca "custo real" como fora de escopo. Estimativa rotulada na UI. Fonte: agrega `memory/60-runs/*.json` se existir, lê tamanho dos packs em `.context/` por projeto. Rejeitada: Anthropic Usage API (exige API key local, expõe credencial).

**D8 — Porta 7777 default, configurável via `DASHBOARD_PORT`**
Razão: porta raramente ocupada. Override por env var resolve conflito.

> Nenhuma destas decisões parece estrutural-irreversível o suficiente para abrir ADR. Se durante a impl emergir uma irreversível, abrir ADR-0010.

## 6. Dependências

- **Specs**: depende de SPEC-001 (já em `implementing`) — usa `spec-cli.mjs` e `agent-router.mjs`
- **Pacotes npm novos** (todos em `dashboard/package.json`, não no root):
  - `fastify`, `@fastify/static`, `@fastify/cors`
  - `better-sqlite3` (já é devDep no root — duplicado no dashboard)
  - Front: `vite`, `react`, `react-dom`, `react-router-dom`, `tailwindcss`, `recharts`
  - shadcn/ui via CLI (copy-paste, não vira dep)
- **Migrações de memória**: nenhuma — `projects`, `memory_nodes`, `handoffs` já existem em `universal.db`

## 7. Rollout

- [x] Feature flag: não — `npm run dashboard` é opt-in por natureza
- [x] Migração de dados: não
- [ ] Doc/persona: criar `docs/dashboard.md`, linkar em `DOC-MAP.md`; mencionar em `docs/personas/developer/` como ferramenta visual

## 8. Sinais de fracasso (kill criteria)

Abandonar / refatorar profundamente se:
- Allowlist for desviada via injection (qualquer comando fora dela conseguir rodar)
- Polling 30s × 10 projetos passar de 500ms p95 em `/api/tokens` — estimativa por leitura de arquivos não escala
- Briefing heurístico produzir spec reescrita 100% em > 80% dos casos — sinal de que precisa LLM
- Dashboard aberto < 1×/semana após 30d — leitura ASCII era suficiente

## Próximo handoff
SDD Architect → Product (revisar plan) → SDD Architect (gerar `tasks.md`) → Worker (impl).
Quando este plan for aprovado, rodar:
```bash
node scripts/spec-cli.mjs tasks agent-dashboard
node scripts/agent-router.mjs done 2
```
