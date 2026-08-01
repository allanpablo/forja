# Análise de impacto — Fundação ForjaJS 2.0

- **Data**: 2026-07-31
- **Escopo**: visão, arquitetura, contratos públicos e typecheck
- **Base**: ForjaJS 1.7.3, ADR-0003, ADR-0005, ADR-0019, ADR-0020, ADR-0027

## Contratos afetados

| Área | Impacto atual | Decisão nesta fatia |
| --- | --- | --- |
| CLI 1.x | Nenhuma API alterada | Mantida como caminho legado |
| Workspace | Nenhuma alteração de resolução | Mantido conforme ADR-0019 |
| Memória SQLite | Nenhuma migração | Adapter fica para fase posterior |
| Handoffs | Nenhuma alteração no router | Contrato 2.0 é aditivo |
| TypeScript | Novo escopo `packages/**/*` | Typecheck do domínio entra no gate |
| Publicação npm | Pacotes 2.0 ainda não publicados | Empacotamento será tratado com monorepo |

## Dependências e blast radius

O único arquivo existente alterado é `tsconfig.json`, adicionando o diretório de pacotes ao
typecheck. `lib/`, `scripts/`, `bin/`, registry e CLI não foram alterados. Os novos contratos não
importam código existente nem dependências externas; portanto não há ciclo ou efeito runtime na
CLI 1.x.

## Hipóteses

- Node 20+ continuará sendo o runtime mínimo do pacote publicado; desenvolvimento pode usar o
  suporte nativo a TypeScript já adotado pelo projeto.
- `packages/contracts` será a fonte canônica antes de schemas serem derivados para MCP/REST.
- A escolha de biblioteca de schema (ou implementação própria) permanece aberta; esta fatia usa
  validação determinística mínima sem introduzir dependência.
- IDs continuarão sendo strings opacas no transporte, representadas por brands no TypeScript.

## Informações ausentes

- estratégia final de workspace/package manager;
- formato de persistência e migrações 2.0;
- protocolo exato de execução de handlers;
- biblioteca de schema runtime e biblioteca de testes de integração;
- política de compatibilidade semântica entre versões de contrato;
- requisitos de autenticação local do server.

## Riscos

- Os contratos ainda não cobrem invariantes de cada bounded context.
- `unknown` em payloads é intencional nesta etapa, mas cada capability deverá fornecer schema
  específico antes de execução.
- A existência de apenas dois ADRs 2.0 não fecha a governança completa; ADRs de runtime, policy,
  GraphLoop, sandbox, eventos, adapters e UI ainda precisam ser aprovadas.

## Atualização da unidade Registry (2026-07-31)

`packages/core` foi criado com registry em memória, aliases, descoberta filtrada por agente,
validação de input antes do handler, autorização por uma porta de Policy Engine, suporte a
handlers síncronos/assíncronos e `ExecutionResult` normalizado. Não há persistência nem adapter.

## Atualização da unidade Policy (2026-07-31)

`packages/policy` foi criado com default deny, regras por agente, papel, capability, projeto,
ambiente, risco, categoria e prefixo de arquivo; precedência determinística; limites; exigência
de aprovação para risco crítico; e ledger de aprovações em memória. A fronteira Registry → Policy
foi testada sem acoplamento de pacote: o contexto de execução é transportado por uma porta comum.

O ledger não é persistente nesta etapa. O adapter SQLite e a auditoria durável ficam para o
Runtime Controlado.

## Atualização da unidade Runtime (2026-07-31)

`packages/runtime` foi criado com planner, validator, checkpoint store e memory writer como
portas. O motor controla estados, limites de passos/tokens/arquivos/tempo/retries, execução
sequencial (`maxParallel=1` nesta primeira implementação), pausa, retomada, cancelamento e
validação independente. O estado é em memória; a persistência durável permanece pendente.

## Atualização das unidades Events/Scheduler (2026-07-31)

