# Spec: Instruções de agentes v4

- **ID**: SPEC-039
- **Status**: done
- **Owner**: apk
- **Criado em**: 2026-09-05

## Problema e escopo
Prompts e skills citavam comandos antigos, confundiam execução com aceite e prescreviam rotinas sem evidência. Atualizar as superfícies ativas e templates sem reescrever specs históricas. Corrigir o falso positivo do doctor para scripts npm do checkout.

## Critérios de aceite
- [x] AC-1: Seis prompts e agentes compartilham contrato de contexto, autorização e evidências.
- [x] AC-2: Skill de LLM possui frontmatter válido e é incluída no pacote.
- [x] AC-3: Templates SDD orientam evidência por critério; instruções nativas apontam o contrato.
- [x] AC-4: Doctor reconhece scripts reais; teste mantém rejeição de comandos inexistentes.

## Restrições
Não alegar disponibilidade de modelos, custos medidos ou aceite sem verificação. Não alterar semântica dos adapters LLM nesta revisão.

## Evidências
Em 2026-09-05: 473 testes passaram; types:check, build, tools:doctor e quick_validate da skill passaram. Publicação e CI são acompanhados após o commit; não constituem aceite editorial local.
