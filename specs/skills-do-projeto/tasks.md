# Tasks: skills-do-projeto

- **Plan**: [plan.md](plan.md)
- **Status**: done

## T1 — Skills versionadas com seções "No Forja" (AC-3, AC-5)
- [x] 29 skills do ledger + `llm-provider-routing` em `templates/project/skills/`; 15 com "No Forja".
- Evidência: `test/project-skills.test.js`.

## T2 — Instalação e verificação no project:wire (AC-1, AC-2, AC-4)
- [x] `.claude/skills/` e `.agents/skills/`; marca `forja:managed`; checks `skills-claude`/`skills-codex`.
- Evidência: teste manual de idempotência e de skill editada preservada; `project:wire --check`.

## T3 — Gerador sem as skills de esboço (AC-5)
- [x] Removidas as 9 skills e o `skill-loader.mjs`; validador não exige `skills/`.

## T4 — Sub-agents e AGENTS.md (AC-6)
- [x] Seção "Skills" por papel; teste garante que as citadas existem.

## T5 — Jornada e upgrade (AC-7)
- [x] Passo `skills` na jornada; `project:upgrade` instala via `wireProject`.

## Handoffs entre agentes
Nenhum.

## Evidências e estado real
- `npm test` 556/556.
