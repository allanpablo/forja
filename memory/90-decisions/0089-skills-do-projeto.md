# ADR-0089: Skills do projeto carregáveis pelas IAs, vindas do skill ledger

- **Status**: accepted
- **Data**: 2026-10-21
- **Autor(es)**: Allan Pablo / Claude
- **Tags**: generation, llm, skills, sdd

## Contexto

Todo projeto gerado recebia 9 "skills" de 5 a 10 linhas em `skills/` na raiz, sem frontmatter. O
Claude Code lê `.claude/skills/<nome>/SKILL.md`, o Codex lê `.agents/skills/`, e ambos exigem `name` e
`description` no frontmatter. Assim, nenhuma IA carregava essas skills, e os papéis do Forja não tinham
método escrito para seguir. Existia, fora do Forja, um catálogo pessoal de 29 skills completas (o
"skill ledger", convertido para TypeScript e traduzido para pt-BR) que cobre exatamente esses papéis.

## Decisão

1. **As 29 skills do ledger e a `llm-provider-routing` passam a ser as skills do projeto**, versionadas
   em `templates/project/skills/` (cópia do ledger no commit `0097ed7`). O `name` fica em inglês, porque
   é identificador, e o texto fica em pt-BR.
2. **Integração com o Forja em seção própria.** As skills que produzem artefatos ganham uma seção
   "No Forja" (ADR em `memory/90-decisions/`, requisitos em `specs/<slug>/spec.md`, prompt-spec como
   handoff ADR-0005, postmortem com `forja incident:record`, release com `### O que melhorou`). O resto
   da skill continua portável, e atualizar a partir do ledger é reaplicar só essa seção.
3. **Instalação onde cada IA procura:** `.claude/skills/` (Claude) e `.agents/skills/` (Codex), pelo
   `project:wire`, com a marca `forja:managed`. Uma skill editada pelo usuário (sem a marca) não é
   sobrescrita. O `project:wire --check` valida frontmatter, referências entre skills e os comandos
   `forja` que elas citam.
4. **Todas as skills são instaladas, inclusive as `ts-*`.** O que restringe o uso é a descrição, que a
   IA consulta para decidir quando carregar a skill.
5. As 9 skills de esboço e o `scripts/lib/skill-loader.mjs` deixam de ser gerados.

## Alternativas consideradas

- **Instalar as `ts-*` só em projetos TypeScript.** Rejeitada: `testing`, `prompt-spec` e
  `requirements-gathering` citam `ts-testing`/`ts-code-review` pelo nome, e omiti-las deixaria
  referências quebradas.
- **Ler as skills do repositório do ledger em tempo de geração.** Rejeitada: o gerador passaria a depender
  de um caminho externo e de rede; a cópia versionada é testada no CI e viaja no pacote.
- **Reescrever as skills do zero dentro do Forja.** Rejeitada: o ledger já é completo e revisado; a
  seção "No Forja" é o que falta.
- **Instalar também em `.gemini/skills/`.** Adiada: a descoberta por pasta do Gemini CLI não foi
  verificada nesta máquina. Hoje, o caminho é `gemini skills link <pasta>`.

## Consequências

- Projeto novo: de 0 para 30 skills carregáveis por IA conectada. Projetos existentes recebem as skills
  com `forja project:upgrade --apply`.
- A cópia pode divergir do ledger. Atualizar é um PR que copia as skills e reaplica as seções "No Forja".
- Skill nova que cite um comando `forja` inexistente reprova no `project:wire --check` e no teste
  `test/project-skills.test.js`.
