# ADR-0028: Governança visível — auditoria consultável + painel estático-gerado

- **Status**: accepted
- **Data**: 2026-07-19
- **Autor(es)**: Allan Pablo
- **Tags**: governance, audit, dashboard, token-economy

## Contexto

O core grava toda execução em `.context/forja-runs.jsonl` (ADR-0020): `{ts, cmd, args, exitCode,
durationMs}`. É o dado mais rico de governança do framework — a resposta viva para *"o processo foi
seguido? o que reprovou? quanto custou?"* — e era **write-only**. Para saber "quantas vezes o
`release:check` reprovou", alguém abria um `.jsonl` de centenas de linhas e contava na mão. Dado que
existe mas não é consultável é dado morto — a mesma classe que a sessão inteira atacou.

E faltava superfície visual. A tentativa anterior (SPEC-002) foi **congelada** (ADR-0022) — mas o
motivo não foi "ser visual": foi ser um **servidor** com rotas que *executavam* processos
(`POST .../run/:role`), um passivo de manutenção e de segurança. A lição é "sem servidor, sem
execução", não "sem visual".

## Decisão

Três comandos no domínio `governanca`, todos passando pelo core:

- **`audit:sync`** — projeta o `.jsonl` numa tabela `audit_runs` do `universal.db`. A tabela é
  **projeção reconstruível**; o `.jsonl` segue sendo a fonte de verdade append-only.
- **`audit:query`** — consulta estruturada (`--failed`, `--cmd`, `--since 7d`).
- **`governance:dashboard`** — gera um HTML **estático, self-contained** (gates, pipeline SDD,
  auditoria, métricas). Um arquivo, aberto com `file://`. **Não executa nada.**

Princípios:

- **D1 — A tabela é projeção; o `.jsonl` é a verdade.** Gravar direto no SQLite no core acoplaria
  toda execução ao banco (que pode estar morto, ADR-0021). O log em arquivo é resiliente; a tabela é
  derivada, reconstruível por `audit:sync`.
- **D2 — Idempotência por `line_hash`**, não por cursor. Hash do conteúdo da linha como PK +
  `INSERT OR IGNORE`. Robusto a re-sync e a truncamento do log.
- **D3 — SQL estruturado, não FTS5.** O dado é colunar (`cmd`, `exit`, `duração`, `ts`); query por
  coluna responde as perguntas reais. FTS5 seria over-engineering aqui.
- **D4 — O painel não executa gates.** Mostra os checks de cada catálogo (`health`/`release`) + o
  **último exit** daquele comando na auditoria. Estado real, sem reexecutar — reforça o "sem
  execução" do ADR-0022.
- **D5 — Comando novo, não estender `project:dashboard`.** Aquele é markdown sobre o ecossistema de
  projetos; este é HTML sobre a saúde do framework. Coexistem.
- **D6 — Self-contained obrigatório.** CSS inline, zero asset externo, zero `<script>`. Abre com
  `file://`. É o que separa este painel do servidor congelado.

## Alternativas consideradas

- **Ressuscitar o dashboard-servidor** — rejeitada: é exatamente o que o ADR-0022 congelou.
  Artefato gerado entrega o visual sem o passivo.
- **Gravar a auditoria direto no SQLite** — rejeitada: acopla execução ao banco e perde a
  resiliência do log em arquivo (D1).
- **FTS5 na auditoria** — rejeitada: o dado é estruturado; SQL por coluna basta (D3).
- **O painel executar os gates para mostrar o estado atual** — rejeitada: lento, com efeito
  colateral, e reintroduz "execução" na superfície visual. O último exit da auditoria é estado real
  o suficiente (D4).

## Consequências

**Positivas**:
- "Quantas vezes o `release:check` reprovou?" passou de contagem manual a **uma query**. Medido em
  campo na implementação: 34 runs, 9 reprovações (as reprovações reais da própria sessão).
- O Forja ganha superfície visual **sem** repetir o erro do ADR-0022 — é arquivo, não serviço.
- O resumo de auditoria que um agente lê é menor em tokens que o `.jsonl` cru — governança visível
  também economiza contexto (ADR-0009).

**Negativas / Trade-offs**:
- O estado dos gates no painel é o *último* exit registrado, não um check ao vivo — pode estar
  defasado se o gate não roda há tempo. É o preço consciente do "sem execução" (D4); quem quer o
  estado agora roda `tools:doctor`.
- Duas superfícies de "dashboard" (`project:dashboard` markdown + `governance:dashboard` HTML). Uma
  unificação futura é possível, mas fundir agora confundiria dois públicos (D5).

## Rastreamento

- Implementação: `lib/audit.mjs`, `lib/governance-report.mjs`, `scripts/audit-{sync,query}.mjs`,
  `scripts/governance-dashboard.mjs`, `scripts/memory-schema.mjs` (tabela `audit_runs`)
- Spec: `specs/governanca-visivel/` (SPEC-014)
- ADRs relacionadas: ADR-0022 (dashboard congelado — a decisão que este responde corretamente),
  ADR-0020 (o core que grava a auditoria), ADR-0021 (resiliência: log em arquivo > banco), ADR-0009
  (economia de tokens)
- **Follow-up**: instrumentar custo de token por tarefa (o audit grava duração, não tokens); o painel
  já tem lugar para isso.
