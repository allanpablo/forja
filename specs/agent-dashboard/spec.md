# Spec: agent-dashboard

- **ID**: SPEC-002
- **Status**: implementing
- **Owner**: apk
- **Criado em**: 2026-05-11
- **Sprint alvo**: refator-2026-05 (próximo após SPEC-001)
- **ADRs relacionadas**: ADR-0002 (SQLite/FTS5), ADR-0005 (handoff 7 campos), ADR-0008 (sub-agents)

## 1. Problema

Hoje só dá pra acompanhar o framework pelo terminal: `agent-router list`, `spec:check`, ler `60-runs/` na unha. Resultado:

- **Visibilidade**: difícil ver de relance o estado dos 10 projetos em `projects/` — quantas specs ativas, handoffs travados, sprint em curso, sem rodar 3-4 comandos.
- **Custo invisível**: smart-context economiza tokens (40-60%, ADR-0003), mas não há gráfico de consumo ao longo do tempo. Não dá pra responder "qual projeto come mais token?".
- **Onboarding de feature novo**: começar uma feature exige saber a CLI inteira (`spec:new`, mexer em `vision.md`, rodar `sync:universal`). Para o próprio autor é OK; para qualquer outro humano é fricção.
- **Briefing perdido**: quando uma feature nasce de uma conversa, o "porquê" original some entre WhatsApp/Notion/cabeça. Falta um ponto de captura inicial que vire `spec.md` direito.

## 2. Proposta de valor

Um painel web local (`npm run dashboard`) que: **(a)** mostra estado de specs/handoffs/tokens em tempo quase-real, **(b)** permite iniciar uma feature a partir de um briefing em texto livre que vira `spec.md`, e **(c)** dispara os comandos principais do framework com 1 clique. CLI continua canônica — a UI é leitura + atalho de entrada.

## 3. User stories

- **Como** autor do framework, **quero** ver num gráfico quanto cada projeto consumiu de tokens nos últimos 30 dias, **para que** eu decida onde investir compressão/cache.
- **Como** Product Agent, **quero** colar um briefing em texto livre e receber um rascunho de `spec.md` pré-preenchido, **para que** eu salte a página em branco.
- **Como** Orchestrator, **quero** ver handoffs abertos em kanban (open / in_progress / done), **para que** eu detecte gargalo (ex: 4 handoffs parados em `sdd-architect`).
- **Como** dev de outro projeto, **quero** botões para `spec:check`, `sync:universal` e `memory:vacuum`, **para que** eu não precise memorizar a CLI.
- **Como** Governance Agent, **quero** ver quais features estão em `implementing` sem ADR referenciada no plan, **para que** eu bloqueie a tempo.

## 4. Critérios de aceite

- [x] **AC-1**: `npm run dashboard` sobe servidor local (Vite ou Express estático) em `localhost:<porta>` e abre o browser
- [x] **AC-2**: Tela "Specs" lista todas as features de `specs/<slug>/` com status colorido (draft/review/approved/implementing/done/abandoned) e link para spec.md/plan.md/tasks.md
- [x] **AC-3**: Tela "Handoffs" mostra 3 colunas (open / in_progress / done) lidas de `universal.db.handoffs`; permite marcar como `done` ou `in_progress` via botão (chama `agent-router`)
- [x] **AC-4**: Tela "Tokens" mostra gráfico (linha) de tokens estimados por dia nos últimos 30d, agregado por projeto, lido de `memory_nodes` + `60-runs/`
- [x] **AC-5**: Tela "Novo briefing" tem um `<textarea>` ≥10 linhas + select de projeto-alvo. Botão "Gerar spec" envia o texto para um endpoint que: (a) cria `specs/<slug>/` via `spec-cli.mjs new`, (b) pré-preenche seções 1-3 (Problema/Valor/User stories) com o briefing em prosa estruturada, (c) deixa o status em `draft` para o usuário revisar
- [x] **AC-6**: Tela "Comandos" tem botões para: `spec:check`, `sync:universal`, `memory:vacuum`, `project:check`, `sprint:status` — cada um abre painel lateral com stdout/stderr em tempo real
- [x] **AC-7**: Tela "Projetos" lista `projects/*` com badges (specs ativas, handoffs abertos, último commit, tamanho da memória)
- [x] **AC-8**: Polling de 30s atualiza dados sem refresh manual
- [x] **AC-9**: Acessível somente a `localhost` (binding em `127.0.0.1`), sem auth; documentado como "ferramenta de dev local"
- [x] **AC-10**: `npm run dashboard` funciona sem instalar nada além de `npm install` no repo

