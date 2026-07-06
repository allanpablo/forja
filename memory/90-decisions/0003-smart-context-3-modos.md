# ADR-0003: Smart Context com 3 modos (global/domain/task)

- **Status**: accepted
- **Data**: 2026-05-02
- **Tags**: tokens, context, performance

## Contexto
Mandar `memory/**` inteiro para o modelo gasta tokens e dilui relevância. Por outro lado, contexto vazio força o agente a perguntar tudo. Precisamos de níveis intermediários.

## Decisão
`lib/context-builder.js` expõe 3 modos:

- **`global`**: arquivos de `00-global`, `10-product/vision.md`, `20-architecture/overview.md`. Para onboarding de agentes novos.
- **`domain`**: tudo de `30-domains/<dominio>/` + summaries relacionados. Para trabalho focado em um bounded-context.
- **`task`**: busca FTS5 dirigida por query + top-N arquivos rankeados. Para sprints/tasks específicas.

Cada modo tem cap de bytes em `.memoryrc.json` e cache LRU.

## Alternativas consideradas
- **1 só modo (everything-or-nothing)** — rejeitada: sem granularidade
- **Modo dinâmico baseado em prompt** — rejeitada nesta versão: latência de classificação, comportamento difícil de explicar. Pode evoluir para isso

## Consequências
**Positivas**: redução medida de 40-60% em tokens (`scripts/token-benchmark.mjs`), comportamento determinístico.
**Negativas**: agente precisa escolher o modo — mitigado por defaults sensatos (smart-context escolhe pelo contexto da invocação).

## Rastreamento
- `lib/context-builder.js`
- `scripts/build-smart-context.js`
- `scripts/token-benchmark.mjs`
- `.memoryrc.json` (chave `context.modes`)
