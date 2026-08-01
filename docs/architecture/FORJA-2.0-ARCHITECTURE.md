# ForjaJS 2.0 — Arquitetura de referência

## Direção de dependência

```text
interfaces externas (CLI, REST/SSE, MCP, SDK, dashboard)
                 ↓
adapters (Nest, SQLite, Git, transporte, filesystem)
                 ↓
application layer (casos de uso, comandos, queries, políticas)
                 ↓
domain core (contratos, invariantes, estados, eventos)
```

`packages/core`, `contracts`, `policy`, `runtime`, `graph`, `context`, `planner`, `validator`,
`orchestration` e `events` não importam NestJS, Next.js, Express, Fastify, React ou drivers de
persistência. Portas são interfaces TypeScript; adapters fazem o binding.

## Containers

```mermaid
flowchart LR
  CLI[apps/cli] --> APP[Application services]
  API[apps/server / NestJS] --> ADP[adapter-nest]
  MCP[packages/mcp] --> APP
  SDK[packages/sdk] --> API
  ADP --> APP
  APP --> CORE[Domain packages]
  ADP --> SQL[adapter-sqlite]
  ADP --> GIT[adapter-git]
  WORKER[apps/worker] --> APP
  DASH[apps/dashboard / Next.js] --> API
```

## Componentes e persistência

SQLite é a persistência local padrão para memória, eventos, runs, handoffs e checkpoints.
Filesystem e Git worktree são usados para artefatos e sandbox. Cada porta de persistência deve
permitir uma implementação substituível; nenhuma entidade conhece SQL.

## Capability e execução

```mermaid
sequenceDiagram
  participant I as Interface
  participant R as Registry
  participant P as Policy
  participant A as Application
  participant H as Handler
  participant V as Validator
  I->>R: discover/describe/execute
  R->>R: validate input + version
  R->>P: authorize identity, risk, scope, budget
  P-->>R: ALLOW / LIMITS / APPROVAL / DENY
  R->>A: execute application command
  A->>H: invoke port/handler
  H-->>A: structured result + evidence
  A->>V: validate outcome
  V-->>I: ExecutionResult + audit references
```

## Autonomia e GraphLoop

```mermaid
flowchart TD
  O[observe] --> R[retrieve context/evidence]
  R --> P[plan deterministically first]
  P --> A[authorize by Policy Engine]
  A --> X[execute in sandbox]
  X --> V[validate independently]
  V --> M[remember evidence/events]
  M --> O
  M --> G[GraphLoop incremental update]
```

GraphLoop mantém nós, arestas, evidências, validade temporal e status (`verified`, `inferred`,
`hypothesis`, `contradicted`, `unknown`). CodeGraph continua sendo a análise de código do 1.x;
GraphLoop pode consumir seus resultados, mas não o substitui.

## Processos e falhas

O modo padrão é processo separado para worker e server, com SQLite local e jobs persistidos.
Execuções curtas podem ser síncronas; tarefas longas usam scheduler/worker e checkpoint. REST +
SSE são a interface oficial inicial. WebSocket fica adiado até existir requisito verificável.
Retries têm limite e chave idempotente; eventos têm log append-only, consumer offsets e dead
letter. Cancelamento e retomada são estados explícitos.

## Fluxos de domínio

```mermaid
flowchart LR
  S[Sprint] --> T[Task]
  T --> H[Handoff]
  H --> R[Runtime run]
  R --> C[Checkpoint]
  R --> V[Validator]
  V --> E[Evidence + events]
  E --> S
```

Dashboard exibe e solicita comandos; não contém regras de autorização, GraphLoop ou execução.
Plugins só recebem capabilities e eventos declarados em manifesto permissionado.

## Migração e empacotamento

O repositório atual permanece publicável como 1.x enquanto `apps/` e `packages/` são introduzidos
de forma aditiva. A CLI existente roteia para o novo núcleo por capability quando houver
equivalente; comandos sem equivalente continuam no caminho legado. Migrações criam backup,
validam antes de promover e não removem dados por padrão.
