# Spec: pipeline-sdd-e-orquestracao

- **ID**: SPEC-001
- **Status**: done
- **Owner**: framework-team
- **Criado em**: 2026-05-10
- **Sprint alvo**: refator-2026-05
- **ADRs relacionadas**: ADR-0007 (SDD), ADR-0008 (sub-agents executáveis)

## 1. Problema
O framework declara "spec-driven" e "orquestração" no AGENTS.md mas não há mecânica: nenhum comando força spec antes de código, e os 6 papéis de AGENTS.md não têm sub-agents executáveis em `.claude/agents/`. Handoffs vivem como markdown manual em `memory/50-orchestration/handoffs/`. Resultado: cada agente reinventa formato, retrabalho alto, decisões perdidas.

## 2. Proposta de valor
Toda feature não-trivial passa por `spec → plan → tasks` validado por CLI, e tarefas são roteadas para sub-agents Claude com handoff rastreável em SQLite. Spec-driven e orquestração deixam de ser slogans.

## 3. User stories
- **Como** Product Agent, **quero** rascunhar uma spec em 5 min com template, **para que** o backlog tenha entrada estruturada
- **Como** SDD Architect, **quero** que `spec:plan` só funcione com spec aprovada, **para que** ninguém pule etapa
- **Como** Worker, **quero** receber handoff com 7 campos via tabela SQLite, **para que** eu não pesque contexto em markdown
- **Como** Governance Agent, **quero** rodar `project:check` que falha se há código novo sem spec ativa, **para que** dívida não se acumule

## 4. Critérios de aceite
- [x] AC-1: `npm run spec:new <feature>` cria diretório com spec.md preenchido a partir do template
- [x] AC-2: `npm run spec:plan` e `spec:tasks` só rodam se a fase anterior está `approved+`
- [x] AC-3: `npm run spec:check` lista status de todas as features e falha com exit≠0 se inconsistente
- [ ] AC-4: `.claude/agents/*.md` para 6 papéis funcionando como sub-agents
- [ ] AC-5: handoffs registrados em tabela SQLite (`universal.db.handoffs`) com 7 campos da ADR-0005
- [ ] AC-6: `agent:route` aceita handoff e dispara sub-agent correspondente
- [ ] AC-7: hook `UserPromptSubmit` injeta smart-context automaticamente

## 5. Escopo
**Dentro**:
- CLI `spec-cli.mjs` (new/plan/tasks/check)
- Templates em `specs/_templates/`
- 6 sub-agents em `.claude/agents/`
- Tabela `handoffs` no `universal.db` + script `agent-router.mjs`
- Hooks em `.claude/settings.json`

**Fora**:
- Embeddings semânticos (mantém FTS5)
- UI/dashboard interativo de specs
- Migrar handoffs antigos em markdown — só novos
- Sub-agents para outros provedores (Copilot, Gemini) — só Claude nesta rodada

## 6. NFRs
- Performance: `spec:check` < 500ms em 100 specs
- Compatibilidade: scripts npm existentes não quebram
- Segurança: nenhum script gera token/secret embedido
- Observabilidade: cada invocação de sub-agent loga em `60-runs/`

## 7. Riscos
| Risco | P | I | Mitigação |
|---|---|---|---|
| Hook UserPromptSubmit causa latência | M | M | Cache por hash do prompt + cap de bytes |
| Sub-agents disputam contexto | B | A | Roteamento explícito via handoff, sem broadcast |
| SDD vira burocracia | M | A | Lista clara em README de "quando NÃO precisa de spec" |

## 8. Métricas de sucesso (30d)
- ≥80% das features novas atravessam o pipeline completo
- 0 PRs mergeados com `spec:check` falhando
- Tempo médio spec→tasks < 1 dia
