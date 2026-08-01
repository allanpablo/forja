# Handoff — capability registry

- **from**: worker
- **to**: architect
- **intent**: review
- **context**: `packages/core/src/index.ts`; `packages/core/package.json`; `test/capability-registry.test.js`; `memory/90-decisions/0036-forja-2-capability-registry.md`; `docs/architecture/FORJA-2.0-IMPACT-FOUNDATION.md`
- **acceptance**: registry registra definições versionadas; descobre por id e alias; filtra por permissões; valida entrada antes do handler; aplica Policy; suporta handler síncrono/assíncrono; retorna `ExecutionResult`; não importa framework ou persistência.
- **constraints**: não alterar CLI 1.x; manter contratos existentes; nenhum `any`; não adicionar dependência de runtime.
- **return**: revisar tipagem, política de depreciação, semântica de `ALLOW_WITH_LIMITS` e compatibilidade dos adapters antes de abrir a próxima tarefa.

## Evidências

- `npm run types:check`: passou.
- Testes focados de contracts + registry: passaram.
- `npm test`: 18 arquivos passaram; 5 arquivos legados falharam por `spawnSync ... EPERM` no ambiente sandbox, sem erro de assertion no núcleo novo.
