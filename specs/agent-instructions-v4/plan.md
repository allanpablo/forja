# Plan: Instruções de agentes v4

- **Spec**: ./spec.md
- **Status**: approved

Centralizar comportamento em docs/agent-operating-contract.md; manter procedimentos de papel nos prompts e agentes. Atualizar skill e templates. Incluir skills/ no tarball. Doctor deriva scripts válidos do package.json, assim como já deriva comandos de projetos gerados.

Validação: quick_validate da skill, testes health/harness/spec-cli, suíte completa, types:check, tools:doctor e gate do tarball após commit. Recuperação por revert do commit; sem migração de dados.