## 5. Escopo

**Dentro**:
- Backend Express/Fastify minimalista (1 arquivo, lê SQLite e fs)
- Frontend Vite + React + shadcn/ui (ou alternativa mais leve se justificada no plan)
- 5 telas: Specs, Handoffs, Tokens, Briefing, Comandos, Projetos
- Polling simples (30s) — sem WebSocket
- "Pré-preenchimento" de spec via heurística simples (regex/keywords no briefing) — sem LLM nesta primeira versão
- Cores e estados ligados a ADR-0007 (status SDD) e ADR-0008 (status handoff)

**Fora** (explícito, evita scope creep):
- Edição livre de spec.md/plan.md/tasks.md pela UI (só status via comando)
- Pré-preenchimento via LLM real (Anthropic/OpenAI API) — fica para v2
- ~~WebSocket / SSE / push em tempo real~~ — **revisado 2026-05-11: SSE de eventos adicionado para que toda ação da UI exiba o comando executando ao vivo**
- WebSocket bidirecional (mantém SSE simples)
- Auth, multi-usuário, deploy remoto
- Custo real consumido na API Anthropic (depende de plumbing extra)
- Mobile / responsive sério (desktop-first; degrada graciosamente)
- Dark mode toggle (segue OS, sem switch)
- i18n (pt-BR fixo)

## 6. NFRs / restrições

- **Performance**: primeira pintura < 1s em localhost; polling não pode passar de 200ms na rota mais pesada (tokens)
- **Segurança**: bind em `127.0.0.1` apenas; nunca expõe a rede; endpoints que invocam scripts (Comandos, Briefing) precisam allowlist explícita — `npm` arbitrário NÃO
- **Compatibilidade**: não quebra nenhum script npm existente; CLI continua sendo a fonte da verdade
- **Observabilidade**: cada ação que dispara comando loga em `60-runs/dashboard-<ts>.json`
- **Dependências**: zero novas runtime deps no kit base (só dev). Frontend isolado em `dashboard/` com seu próprio `package.json`
- **Tamanho do bundle**: front com menos de 500KB gzipped

## 7. Riscos e mitigação

| Risco | P | I | Mitigação |
|---|---|---|---|
| Dashboard vira "fonte da verdade" e dessincroniza com CLI | M | A | Read-only em 95% das telas; mutações sempre via shell-out para o script CLI canônico |
| Endpoint de comandos vira RCE local | B | A | Allowlist hard-coded de scripts permitidos; sem `npm run <arbitrário>` |
| Gráfico de tokens mente (estimativa ≠ real) | A | M | Rotular como "estimativa baseada em chars/4"; documentar fórmula |
| Briefing → spec produz texto ruim | A | M | Marcar status `draft` e exigir revisão humana antes de mudar pra `review` |
| Adicionar bundle JS pesado complica o repo | M | M | Frontend em pasta isolada; CI roda `npm test` no kit sem precisar buildar dashboard |

## 8. Métricas de sucesso (30d)

- Autor abre o dashboard ≥3×/semana
- ≥1 spec criada via briefing (versus 100% via CLI hoje)
- 0 incidentes de comando executado fora da allowlist
- Tempo médio "abriu dashboard → identificou gargalo" < 60s
