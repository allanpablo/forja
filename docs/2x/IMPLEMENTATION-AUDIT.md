# ForjaJS 2.x — Implementation audit

Auditoria realizada em 2026-08-02 sobre o código executável e os testes do repositório. “Existe” só foi marcado quando há implementação; “produção” só quando a composição oficial ou o caminho CLI é exercitado.

| Componente | Existe | Integrado | Persistente | Testado | Produção |
| --- | ---: | ---: | ---: | ---: | ---: |
| Contratos versionados | sim | sim | n/a | sim | sim |
| Capability Registry | sim | sim | n/a | sim | sim |
| CLI adapter | sim | sim | n/a | sim | sim |
| Runtime | sim | sim | sim | sim | sim |
| Policy/approvals | sim | sim | sim | sim | sim |
| Sprint/Task/Handoff | sim | sim | sim | sim | sim |
| Context Engine | sim | sim | sim | sim | sim |
| GraphLoop | sim | sim | sim | sim | sim |
| Sandbox Git worktree | sim | sim | sessão | sim | sim |
| Sandbox rollback | sim | sim | sessão | sim | sim |
| Validator | sim | sim | n/a | sim | sim |
| Event Bus/Scheduler | sim | sim | sim | sim | sim |
| MCP stdio | sim | sim | n/a | sim | sim |
| SDK | sim | sim | n/a | sim | sim |
| Nest adapter/control plane | sim | sim | sim | sim | sim |
| Dashboard | sim | sim | via API | sim | parcial |
| Observability/Evals | sim | sim | sim | sim | sim |
| Plugin SDK | sim | sim | n/a | sim | sim |
| GitHub/Docker official boundaries | sim | não há handler externo | n/a | sim | boundary |

## Evidências executadas

- `npm run demo:autonomy`: fixture externa, worktree Git, alteração real, `npm test`, diff, promoção, SQLite, GraphLoop e handoff.
- `test/mcp-stdio.test.js`: transporte JSON-RPC por processo filho, stdout limpo, tools/resources e shutdown.
- `test/server-persistence.test.js`: composição oficial SQLite, encerramento/recriação e recuperação de runtime, approval, contexto, grafo, evento e observação.
- `test/sandbox.test.js` e `test/adapter-git.test.js`: promoção e rollback explícitos.
- `test/context-benchmark.test.js`: benchmark determinístico; execução observada nesta árvore: baseline 214.549 tokens estimados, contexto selecionado 9.175, redução 95,72%, cache hit 1 e cobertura de evidência 1.
- `npm test -- --test-concurrency=1`: 300/300 aprovados.
- `npm run build`: aprovado.
- `git diff --check`: aprovado.

## Limites honestos

Os plugins oficiais são boundaries permissionados, não clientes GitHub/Docker completos. O dashboard é superfície de supervisão e não foi usado como dependência do fluxo CLI-first. A estimativa de tokens é um proxy determinístico bytes/4, não telemetria de um provedor de modelo. Essas limitações impedem afirmar que todos os cenários externos são 10/10; o fluxo local-first comprovado está fechado.
