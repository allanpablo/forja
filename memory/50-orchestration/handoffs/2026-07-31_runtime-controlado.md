# Handoff — runtime controlado

- **from**: runtime-engineer
- **to**: architect
- **intent**: review
- **context**: `packages/runtime/src/index.ts`; `packages/contracts/src/index.ts`; `packages/core/src/index.ts`; `packages/policy/src/index.ts`; `memory/90-decisions/0038-forja-2-runtime-controlado.md`; `docs/architecture/FORJA-2.0-IMPACT-FOUNDATION.md`
- **acceptance**: run tem estado, orçamento, métricas, erros e evidências; planner e validator são portas; Policy é consumida por capability; limites bloqueiam; checkpoint ocorre em boundaries; pausa/retomada/cancelamento funcionam; validator rejeita falsa conclusão.
- **constraints**: sem NestJS/Next/SQLite; execução inicial sequencial; nenhum bypass de Policy; persistência fica atrás de `CheckpointStore`/`RuntimeMemory`; manter CLI 1.x intacta.
- **return**: revisar invariantes de transição, persistência dos checkpoints, semântica de aprovação na retomada e seguir para Scheduler/Event Bus.

## Evidências

- `npm run types:check`: passou.
- `node --test test/runtime.test.js`: 6 testes passaram.
- Cenários cobertos: sucesso, checkpoint, pausa/retomada, default deny, orçamento, retry e validator rejeitando conclusão.
