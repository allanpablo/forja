# Handoff — planner and validator

- **from**: planner-validator
- **to**: orchestration-engineer
- **intent**: implement
- **context**: `packages/planner/src/index.ts`; `packages/validator/src/index.ts`; `packages/contracts/src/index.ts`; `packages/graph/src/index.ts`; `memory/90-decisions/0042-forja-2-planner-validator-independentes.md`; `docs/architecture/FORJA-2.0-IMPACT-FOUNDATION.md`
- **acceptance**: Sprint, Task e Handoff devem ser entidades persistidas por porta; ter estados, orçamento, critérios, dependências, retomada e compactação; rejeitar handoff incompleto; atualizar GraphLoop com evidência.
- **constraints**: domínio sem NestJS/Next/SQLite; não usar transcrição completa como handoff; não concluir sprint/task sem Validator; preservar contratos versionados e trilha auditável.
- **return**: devolver engines, portas de persistência, testes de retomada/compactação/escopo e próximo handoff para Policy/Sandbox ou adapters.

## Evidências

- `npm run types:check`: passou.
- `node test/planner-validator.test.js`: 6 testes passaram.
- Cenários: orçamento dividido, dependências do grafo, checks ausentes, escopo, contradições,
  critérios incompletos, blockers e segurança grave.
