# Spec: skills-do-projeto

- **ID**: SPEC-051
- **Status**: done
- **Owner**: apk
- **Criado em**: 2026-10-21
- **Sprint alvo**: 5.1
- **ADRs relacionadas**: [ADR-0086](../../memory/90-decisions/0086-projeto-conectado-e-jornada-como-gate.md) (projeto conectado), ADR-0089 (esta feature)

## 1. Problema
Todo projeto gerado recebe 9 "skills" de 5 a 10 linhas em `skills/` na raiz, sem frontmatter.
Nenhuma IA as carrega: o Claude Code lê `.claude/skills/<nome>/SKILL.md`, o Codex lê
`.agents/skills/`, e ambos exigem `name`/`description` no frontmatter. Na prática o Forja não
entrega skills; os papéis (product, sdd-architect, governance…) não têm um método escrito para
seguir. Medição hoje: 0 skills carregáveis por projeto.

## 2. Proposta de valor
Todo projeto passa a ter as 29 skills do ledger (pt-BR), carregáveis pelas IAs, ligadas aos papéis
e aos artefatos do Forja (specs, ADRs, handoffs, incidentes), e verificadas pelo `project:wire --check`.

## 3. User stories
- **Como** dev usando Claude Code ou Codex num projeto Forja, **quero** que a IA encontre sozinha a
  skill certa (requisitos, modelagem, ADR, code review…), **para que** o método seja seguido sem eu colar prompts.
- **Como** sdd-architect, **quero** que `architecture-decision-record` grave no formato do Forja
  (`memory/90-decisions/`, `forja adr:list`), **para que** a skill e o processo não divirjam.
- **Como** dono de um projeto em Python, **quero** que as skills de TypeScript só sejam usadas em
  código TS/JS, **para que** a IA não aplique idiomas da linguagem errada.

## 4. Critérios de aceite (Definition of Done)
- [ ] AC-1: `project:new` instala as skills em `.claude/skills/<nome>/SKILL.md` (Claude) e em `.agents/skills/<nome>/SKILL.md` (Codex), com frontmatter válido e `name` igual à pasta.
- [ ] AC-2: todas as skills são instaladas, inclusive as `ts-*`: outras skills as citam pelo nome (`testing` → `ts-testing`), e omiti-las deixaria referências quebradas. O que restringe o uso é a descrição ("TypeScript ou JavaScript"), que é o que a IA usa para decidir quando carregar a skill.
- [ ] AC-3: as skills que produzem artefatos do Forja trazem uma seção "No Forja" com o destino e o comando (ADR → `memory/90-decisions/`; requisitos/backlog → `specs/<slug>/`; prompt-spec → handoff ADR-0005; postmortem → `forja incident:record`; release-notes → `### O que melhorou`).
- [ ] AC-4: `project:wire --check` tem um check `skills` que falha com skill ausente, frontmatter inválido ou referência a skill inexistente; `wire` é idempotente e não sobrescreve skill editada pelo usuário (sem a marca `forja:managed`).
- [ ] AC-5: as 9 skills de esboço deixam de ser geradas; `llm-provider-routing` vira skill com frontmatter.
- [ ] AC-6: cada sub-agent de `.claude/agents/` lista as skills do seu papel.
- [ ] AC-7: a jornada (`lib/core/journey.ts`) verifica as skills instaladas no pacote instalado; `project:upgrade` as traz para projetos existentes.

## 5. Escopo
**Dentro**:
- 29 skills do ledger + `llm-provider-routing`, com seções "No Forja".
- Instalação/verificação no `project:wire`; remoção das skills de esboço do gerador.

**Fora** (explícito, evita scope creep):
- Sincronização automática com o repositório do ledger (cópia versionada no Forja; atualizar é um PR).
- Diretório de skills do Gemini CLI (descoberta por pasta não verificada; uso via `gemini skills link`).
- Skills para o próprio repositório do framework.

## 6. NFRs / restrições
- Compatibilidade: projetos existentes recebem as skills só via `project:upgrade --apply`; nada é sobrescrito sem a marca.
- Idioma: pt-BR; `name` em inglês (identificador).

## 7. Riscos e mitigação
| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Skill ensina comando do Forja que não existe | M | A | check `commands` do wire já cobre todo `forja <cmd>` citado; skills entram nos textos verificados |
| Divergência entre a cópia do Forja e o ledger | A | M | cópia versionada; seção "No Forja" separada facilita reaplicar |
| Skills demais poluem o contexto | B | M | as IAs carregam só nome+descrição até a skill ser usada |

## 8. Métricas de sucesso
Projeto novo: 0 → 30 skills carregáveis. `project:wire --check` verde.

## Evidências e estado real
- AC-1..AC-7: ver tasks.md e os testes `test/project-skills.test.js` e `test/journey.test.js`.
