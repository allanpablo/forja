# Dashboard

> **⚠️ Congelado em 2026-07-09 — ver [ADR-0022](../memory/90-decisions/0022-congelar-dashboard-web.md).**
> Não é superfície pública do Forja e não é distribuído no pacote npm. Os scripts `npm run dashboard*`
> foram removidos do root: suba manualmente com `cd dashboard && npm install && npm start`.
> Este documento descreve o estado congelado, para quem for retomá-lo. Ver também `dashboard/README.md`.

Painel web local para monitorar specs, handoffs e tokens do framework, e disparar comandos da CLI canônica.

- **Localização**: `dashboard/`
- **Bind**: `127.0.0.1` (nunca expõe a rede — kill criterion da SPEC-002)
- **Porta default**: `7777` (override via `DASHBOARD_PORT`)

## Subir

```bash
# Primeira vez — instala backend + frontend
cd dashboard && npm install && cd web && npm install && cd ../..

# Build do frontend
cd dashboard/web && npm run build && cd ../..

# Sobe servidor (serve SPA + API)
cd dashboard && npm start
# → http://127.0.0.1:7777
```

Modo dev (HMR no frontend, backend separado):

```bash
# terminal 1 — API
cd dashboard && npm run dev
# terminal 2 — Vite com proxy /api → 7777
cd dashboard/web && npm run dev
# → http://127.0.0.1:5173
```

## Telas

| Rota | O quê | Fonte |
|---|---|---|
| `/` (Briefing) | Textarea → POST `/api/briefing` → `spec.md` em status `draft` | parser heurístico (D5) |
| `/specs` | Tabela com status colorido + drawer com spec/plan/tasks | `specs/*/` |
| `/handoffs` | Kanban 3 colunas com botões de transição | `universal.db.handoffs` |
| `/tokens` | Linha 30d por projeto, totais agregados | `.context/*` + `60-runs/*.json` |
| `/commands` | 5 botões com painel SSE ao vivo | allowlist hard-coded |
| `/projects` | Cards com badges (specs, handoffs, commit, memória) | `projects/*` + git + SQLite |

Polling 30s em todas as telas (pausa quando aba não-visível).

## Allowlist de comandos (ADR-0009 + plan §4 D4)

Hard-coded em `dashboard/server/lib/allowlist.mjs`. Qualquer outro nome → `403`.

| Nome | Comando |
|---|---|
| `spec:check` | `node scripts/spec-cli.mjs check` |
| `sync:universal` | `node scripts/sync-universal-memory.js` |
| `memory:vacuum` | `node scripts/compress-memory.mjs` |
| `project:check` | `node scripts/check-standards.js` |
| `sprint:status` | `node scripts/sprint-manager.js status` |

Para adicionar comando novo: edite a constante, adicione teste, documente aqui — exige PR e revisão.

## Endpoints (API)

```
GET  /api/health
GET  /api/specs
GET  /api/specs/:slug
GET  /api/handoffs?status=&to=&from=&spec=&limit=
GET  /api/handoffs/:id
POST /api/handoffs/:id/transition    body { to }
GET  /api/projects
GET  /api/tokens?project=&days=30
GET  /api/commands
POST /api/commands/:name             SSE
POST /api/briefing                   body { brief, slug, projectHint? }
```

## Troubleshooting

**`EADDRINUSE: 7777`** — outra instância já está rodando. Mate com `lsof -ti:7777 | xargs kill` ou use `DASHBOARD_PORT=7778 npm start` de dentro de `dashboard/`.

**`/api/handoffs` retorna `[]` no primeiro acesso** — `universal.db` ainda não foi criado. Rode `node scripts/agent-router.mjs schema` ou abra qualquer handoff via `agent-router append`.

**SPA mostra placeholder em vez das telas** — `dashboard/web/dist/` não existe. Rode `npm run build` de dentro de `dashboard/web/`.

**Briefing recusa slug** — kebab-case, 2-64 caracteres, começando com letra/dígito. Use o auto-slug do form.

**SSE corta no meio** — alguns proxies bufferizam SSE. Mantenha o dashboard em `127.0.0.1` direto, sem reverse proxy.

## Segurança

- Bind exclusivo em `127.0.0.1` (não há flag para abrir para rede — proposital)
- Allowlist literal em código (não config) — ADR-0009 D4
- `spawn` sem `shell: true`; sem interpolação de args do body
- `POST /api/briefing` valida slug com regex e bloqueia conflito de spec existente
- `POST /api/handoffs/:id/transition` aceita só `in_progress | done | cancelled`
- 95% das telas são read-only; mutação só via shell-out para a CLI canônica

## Limites conhecidos (v1)

- Briefing usa heurística simples — não LLM (D5). Sucesso depende do briefing seguir padrão "Hoje…", "Queremos…", "Como X, quero Y, para que Z".
- Tokens são estimativa por `chars/4`, não consumo real da API.
- Polling 30s; sem WebSocket.
- Sem auth, sem multi-usuário (intencional — kill criterion).
