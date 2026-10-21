# Plan: skills-do-projeto

- **Spec**: [spec.md](spec.md) (SPEC-051)
- **Status**: approved
- **Owner**: apk
- **Criado em**: 2026-10-21

## 1. Abordagem técnica
As skills vivem em `templates/project/skills/<nome>/SKILL.md` (cópia versionada do ledger em pt-BR, commit
`0097ed7`, com seções "No Forja"). O `wireProject` as instala em `.claude/skills/` (Claude) e
`.agents/skills/` (Codex) com a marca `forja:managed`; o `checkProjectWiring` valida frontmatter,
referências entre skills e os comandos `forja` que elas citam. O gerador deixa de emitir `skills/`.

## 2. Módulos afetados
- `templates/project/skills/` (novo), `templates/project/agents/*.md`, `templates/project/AGENTS.md`
- `lib/project-wiring.ts` (instalação + checks `skills-claude`/`skills-codex`)
- `lib/generators/memory-generator.ts`, `lib/validators/structure-validator.ts`, `lib/generators/readme-generator.ts`
- `lib/core/journey.ts`, `test/project-skills.test.js`

## 3. Diagrama de fluxo
`project:new` / `project:upgrade` / `project:wire` → `wireProject` → `.claude/skills/*`, `.agents/skills/*` → `project:wire --check`.

## 4. Contratos (API/CLI/Schema)
Sem comando novo. `project:wire --check --json` ganha os checks `skills-claude` e `skills-codex`.

## 5. Decisões e alternativas
- Instalar todas as skills, inclusive `ts-*`, em vez de filtrar por linguagem: filtrar deixaria referências quebradas (ADR-0089).
- Cópia versionada em vez de dependência do repositório do ledger em tempo de geração.

## 6. Dependências
Nenhuma dependência de pacote nova.

## 7. Rollout
Projetos novos recebem na geração; existentes via `forja project:upgrade --apply`.

## 8. Sinais de fracasso (kill criteria)
IAs não carregam as skills nos diretórios escolhidos; ou skills disparam em contexto errado com frequência.

## Evidências e estado real
- `npm test` 556/556; jornada com o passo `skills` (30 + 30).