`packages/events` fornece log append-only por porta, sequência por aggregate, deduplicação por
idempotency key, consumidores com retry e dead-letter. `packages/scheduler` fornece one-shot,
cron UTC de cinco campos, condição, evento, cancelamento, retries, idempotência por slot e limite
de concorrência. As implementações atuais são determinísticas e em memória; `adapter-sqlite` e a
integração de relógio/eventos ficam para a camada de adapters.

## Atualização da unidade Context (2026-07-31)

`packages/context` consulta memória e GraphLoop por portas, descarta evidência obsoleta ou
contradita, ordena por relevância, deduplica por checksum, limita itens e tokens, mantém cache
por checksum e permite expansão sob demanda. `ContextPackage` agora expõe métricas de candidatos,
seleção, deduplicação, cache, tokens usados e tokens não utilizados. Não há busca SQL, diff ou LLM
dentro do Engine.

## Atualização da unidade GraphLoop (2026-07-31)

`packages/graph` fornece nós, arestas, evidências, status, validade temporal, upsert idempotente,
paths, impacto, contradições, agenda e sincronização incremental por checksum de fonte. Arestas
sem endpoints ou evidência são rejeitadas. Imports e links Markdown são extraídos deterministicamente;
CodeGraph continua separado e pode alimentar mutations por adapter. O store atual é em memória.

## Atualização das unidades Planner/Validator (2026-07-31)

`packages/planner` produz planos determinísticos com três etapas mínimas, dependências do grafo,
evidências de contexto, risco, critérios e orçamento dividido. `packages/validator` verifica
checks obrigatórios, escopo de arquivos, critérios de aceitação, contradições, blockers e achados
de segurança, retornando `accepted`, `rejected`, `inconclusive` ou `blocked`. Nenhum dos dois
executa comandos ou depende do implementador.

## Próxima unidade verificável

Criar `packages/orchestration` para Sprint, Task e Handoff, com persistência por porta, estados,
orçamento, retomada, compactação e atualização do GraphLoop.

## Atualização da unidade Orchestration (2026-07-31)

`packages/orchestration` implementa `SprintEngine`, `TaskEngine` e `HandoffEngine` sobre a porta
`OrchestrationStore`. A implementação de referência é em memória e não conhece SQLite, NestJS ou
Next.js. Tasks só avançam quando as dependências estão concluídas; conclusões de Task e Sprint
exigem um `CompletionValidator` independente retornando `accepted`. Handoffs exigem objetivo,
aceite e evidências, removem itens duplicados e rejeitam seções acima dos limites definidos.
`GraphRecorder` registra Sprint, Task e Handoff com relações e evidências, deixando a persistência
do GraphLoop para o adapter apropriado.

O contrato de Sprint passou a explicitar `risks`, `taskIds` e `evidenceIds`; Task passou a
explicitar `evidenceIds`. A alteração é aditiva e permanece compatível com a direção de
dependências do domínio.

## Atualização da unidade Sandbox (2026-07-31)

`packages/sandbox` fornece `SandboxEngine` com ciclo explícito `create → prepare → execute →
validate → diff → promote/reject → destroy`. O engine depende de `SandboxStore` e
`SandboxBackend`; não executa subprocessos, não acessa filesystem e não importa Git. Promoção
exige validação aceita e um diff pertencente à mesma sessão. Falhas de execução levam a estado
`failed`, e destruição é registrada como estado terminal.

`packages/adapter-git` implementa o backend inicial por `CommandRunner` e `PatchApplier`. O
adapter traduz worktree, status, execução, `git diff --check`, diff numstat/name-only, aplicação
de patch e remoção de worktree. O adapter não é chamado diretamente pelo domínio e não foi
executado contra o repositório durante os testes; seus comandos foram verificados com runner
determinístico.

## Atualização da unidade Adapter SQLite (2026-07-31)

`packages/adapter-sqlite` fornece `SqliteConnection`, `SqliteMigrationRunner` e repositórios para
Orchestration, Sandbox, Checkpoint, Runtime Run, Event Bus e Auditoria. A migração inicial cria
tabelas de registros JSON, eventos append-only, auditoria e controle de versão. Migrações já
aplicadas são ignoradas por versão; eventos usam chave de idempotência no SQLite. O adapter não
é importado pelo domínio e não escolhe o driver: `better-sqlite3` pode ser ligado na composição
externa por duck typing da conexão.

