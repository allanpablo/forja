# Plan: governanca-visivel

- **Spec**: ./spec.md
- **Status**: done
- **Criado em**: 2026-07-19

> Como vamos construir o que a spec define. Sem código aqui — só estrutura e decisões.

## 1. Abordagem técnica

Três comandos no domínio `governanca`, todos passando pelo core (auditados como os demais):

- `audit:sync` — ingest do `.context/forja-runs.jsonl` (fonte de verdade append-only) numa tabela
  `audit_runs` do `universal.db` do workspace. A tabela é **projeção reconstruível**: o `.jsonl`
  manda.
- `audit:query` — consulta estruturada (`--since`, `--cmd`, `--gate`, `--failed`).
- `governance:dashboard` — gera um HTML **estático e self-contained** de governança.

O painel **não executa nada** — lê specs, ADRs e a tabela de auditoria e escreve um arquivo. É a
resposta correta ao ADR-0022: o dashboard antigo era servidor com rotas; este é um *artefato*, como
o `project:dashboard` já é (só que HTML e sobre governança). O design do HTML reaproveita o protótipo
já validado nesta sessão.

## 2. Módulos afetados

| Caminho | Mudança | Risco |
|---|---|---|
| `scripts/memory-schema.mjs` | criar tabela `audit_runs` (+ índices) | B |
| `lib/audit.mjs` | **criar** — ingest do jsonl + queries (puro, testável) | M |
| `scripts/audit-sync.mjs` · `scripts/audit-query.mjs` | **criar** — CLIs finos sobre `lib/audit.mjs` | B |
| `lib/governance-report.mjs` | **criar** — coleta (specs/ADRs/audit/métricas) + render HTML self-contained | M |
| `scripts/governance-dashboard.mjs` | **criar** — CLI que escreve o arquivo | B |
| `lib/core/registry.mjs` | 3 entradas novas (`governanca`) | B |
| `test/audit.test.js` · `test/governance-report.test.js` | **criar** | B |
| `memory/90-decisions/0028-*.md` | **criar** — ADR | B |

Risco mora na coleta (`governance-report`): ler dados reais sem quebrar quando faltam (repo sem runs,
sem workspace). A renderização é mecânica; o design já está provado.

## 3. Fluxo

```
  .context/forja-runs.jsonl  ──audit:sync──►  audit_runs (universal.db)
   (append-only, verdade)                          │
                                                    ├──► audit:query  (--since/--cmd/--failed)
                                                    │
   specs/*  +  memory/90-decisions/*  +  registry ─┴──► governance:dashboard
                                                          │
                                                          ▼
                                              governance.html (estático, file://)
                                              zero rota · zero processo · leitura
```

## 4. Contratos

```js
// lib/audit.mjs — puro, env injetável ({ fs, dbPath, jsonlPath })
export function syncAudit(env);   // jsonl → audit_runs; idempotente. -> { ingested, total }
export function queryAudit(env, { since, cmd, gate, failed });  // -> Run[]
export function auditSummary(env);  // p/ o painel: { total, fails, byCmd, slowest, recent }

// lib/governance-report.mjs — puro, devolve string HTML
export function collect(env);        // { specs, adrs, gates, audit, metrics }
export function renderHtml(data);    // -> HTML self-contained (CSS/JS inline, zero asset externo)
```

**Schema `audit_runs`**: `line_hash TEXT PRIMARY KEY` (idempotência — hash da linha do jsonl),
`ts TEXT`, `cmd TEXT`, `args TEXT` (json), `exit_code INTEGER`, `duration_ms INTEGER`. Índices em
`cmd` e `ts`. Sem FTS5: o dado é colunar; query por coluna basta (D3).

## 5. Decisões e alternativas

**D1: A tabela é projeção; o `.jsonl` é a verdade.** `audit:sync` reconstrói do zero a qualquer
momento. Alternativa rejeitada: gravar direto no SQLite no core — acoplaria toda execução ao banco
(e o banco pode estar morto, ADR-0021). O log em arquivo é resiliente; a tabela é derivada.

**D2: Idempotência por `line_hash`, não por cursor.** Hash do conteúdo da linha como PK + `INSERT OR
IGNORE`. Robusto a re-sync e a truncamento do jsonl. Um cursor (contar linhas) quebra se o arquivo
for reescrito.

**D3: SQL estruturado, não FTS5.** O dado é `{cmd, exit, duração, ts}` — colunar. Query por coluna e
janela de tempo resolve as perguntas reais ("release:check reprovou quantas vezes"). FTS5 seria
over-engineering aqui; entra só se a busca por texto livre em `args` provar valer.

**D4: O painel não executa gates — lê o último resultado da auditoria.** Rodar `tools:doctor`/
`release:check` na geração seria lento e com efeito colateral. O painel mostra os checks de cada
catálogo (de `health`/`release`) + o **último exit** daquele comando na auditoria. Estado real, sem
reexecutar. Reforça o AC-4 (zero processo).

**D5: Comando novo, não estender `project:dashboard`.** O `project:dashboard` é markdown sobre o
ecossistema de projetos; este é HTML sobre a saúde do framework. Fundir confundiria dois públicos.
Coexistem (spec §5).

**D6: HTML self-contained, reaproveitando o protótipo.** CSS/JS inline, zero asset externo — abre com
`file://`. O design (gates, quadro SDD, métricas, tema claro/escuro) já foi validado como artifact
nesta sessão; vira template do gerador.

D1, D4 e D5 são estruturais → **ADR-0028** (auditoria consultável; painel estático-gerado como a
resposta correta ao ADR-0022), referenciando ADR-0022, ADR-0020 e ADR-0021.

## 6. Dependências

- **Specs**: nenhuma bloqueante. Usa o `universal.db` (SPEC-009/reestruturacao) e o audit (ADR-0020).
- **Pacotes**: **nenhum novo.** `better-sqlite3` (já runtime dep) + `node:fs`. HTML é string.
- **Migrações**: `audit_runs` é `CREATE TABLE IF NOT EXISTS` — aditivo, sem migração de dado.

## 7. Rollout

- [ ] Schema `audit_runs` + `lib/audit.mjs` (sync/query/summary) + testes, com env injetável.
- [ ] `audit:sync` e `audit:query` no registry; provar contra os 255 runs reais do workspace.
- [ ] `lib/governance-report.mjs` (coleta + render) + `governance:dashboard`; abrir o HTML e conferir.
- [ ] Degradação (AC-6): sem workspace/db, avisa e segue. Repo sem runs → "sem atividade", não quebra.
- [ ] ADR-0028; gates (`release:check`, `tools:doctor`, `npm test`).

## 8. Sinais de fracasso (kill criteria)

- **Qualquer coisa que execute na geração do painel** — se o gerador rodar um gate ou abrir um
  processo, virou a SPEC-002 de novo. O painel só lê e escreve um arquivo (AC-4).
- **O HTML puxa asset externo** (CDN, fonte, imagem remota) — quebra o "abre com `file://`". Tudo
  inline.
- **A tabela vira a fonte de verdade** — se alguém passar a gravar só no SQLite e largar o `.jsonl`,
  perdemos a resiliência do log em arquivo (D1). A tabela é sempre derivável.
