# Tasks: Integrações LLM

- **Spec**: ./spec.md
- **Plan**: ./plan.md
- **Status**: done
- **Criado em**: 2026-09-05

## T1 — Contexto e perfis

- **Owner**: Codex
- **Paths**: lib/llm/context.ts, packages/llm/src/index.ts
- [x] Incluir contextos reais e validar campos opcionais.

## T2 — Protocolo Codex e evidências

- **Owner**: Codex
- **Depende de**: T1
- **Paths**: lib/llm/codex-output.ts, scripts/llm-fit.ts
- [x] Normalizar eventos e falhas; distinguir estimativa, execução e validação.
- [x] Verificar compatibilidade de flags no doctor.

## T3 — Verificação e documentação

- **Owner**: Codex
- **Depende de**: T2
- **Paths**: test/, docs/llm-fit-loop.md
- [x] Fixtures sem rede, regressões, tipos, build e gates do Forja.
- [x] Documentar exemplo GPT-6 e limitações; registrar handoff de review.
