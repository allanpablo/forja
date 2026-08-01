# Sprint 9 — Extractors determinísticos do GraphLoop

## Objetivo

Ampliar a indexação incremental do GraphLoop para relações verificáveis em
fonte, Markdown, specs, ADRs, tarefas, handoffs, testes e manifests, sem LLM.

## Análise de impacto

- `packages/graph/src/index.ts`: amplia apenas o extractor existente e mantém
  `GraphMutation`, checksum e evidências.
- contratos não mudam; tipos de entidade e relações já existentes são usados.
- adapters SQLite não precisam de nova migração: recebem a mesma mutation.
- consumidores MCP/Context passam a enxergar mais relações após `apply`.

## Padrões cobertos

| Entrada | Relação | Evidência |
| --- | --- | --- |
| import/from/import() | `DEPENDS_ON` | linha da declaração |
| link Markdown | `DERIVED_FROM` | linha do link |
| export de símbolo | `DEFINES` | linha da declaração |
| `implements` | `IMPLEMENTS` | linha da declaração |
| chamada de função | `CALLS` | linha da chamada |
| `ADR-NNNN` | `DERIVED_FROM` | linha da referência |
| checkbox Markdown | `CONTAINS` | linha da tarefa |
| `**to**`/`**next agent**` | `ASSIGNED_TO` | linha do handoff |
| `describe`/`it`/`test` | `VALIDATES` | linha do teste |
| dependências do `package.json` | `DEPENDS_ON` | manifest |

## Critérios de aceite

1. Cada relação gerada possui evidência, origem e checksum da fonte.
2. Padrões existentes de import/link permanecem compatíveis.
3. JSON inválido não derruba a indexação; é responsabilidade do validator.
4. Dependências de manifest são nós `Technology`.
5. Relações não determinísticas não são inferidas por esta etapa.
6. Reaplicar a mesma mutation continua idempotente no GraphLoop.

## Limites

- chamadas são identificadas lexicalmente e podem incluir símbolos locais;
  keywords de controle e wrappers de teste são filtrados.
- não há resolução completa de escopo, overload ou alias de import.
- commits e diffs continuam aguardando um extractor Git dedicado.

## Evidências

- `packages/graph/src/index.ts`;
- `test/graph.test.js`;
- suíte de contratos do GraphLoop.