## Atualização da unidade MCP (2026-07-31)

`packages/mcp` implementa `McpServer` como adaptador fino. As ferramentas delegam para Registry,
Context, GraphLoop, Memory, Task, Handoff e portas de validação/testes; não duplicam regras de
negócio. A identidade do agente é transportada nas operações de Registry e Policy é aplicada ao
handoff por `McpPolicy`. Erros são normalizados em resultados estruturados com código, mensagem e
`isError`.

O servidor anuncia os sete URIs oficiais de recursos; dados são fornecidos por providers externos.
Quando um provider não existe, o recurso informa explicitamente indisponibilidade. Nenhum dado de
workspace é inventado pelo adapter.

## Atualização da unidade Backend Nest (2026-07-31)

`packages/adapter-nest` fornece a fronteira HTTP verificável: rotas REST para health, capabilities,
contexto, GraphLoop, tasks, handoffs e MCP; correlation IDs; erros HTTP normalizados; SSE por
`EventStream`; autenticação local por porta; e documento OpenAPI 3.1. `apps/server` compõe essa
fronteira em `ForjaServerApplication` e expõe os módulos oficiais.

NestJS agora está instalado no workspace. `apps/server/src/app.module.ts`,
`forja-nest.module.ts` e `main.ts` fornecem o módulo dinâmico, controller, guard local, SSE e
Swagger reais. Como decorators não são executados pelo Node strip-only, o gate do bootstrap é
`npm run build` seguido de smoke test sobre `dist`; os testes nativos continuam cobrindo o adapter
sem exigir compilação prévia. Nenhuma regra de domínio foi colocada nessa composição.

## Atualização da unidade SDK (2026-07-31)

`packages/sdk` fornece `ForjaSdk` sobre a porta `SdkTransport`, sem importar NestJS, Express ou
um cliente HTTP concreto. A superfície cobre descoberta e execução de capabilities, contexto,
GraphLoop, próxima task, Sprint/Task/Handoff, runtime, approvals, métricas e subscription de
eventos. O SDK preserva headers de autenticação/correlation, serializa queries e transforma
respostas HTTP não-2xx em `SdkError` com status e corpo.

Rotas ainda não expostas pelo controller atual (runtime, approvals, métricas e criação de
Sprint/Task) permanecem contratos de cliente para a próxima fatia do Control Plane; não foram
tratadas como implementadas apenas por existirem no SDK.

## Atualização da unidade Observability/Control Plane (2026-07-31)

`packages/observability` registra observações por trace, run, agente, task, sprint e capability,
incluindo hashes de entrada, refs de contexto, tokens, duração, custo, ferramentas, arquivos,
comandos, validação, outcome e erro. `ControlPlane` calcula métricas de sucesso, bloqueio,
tokens, duração, custo e cobertura de evidência.

`packages/adapter-sqlite` agora fornece `SqliteObservationStore`. `packages/adapter-nest` expõe
`/api/control-plane/metrics` e `/api/observability/observations` por `ControlPlanePort`; a
agregação continua fora do controller. Runtime, approvals e CRUD de Sprint/Task ainda exigem
serviços de aplicação específicos.

## Atualização da unidade Control Plane operacional (2026-07-31)

`ControlPlaneServices` agora define portas explícitas para Runtime, Sprint, Task, Handoff e
Approvals. `apps/server/src/main.ts` compõe as engines reais de Sprint/Task/Handoff e
`ApprovalLedger`, e `packages/adapter-nest` expõe as rotas de criação/transição/decisão. Eventos
de observação são convertidos para `InMemoryEventStream` e chegam ao endpoint SSE.

Runtime possui rotas e portas, mas continua sem composição padrão no bootstrap porque exige um
planner, validator e policy executáveis. Um runtime sem capabilities planejadas ou sem validação
independente seria uma falsa conclusão e permanece bloqueado por decisão arquitetural.

## Atualização da unidade Runtime Control Plane (2026-07-31)

