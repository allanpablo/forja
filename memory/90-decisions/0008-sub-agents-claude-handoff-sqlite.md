# ADR-0008: Sub-agents executáveis + handoff em SQLite

- **Status**: accepted
- **Data**: 2026-05-10
- **Tags**: orchestration, agents, sdd
- **Supersede parcial**: comportamento de handoff em markdown da ADR-0005 (campos continuam valendo)

## Contexto
AGENTS.md listava 6 papéis mas nenhum era executável — sub-agents existiam só como descrição. Handoffs viviam em `memory/50-orchestration/handoffs/*.md`, sem validação de campos, sem fila, sem status. Resultado: ninguém "passava o bastão" — papéis colidiam ou ficavam ociosos.

## Decisão
1. **6 sub-agents Claude Code** em `.claude/agents/*.md` — orchestrator, context-engineer, sdd-architect, product, marketing, governance. Cada um com frontmatter `name`/`description`/`tools` e system prompt focado.
2. **Handoffs persistem em SQLite** (`universal.db.handoffs`), não em markdown. Campos da ADR-0005 (7) são validados em `scripts/agent-router.mjs append`.
3. **Roteamento explícito**: agent-router CLI grava, lista, marca status (open → in_progress → done). Sem broadcast, sem polling.
4. Markdown handoffs antigos em `memory/50-orchestration/handoffs/` ficam como histórico — não migrados.

## Alternativas consideradas
- **Manter handoff em markdown** — rejeitada: difícil de validar/consultar, status invisível
- **Fila externa (Redis/SQS)** — rejeitada: infra extra para repo de framework
- **Um único super-agent monolítico** — rejeitada: perde especialização e força do system-prompt focado

## Consequências
**Positivas**:
- Sub-agents Claude Code podem ser invocados via subagent_type explícito ou descobertos pela descrição
- Handoff é queryável (SQL): "todos os abertos para o sdd-architect"
- Validação de schema bloqueia handoff incompleto na origem

**Negativas**:
- Adiciona dependência soft de `better-sqlite3` para roteamento (já era devDependency)
- Outras IAs (Copilot/Gemini/Codex) não consomem os `.claude/agents/` — precisam adapter futuro

## Rastreamento
- `.claude/agents/`
- `scripts/agent-router.mjs`
- `AGENTS.md` (atualizado para apontar para sub-agents)
- SPEC-001 AC-4..AC-6
