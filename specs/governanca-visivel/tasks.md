# Tasks: governanca-visivel

- **Spec**: ./spec.md
- **Plan**: ./plan.md
- **Status**: done
- **Criado em**: 2026-07-19

> Ordem: dado consultável primeiro (audit), painel depois (que lê o audit). Env injetável em toda a
> lógica pura, para os testes não tocarem o workspace real.

---

## T1 — Schema + `lib/audit.mjs`
- **Owner**: Worker · **Estimativa**: M · **Depende de**: —
- **Paths**: `scripts/memory-schema.mjs`, `lib/audit.mjs`, `test/audit.test.js`
- **Done**:
  - [ ] Tabela `audit_runs` (`line_hash` PK, `ts`, `cmd`, `args`, `exit_code`, `duration_ms`; índices em `cmd`/`ts`).
  - [ ] `syncAudit(env)`: lê o jsonl, `INSERT OR IGNORE` por `line_hash` — idempotente (AC-1). Linha malformada é pulada, não derruba.
  - [ ] `queryAudit(env, {since,cmd,gate,failed})` e `auditSummary(env)` (total, fails, byCmd, slowest, recent) — AC-2.
  - [ ] `env` injetável (`fs`/`dbPath`/`jsonlPath`); testes com jsonl de fixture, incl. idempotência e linha corrompida.

## T2 — `audit:sync` + `audit:query` (registry)
- **Owner**: Worker · **Estimativa**: P · **Depende de**: T1
- **Paths**: `scripts/audit-sync.mjs`, `scripts/audit-query.mjs`, `lib/core/registry.mjs`
- **Done**:
  - [ ] CLIs finos sobre `lib/audit.mjs`; entradas no registry (domínio `governanca`), passam pelo core.
  - [ ] Degradam sem workspace/db: avisam com `sync:universal`/`audit:sync`, não estouram (AC-6).
  - [ ] **Prova real**: `audit:sync` ingere os 255 runs do workspace; `audit:query --failed` e `--cmd release:check` respondem.

## T3 — `lib/governance-report.mjs` (coleta + render)
- **Owner**: Worker · **Estimativa**: M · **Depende de**: T1
- **Paths**: `lib/governance-report.mjs`, `test/governance-report.test.js`
- **Done**:
  - [ ] `collect(env)`: specs (status por stage), ADRs (contagem/lista de `memory/90-decisions`), gates (checks de `health`/`release` + último exit da auditoria — **sem reexecutar**, D4), métricas (comandos do registry).
  - [ ] `renderHtml(data)`: HTML **self-contained** — CSS/JS inline, **zero asset externo** (AC-3/AC-4). Tema claro/escuro. Reaproveita o design do protótipo.
  - [ ] Dado real, não fixture (AC-5): repo sem runs → seção "sem atividade", não quebra.
  - [ ] Teste: `renderHtml` não emite `http`/`src=`/`@import` externo; `collect` degrada sem db.

## T4 — `governance:dashboard` (registry)
- **Owner**: Worker · **Estimativa**: P · **Depende de**: T3
- **Paths**: `scripts/governance-dashboard.mjs`, `lib/core/registry.mjs`
- **Done**:
  - [ ] Escreve o HTML num arquivo (default `<workspace>/.context/governance.html`), reporta o caminho.
  - [ ] **Zero execução** na geração — só lê e escreve (AC-4 / kill criteria). Entrada no registry.
  - [ ] **Prova real**: gera o arquivo, abre e confere que os gates/SDD/auditoria refletem o repo.

## T5 — ADR-0028
- **Owner**: SDD Architect · **Estimativa**: P · **Depende de**: T2, T4
- **Paths**: `memory/90-decisions/0028-*.md`
- **Done**: registra D1 (tabela = projeção), D4 (painel não executa), D5 (comando novo); referencia
  ADR-0022 (a resposta correta ao dashboard congelado), ADR-0020, ADR-0021.

## T6 — Gates (Governance)
- **Owner**: Governance · **Estimativa**: P · **Depende de**: T2, T4, T5
- **Done**: `release:check` (scripts no `files[]`), `tools:doctor` (docs-commands não acusa fantasma
  nos comandos novos), `npm test` verde. spec → `done`.

---
## Handoffs
Worker (T1-T4), SDD Architect (T5), Governance (T6). `forja agent:route` a cada fronteira (ADR-0005).