`DefaultRuntimeApplication` agora compõe `RuntimeEngine` com planner determinístico baseado em
etapas explícitas da requisição, validator independente que exige sucesso e evidência em todas as
etapas, `PolicyEngine` read-only/local e transporte de categorias, arquivos, ambiente e budget
para o Registry. Runtime expõe start/get/execute/pause/resume/cancel pelo Control Plane.

O smoke test executou uma capability `read` em sandbox lógico, terminou `completed/accepted` e
gerou duas observações de Control Plane. Escritas continuam bloqueadas pela política padrão.

## Atualização da unidade Evaluation Engine e Plugin SDK (2026-07-31)

`packages/evals` consome observações do Control Plane e produz `EvaluationReport` versionado com
taxa de sucesso, retrabalho/cache, tokens por task, etapas sem atividade, ausência de evidência,
rollback, uso de contexto, tokens e custo. A avaliação não chama LLM e mantém os IDs das
observações no relatório.

`packages/plugin-sdk` define manifesto com permissões, capabilities, eventos, migrations,
extensões e compatibilidade. `PluginRegistry` rejeita IDs duplicados e entrega um contexto com
checagem de permissão por operação. O SDK não concede acesso direto a filesystem, processo ou
persistência; dashboard e migrations permanecem metadados até suas políticas de host existirem.

## Atualização da unidade Worker e Dashboard boundary (2026-07-31)

`apps/worker` compõe Event Bus, Scheduler, ObservationStore/Recorder e Evaluation Engine para
permitir processamento assíncrono determinístico. O worker não recebe executor de capability por
fora do Runtime/Policy.

`apps/dashboard` fornece o view model operacional mínimo: snapshot de métricas/observações e ações
de pausa, cancelamento e aprovação delegadas ao Control Plane. A casca Next.js/React, Query e SSE
remoto ainda é pendência explícita; nenhum componente visual foi inventado como se já existisse.

## Atualização da unidade Dashboard Next.js (2026-07-31)

`apps/dashboard` agora possui distribuição Next.js/React com App Router, layout, Overview, métricas,
observações recentes, atualização manual e revalidação por SSE. A tela usa REST para obter o estado
do Control Plane e não importa persistência, Policy, Runtime ou GraphLoop.

O build usa `outputFileTracingRoot` na raiz do monorepo e passou em produção. Autenticação de
usuário, TanStack Query, filtros/inspeção visual do GraphLoop e comandos de aprovação ainda são
incrementos pendentes; o dashboard não é considerado completo por esta casca inicial.

## Atualização da unidade Dashboard proxy/auth/query (2026-08-01)

O dashboard agora usa TanStack Query para cache e invalidação do snapshot. Um Route Handler
server-side encaminha somente endpoints allowlisted ao backend; `FORJA_AUTH_TOKEN` não é exposto ao
cliente. SSE apenas invalida o cache remoto.

`createBearerAuthenticator` foi centralizado no adapter Nest com comparação constante e o bootstrap
usa `FORJA_AUTH_TOKEN` quando definido. O modo sem token continua local/offline, mas implantação
operacional deve configurar autenticação. A suíte passou serialmente; testes paralelos que alteram
PATH/processos continuam sujeitos a interferência ambiental.

## Atualização da unidade GraphLoop e Approvals no dashboard (2026-08-01)

O adapter Nest agora expõe listagem de approvals e o bootstrap conecta a lista do `ApprovalLedger`.
O GraphLoop padrão é composto no MCP do servidor, permitindo consulta de nós e impacto sem LLM.

O dashboard renderiza os nós retornados, seus status, impacto sob demanda e a fila de approvals.
Decisões de aprovação permanecem fora desta tela até haver identidade/aprovador configurado;
nenhuma relação ou decisão é sintetizada no cliente.

## Atualização da unidade Approval server-side (2026-08-01)

O dashboard agora permite aprovar/rejeitar somente quando `FORJA_APPROVER_ID` está configurado no
servidor. O browser envia apenas a decisão; o proxy valida o enum, injeta identidade e timestamp e
encaminha ao `ApprovalLedger`. Configuração ausente não gera fallback permissivo.
