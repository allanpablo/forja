# Mapa de Documentação

Ponto de entrada por papel. Para histórico de fases ver `CHANGELOG.md`; para decisões com rationale ver `memory/90-decisions/`.

---

## Por papel

### Operacao CLI / Orquestracao
- `docs/modos-de-operacao.md` — escolha entre uso embedded no projeto consumidor e studio multi-projeto
- `docs/processo-projeto.md` — **processo nível 0**: criar vs atualizar projeto com a IA (decisão de entrada)
- `docs/fluxo.md` — **mapa do ciclo** (CLI-first) com as 3 capacidades integradas (codegraph/harness/ai-engineering)
- `docs/manual-operacional-cli-sdd-gsd.md` — manual principal para operar CLI-first, SDD, GSD, sprints, handoffs e governanca
- `docs/cli-first-operacao.md` — guia curto de comandos

### Executivo / PM
- `docs/personas/executive/README.md` — overview, ROI, status
- `docs/produto/factsheet-marketing.md` — posicionamento, capacidades comprovadas e claims de marketing
- `docs/produto/roteiro-demo.md` — cenário sintético e roteiro de apresentação

### Arquiteto / Tech Lead
- `docs/personas/architect/README.md`
- `docs/token-optimization.md` — economia de tokens e cache
- `docs/structure.md` — hierarquia de diretórios gerados
- `docs/architecture/FORJA-2.0-ARCHITECTURE.md` — arquitetura de referência 2.0
- `docs/architecture/FORJA-3-ENGINEERING-INTELLIGENCE-ARCHITECTURE.md` — auditoria, gap analysis e
  arquitetura proposta para a evolução 3.0 (Engineering Twin/Control Plane — ver ADR-0078,
  SPEC-031)
- `memory/90-decisions/` — ADRs

### Developer
- `docs/personas/developer/README.md`
- `docs/quick-reference.md` — atalhos e comandos
- `docs/examples.md` — snippets prontos
- `docs/dev-workflow.md`
- `docs/init-project.md` — como gerar novo projeto
- `docs/dashboard.md` — painel web local (**congelado**, ver ADR-0021; não distribuído no pacote npm)

### QA
- `docs/personas/qa/README.md`

### Agentes / IA
- `AGENTS.md` — papéis e topologia
- `CLAUDE.md` — instruções específicas para Claude Code
- `.claude/agents/` — sub-agents executáveis (em construção)
- `memory/50-orchestration/` — protocolos de handoff
- `docs/capacidades-externas.md` — codegraph (MCP), harness (plugin) e ai-engineering (base de conhecimento) integrados (ADR-0016)

---

## Por tópico

| Tópico | Arquivo |
|---|---|
| Manual operacional CLI-first | `docs/manual-operacional-cli-sdd-gsd.md` |
| Modos embedded e studio | `docs/modos-de-operacao.md` |
| Guia curto CLI-first | `docs/cli-first-operacao.md` |
| Mudanças recentes | `CHANGELOG.md` |
| Decisões arquiteturais | `memory/90-decisions/` |
| Glossário | `docs/glossary.md` |
| Otimização de tokens | `docs/token-optimization.md` |
| Integrações LLM e perfil GPT-6 | `docs/llm-fit-loop.md` |
| Visão e roadmap de evolução LLM | `docs/llm-evolution.md` |
| Capacidades externas (codegraph/harness/ai-engineering) | `docs/capacidades-externas.md` |
| Workflow de dev | `docs/dev-workflow.md` |
| Publicação npm | `docs/publishing.md` |
| Estrutura gerada | `docs/structure.md` |
| Exemplos de código | `docs/examples.md` |
| Dashboard web (congelado) | `docs/dashboard.md` |
| Factsheet de produto e marketing | `docs/produto/factsheet-marketing.md` |

---

## Histórico

Relatórios de fases anteriores estão em `docs/archive/`. Não edite — referenciar via `CHANGELOG.md` ou ADRs apropriadas.
