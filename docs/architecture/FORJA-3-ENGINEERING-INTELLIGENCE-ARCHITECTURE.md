# ForjaJS 3.0 — Engineering Intelligence / Engineering Twin — Architecture

- **Status**: draft — primeira entrega (auditoria + arquitetura proposta), sem implementação
- **Autor**: apk (com assistência do Forja Engineer via Claude)
- **Criado em**: 2026-09-01
- **ADR principal**: [ADR-0078](../../memory/90-decisions/0078-forjajs-3-engineering-control-plane.md)
- **Spec master**: [SPEC-031 — Engineering Intelligence](../../specs/engineering-intelligence/spec.md)

> Este documento é o produto da "primeira entrega" pedida antes de qualquer código: auditoria do
> estado atual, gap analysis, arquitetura proposta e plano de sprints. Nenhuma das 33 features
> listadas na visão original foi implementada a partir deste documento — ele existe para decidir
> **o que construir e em que ordem**, não para documentar o que já foi construído.

---

## 1. Current State — o que a Forja já é

A Forja 2.0 já é, hoje, uma plataforma real (não um protótipo) com os seguintes componentes
verificados em código, não em documentação:

| Pacote | O que já faz | Linhas (aprox.) |
|---|---|---|
| `packages/contracts` | Contratos versionados (`CONTRACT_VERSION = '2.0'`), `KnowledgeStatus`, `PolicyEffect`, `ExecutionState`, `SandboxState`, `GraphNode`/`GraphEdge`/`Evidence`, `RuntimeRun`, `ApprovalRequest`, `Sprint`/`Task`/`Handoff`, `Observation`, `ControlPlaneMetrics`, `EvaluationReport`, e (desde a auditoria de 2026-08-31) `isPathWithinRoot` | ~145 |
| `packages/graph` | **GraphLoop**: nós/arestas com `status: verified\|inferred\|hypothesis\|contradicted\|unknown`, validade temporal (`validFrom`/`validTo`), evidência ligada a aresta, `path()`/`impact()`/`contradictions()`/`agenda()`/`contextRecords()`. `GraphIndexer.sync()` é idempotente por checksum de fonte. `extractDeterministicRelations()` extrai `DEPENDS_ON`/`CALLS`/`IMPLEMENTS`/`DERIVED_FROM` (ADR)/`CONTAINS` (task)/`ASSIGNED_TO` (agent)/`VALIDATES` (test) por regex determinístico — **sem LLM**. Desde a auditoria, `status: 'verified'` só é aceito de fontes de evidência confiáveis (allowlist configurável) | ~410 |
| `packages/policy` | `PolicyEngine`: regras com `scope` (agente/role/capability/projeto/ambiente/risco/categoria/`pathPrefixes`), efeitos `ALLOW\|ALLOW_WITH_LIMITS\|REQUIRE_APPROVAL\|DENY`, `limits` (`maxTokens`/`maxFiles`/`maxDurationMs`/`maxRetries`, agora **aplicados de verdade**, não só computados), `ApprovalLedger` com resolução por `correlationId` (aprovar uma vez resolve o retry, não fica pedindo pra sempre) | ~230 |
| `packages/core` | `CapabilityRegistry`: registro de capabilities com `definition` (risco, side effects, permissões, timeout, retry), `execute()` chama `policy.authorize()` antes do handler, aplica `decision.limits` | ~240 |
| `packages/runtime` | `RuntimeEngine`: máquina de estados (`created→planning→running→awaiting_approval→validating→completed\|blocked\|failed`), checkpoint/retomada via SQLite, limites globais (`maxSteps`/`maxTokens`/`maxFiles`/`maxDurationMs`/`maxRetries`) | ~345 |
| `packages/validator` | `DeterministicValidator`: agrega checks/critérios de aceite, computa `scope` automaticamente contra `allowedFiles` do plano, **exige evidência para qualquer "passed"** (desde a auditoria) | ~95 |
| `packages/orchestration` | `SprintEngine`/`TaskEngine`/`HandoffEngine`: sprint→task→handoff com 7 campos obrigatórios (ADR-0005), guarda de concorrência otimista, teto de handoffs por `correlationId` | ~265 |
| `packages/sandbox` | `SandboxEngine`: máquina de estados `created→prepared→executing→validating→ready_to_promote→promoted\|rejected\|rolled_back→destroyed`. Desde hoje, `runSandboxedCapability()` empacota o ciclo completo em uma chamada reutilizável | ~220 |
| `packages/adapter-git` | `GitWorktreeBackend` (isolamento real via `git worktree`), `GitPatchApplier`, `SpawnCommandRunner` sem herdar env por padrão | ~150 |
| `packages/adapter-sqlite` | Stores SQLite para cada engine acima — memória, aprovações, sandbox, runtime, orquestração, auditoria, observações, grafo | ~300 |
| `packages/adapter-nest` | Adapter HTTP local (`ForjaNestAdapter`), autenticação **fail-closed a loopback** quando sem token (desde a auditoria) | ~130 |
| `packages/context` | `ContextEngine`: seleciona candidatos por relevância, deduplica por checksum, respeita orçamento de tokens, cacheia | ~175 |
| `packages/mcp` | Servidor MCP com ferramentas `forja_capability_execute`, `forja_handoff_create`, `forja_context_build`, `forja_memory_query`, `forja_graph_query`, `forja_code_impact`, `forja_task_next`, `forja_spec_check`, `forja_test_run`, `forja_execution_validate` — todas passam por `authorize()` desde a auditoria | ~260 |
| `packages/plugin-sdk` | `PluginRegistry`, manifesto com `permissions` explícitas, `PluginContext` que aplica `requirePermission()` antes de qualquer chamada ao host | ~90 |
| `packages/observability` | `ObservabilityRecorder`, `ControlPlane` (métricas agregadas: runs, sucesso, tokens, custo, evidência) | ~155 |
| `packages/events` | `EventBus` com idempotência, dead-letter, offsets — já é o barramento de eventos do sistema | ~150 |
| `packages/evals` | `EvaluationEngine`: agrega `Observation[]` em `EvaluationReport` por escopo (`run\|agent\|task\|sprint\|capability\|model\|strategy\|workspace`) | ~75 |
| `packages/planner` | `DeterministicPlanner`: decompõe objetivo em plano com dependências, risco, orçamento — **sem LLM** | ~90 |
| `apps/cli` | CLI real (`bin/forja.ts`) roteando ~50 comandos; nenhuma capability registrada aqui escreve em arquivos de projeto (todas são leitura, `context_run_record`, `handoff_record` ou `graph_write` — bookkeeping do framework, não edição de código) | — |
| `apps/server` | NestJS + REST/SSE, controle de acesso, fecha SQLite no shutdown | — |
| `apps/dashboard` | Next.js, proxy autenticado para o server, sem lógica de autorização própria | — |
| `apps/worker` | Processo separado para jobs longos | — |
| `scripts/demo-autonomy.ts` | **Prova end-to-end real** do ciclo completo: contexto → plano → política → aprovação humana → sandbox real (git worktree) → validação → promoção → grafo → sprint/task/handoff → evento — hoje o único lugar que fecha o círculo inteiro | — |

**O que isso significa**: a Forja já tem — implementados e testados, não apenas desenhados — quatro
das cinco peças que a visão de "Engineering Control Plane" precisa: um motor de política com
aprovação, um runtime supervisionado com checkpoint, um grafo de conhecimento com evidência e
validade temporal, e um sandbox real. **O que falta não é reinventar essas peças — é estender o
grafo para cobrir engenharia (não só código) e construir três motores novos por cima delas**
(Constitution, Risk, Provenance) mais um pouco de identidade/reputação de agente.

## 2. Target State — o que a visão pede

Resumo dos 33 blocos da visão, agrupados pelas 5 perguntas que a Forja deveria conseguir responder
de forma estruturada e auditável ao final da evolução (ver §12 do documento original):

1. **Por que o código existe** → Engineering Graph liga código a SPEC/ADR/Requirement.
2. **A mudança viola a arquitetura** → Architecture Constitution + `architecture:check`.
3. **Qual o risco** → Change Risk Engine + Risk-Based Autonomy (integrado ao Policy Engine já
   existente, não um sistema paralelo).
4. **Quem/o quê mudou isso** → AI Code Provenance (`forja blame`) + Agent Identity.
5. **A Forja aprende com o passado** → Learning Loop + Incident Graph + Agent Reputation.

## 3. Gap Analysis

| Capacidade pedida | Situação real | Classificação |
|---|---|---|
| Engineering Graph (nós Code/ADR/Spec/Agent/Run/Test/Incident/PR) | `GraphLoop` já é um grafo genérico com evidência e validade temporal; só faltam os **tipos de nó/aresta** de engenharia (ADR, SPEC, Agent, Run, Incident, PR) e os extratores que os populam | **Estender**, não recriar |
| Architecture Constitution | Não existe. `extractDeterministicRelations` já prova que extração determinística de ADR funciona (regex por `ADR-\d{4}`) — é a base para extrair `## Constraints` de forma determinística | **Construir**, reaproveitando o extrator |
| Architecture Drift Detection (`architecture:check`) | `specs/drift-sentinel` (em implementação nesta mesma sessão) já resolve a versão genérica ("uma relação verificada parou de ser reproduzida") — Architecture Drift é esse mesmo motor aplicado especificamente a regras da Constitution | **Compor** drift-sentinel + Constitution, não duplicar |
| Change Risk Engine | Não existe motor de score. Mas todos os insumos já existem: `GraphLoop.impact()` (blast radius), `EvaluationReport`/`Observation` (taxa histórica de falha), `PolicyEngine` (categoria/risco por regra) | **Construir**, compondo dados existentes |
| Risk-Based Autonomy | `PolicyEngine` já tem `ALLOW\|ALLOW_WITH_LIMITS\|REQUIRE_APPROVAL\|DENY` e `approvalRequiredRisks` configurável por `RiskLevel` | **Estender** `RiskLevel`/regras, não criar motor de decisão paralelo |
| Predictive Change Simulation (`forja simulate`) | `SandboxEngine` + `GitWorktreeBackend` + `runSandboxedCapability` (hoje) já são exatamente "aplicar em worktree isolado, testar, decidir promover ou descartar" | **Compor** sandbox + risk engine + architecture:check |
| ADR Graph / Decision Impact | `extractDeterministicRelations` já cria nós `ADR` e aresta `DERIVED_FROM` a partir de `ADR-\d{4}` no texto | **Estender** com status (`accepted/proposed/deprecated/superseded`) e `adr:impact` usando `GraphLoop.impact()` que já existe |
| `forja engineer` (façade) | Nada equivalente hoje — mas é literalmente uma composição de `ContextEngine` + `DeterministicPlanner` + `GraphLoop` + Risk Engine (novo) + `PolicyEngine`, todos já existentes | **Construir só a façade**, proibido reimplementar qualquer peça |
| Agent Identity | `AgentIdentity` já existe como tipo (`id`, `role`, `autonomy`) mas é efêmero — não é uma entidade persistida com histórico | **Estender** o contrato + persistência, não trocar o conceito |
| Agent Reputation / Project Evals | `EvaluationEngine`/`EvaluationReport` já agregam `Observation[]` por `scope: 'agent' \| 'model' \| ...` — a agregação existe, falta só o *report* voltado a reputação e o comando `agent:score` | **Estender**, não recriar |
| Smart Agent Routing | `scripts/llm-fit.ts`/`llm:recommend`/`llm:profiles` já fazem roteamento determinístico por papel/tarefa sem custo de rede ("LLM Fit Loop", ADR-0074) — é precisamente o esqueleto de Smart Routing | **Estender** com dados de reputação, não substituir |
| AI Code Provenance (`forja blame`) | `Observation` já tem `model`, `agentId`, `runId`, `inputHash`, `contextRefs` — falta ligar linha de código a `Observation`, o que exige um novo tipo de aresta no grafo (`GENERATED_BY`) | **Construir**, dado que os campos-fonte já existem |
| AI-SBOM | Não existe, mas é um relatório derivado do grafo de provenance — nenhuma nova fonte de dado, só agregação | **Construir** por cima do grafo |
| Agent Runtime Monitoring / Anomaly Engine | Não existe. `PolicyEngine` já é o lugar certo para acoplar (política decide, não o LLM) | **Construir**, mas *dentro* de Policy, não paralelo |
| Learning Loop / Incident → Knowledge | Não existe. `GraphLoop` + evidência já dão a base; falta o tipo de nó `Incident` e o fluxo de sugestão (nunca aplicação automática) | **Construir**, reaproveitando grafo + approvals |
| Autonomous Maintenance | Não existe nada além da base (`RuntimeEngine` + `PolicyEngine` + `SandboxEngine` já provam o ciclo supervisionado de ponta a ponta via `demo-autonomy.ts`) | **Fase 7** — arquitetar o caminho, não habilitar agora |
| Engineering API (`packages/engineering`, etc.) | Não existe como pacote — mas o padrão "domain core sem framework" já é a convenção de todo `packages/*` hoje | **Construir seguindo o padrão existente** |
| Provider-agnostic model layer | Já existe: `packages/llm` roteia por CLI adapter, sem acoplamento a um provider | **Nada a fazer** — só não violar |

**Conclusão do gap analysis**: nenhuma das 33 features exige reescrever nada que já existe. Todas
se apoiam em três extensões de contrato (tipos de nó/aresta no grafo, campos em `AgentIdentity`,
campos em `PolicyRule`) e quatro motores novos (Constitution, Risk, Provenance, Identity/Reputation)
que **compõem** engines existentes em vez de duplicá-las.

## 4. Bounded Contexts propostos

Novo pacote: **`packages/engineering`** — não um pacote monolítico, mas um diretório com
sub-bounded-contexts próprios, cada um seguindo a mesma regra que já rege `packages/core`,
`packages/policy` etc.: **framework-independent, importa só `packages/contracts` e (quando preciso)
`packages/graph`**.

```text
packages/engineering/
  architecture/     ArchitectureEngine — compila Constitution, roda architecture:check
  risk/             RiskEngine — score de mudança, fórmula configurável
  provenance/        ProvenanceEngine — liga código a Observation/Run/Agent
  identity/          AgentIdentityService, AgentReputationService
```

Por que um pacote com sub-diretórios e não quatro pacotes `@forja/architecture`,
`@forja/risk`, etc.? Porque os quatro comportam contratos e regras de negócio da MESMA camada
(bounded contexts irmãos, não em cadeia de dependência um do outro) e crescem juntos nas mesmas
sprints (Fase 1). Divergir em pacotes separados antes de qualquer um deles estabilizar é
over-engineering — `packages/policy`/`packages/core`/`packages/runtime` só viraram pacotes
separados depois que a fronteira entre eles já estava provada em uso real (ADR-0020). Fica como
critério explícito de follow-up: se `engineering/risk` crescer a ponto de precisar de sua própria
release/versão independente de `engineering/architecture`, aí sim vira `packages/risk` — decisão
adiada de propósito, não ignorada.

`packages/engineering` depende de `packages/contracts` e `packages/graph` (para ler/escrever nós de
engenharia). **Não depende de `packages/policy`** — é o inverso: `PolicyEngine` opcionalmente
consulta um `RiskEngine` via uma interface pequena (`RiskAssessor`), não o contrário, preservando a
direção de dependência do ADR-0020 (`policy` não sabe de `engineering`; `engineering` não sabe de
`policy` — quem os compõe é a camada de aplicação, ex.: `forja engineer`).

## 5. Arquitetura proposta

```text
                         packages/contracts
                                 │
                          packages/graph  ◄──────────────┐
                                 │                        │
                       packages/engineering               │
                        (architecture, risk,              │
                         provenance, identity)             │
                                 │                        │
                    ┌────────────┼────────────┐            │
                    │            │            │            │
             packages/policy  packages/planner │            │
                    │            │            │            │
                    └────────────┼────────────┘            │
                                 │                          │
                        packages/orchestration               │
                                 │                            │
                          packages/runtime                     │
                                 │                              │
                    apps/cli · apps/server · packages/mcp ──────┘
                    (adapters — cada um compõe os engines,
                     nenhum reimplementa lógica)
```

`packages/engineering` senta **entre** `graph` e `policy`/`planner`, na mesma posição de domínio
independente de framework descrita em `docs/architecture/FORJA-2.0-ARCHITECTURE.md` — mesma direção
de dependência (interfaces externas → adapters → application → domain core), estendida com uma
camada de domínio a mais.

## 6. Data Model — extensões de contrato

Em `packages/contracts/src/index.ts`, aditivo (nunca remove campo existente — SPEC-012/`noImplicitAny`
já provou que este repo trata mudança de contrato como ratchet, não como reescrita):

```ts
// Novos tipos de nó de engenharia — reaproveitam GraphNode.type (string livre) e
// GraphNode.status (KnowledgeStatus) já existentes. Não é um novo contrato de nó,
// é um VOCABULÁRIO de `type` documentado — igual o extractDeterministicRelations
// já faz hoje com 'Project'|'Document'|'File'|'Symbol'|'ADR'|'Task'|'Agent'|'Test'.
export const ENGINEERING_NODE_TYPES = [
  'ADR', 'SPEC', 'Requirement', 'BusinessRule',                 // já parcial (ADR)
  'Module', 'Class', 'Function', 'API', 'Worker', 'Table',      // já parcial (File/Symbol)
  'Agent', 'Model', 'Run', 'Context', 'Tool', 'Capability',     // Agent já existe
  'Test', 'Evaluation', 'Failure', 'Incident',                  // Test já existe
  'Commit', 'Branch', 'PullRequest', 'Release',
  'Approval', 'Policy', 'Risk', 'Evidence',
] as const;

export const ENGINEERING_EDGE_TYPES = [
  'implements', 'depends_on', 'calls', 'imports', 'reads', 'writes',  // parcial (DEPENDS_ON/CALLS)
  'defined_by', 'governed_by', 'violates', 'supersedes',
  'generated_by', 'reviewed_by', 'approved_by',
  'tested_by', 'failed_by',
  'changed_by', 'introduced_by', 'fixed_by',
  'affects', 'impacts', 'observed_in', 'deployed_in',
] as const;

// Identidade de agente persistente — hoje AgentIdentity é efêmero (só id/role/autonomy).
export interface AgentProfile2 extends AuditFields {
  readonly id: EntityId;                 // forja://agents/<slug>
  readonly role: string;
  readonly provider?: string;
  readonly model?: string;
  readonly capabilities: readonly string[];
  readonly trustLevel: number;           // 0-5, derivado por AgentReputationService — nunca setado à mão
  readonly autonomyLevel: 'autonomous' | 'autonomous_with_review' | 'supervised' | 'human_in_the_loop';
  readonly architectureDomains: readonly string[];
  readonly limits?: { readonly maxFiles?: number; readonly maxCostUsd?: number; readonly maxDurationMs?: number };
}

// Regra de Architecture Constitution
export interface ArchitectureRule {
  readonly id: string;
  readonly source: string;               // ex.: 'memory/90-decisions/0042-....md'
  readonly sourceType: 'adr' | 'spec' | 'manual';
  readonly status: 'active' | 'superseded' | 'proposed';
  readonly scope: { readonly paths: readonly string[] };
  readonly constraint: ArchitectureConstraint;
  readonly severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  readonly rationale: string;
  readonly confidence: number;           // 1.0 para regra explícita; < 1.0 só quando sourceType sugere via LLM e AINDA não foi aprovada por humano
}
export type ArchitectureConstraint =
  | { readonly kind: 'forbid_import'; readonly patterns: readonly string[] }
  | { readonly kind: 'require_dependency'; readonly symbols: readonly string[] }
  | { readonly kind: 'forbid_dependency'; readonly symbols: readonly string[] };

// Risk score — nunca mágico, sempre com fatores nomeados (ver SPEC-035)
export interface ChangeRiskAssessment {
  readonly score: number;                // 0-100
  readonly confidence: number;           // 0-1
  readonly factors: readonly { readonly name: string; readonly weight: number; readonly value: number; readonly evidenceIds: readonly EntityId[] }[];
  readonly recommendedControls: readonly string[];
}
```

Nenhum desses tipos precisa de tabela SQLite nova além do que `adapter-sqlite` já tem para
`GraphNode`/`GraphEdge`/`Evidence` — `ArchitectureRule` e `ChangeRiskAssessment` são **derivados em
tempo de leitura** (compilados/computados), não persistidos como fonte de verdade primária; o que
é persistido é o artefato compilado (`.context/architecture/constitution.json`, versionado em git,
não em SQLite — decisão explícita, ver §9).

## 7. Engineering Graph Model — nós e arestas novos, concretamente

Extração determinística (sem LLM) a partir de fontes já lidas hoje pelo `GraphIndexer`:

| Documento fonte | Extrator | Nó(s) produzido(s) | Aresta(s) |
|---|---|---|---|
| `memory/90-decisions/NNNN-*.md` | já existe (`ADR-\d{4}` regex) — **estender** para ler `## Constraints` como lista determinística | `ADR` (com `status` do frontmatter, hoje ignorado — precisa passar a ler) | `governed_by` do módulo em `scope.paths` para o ADR |
| `specs/*/spec.md` | novo, mesmo padrão regex (`SPEC-\d{3}`, `## Escopo`) | `SPEC` | `implements` do módulo pra SPEC; `derived_from` da SPEC pro ADR referenciado |
| `.context/forja-runs.jsonl` / SQLite `runtime_*` | novo — já é dado estruturado, não precisa regex | `Run`, `Agent` (já existe), `Capability` (já existe via `GraphExecutionMemory`) | `generated_by` |
| `git log` (via `adapter-git`, já usado por `code:sync`) | novo, reaproveita `SpawnCommandRunner` já existente | `Commit` | `changed_by`, `introduced_by` |
| `test/*.test.js` | já parcial (`describe`/`it`/`test` regex existe) | `Test` (já existe) | `tested_by` |

**Importante — nada disso precisa de LLM.** O padrão do `extractDeterministicRelations` já provou
(código em produção, testado) que regex + parsing estruturado cobre ADR/SPEC/Task/Test/Agent/ADR.
LLM entra só como **sugestão opcional** de regra ambígua (§8), nunca como fonte de verdade do grafo.

## 8. Architecture Constitution — design

Pipeline: `memory/90-decisions/*.md` (fonte legível por humano) → parser determinístico de
`## Constraints` (mesma técnica regex do extrator de grafo) → `ArchitectureRule[]` → compilado em
`.context/architecture/constitution.json` (versionado em git, revisável em PR como qualquer outro
artefato gerado — mesmo padrão de `.context/forja-runs.jsonl`).

Comandos propostos (nenhum existe ainda — nomenclatura sem prefixo `forja`, ver §12):

- `architecture:compile` — ADRs → `constitution.json` (determinístico)
- `architecture:check` — `constitution.json` vs. CodeGraph vs. código atual
- `architecture:status` — resumo: N regras ativas, última compilação
- `architecture:explain <rule-id>` — por que essa regra existe, qual ADR, qual severidade

`architecture:compile` **nunca** usa LLM para gerar uma regra `active` diretamente. Fluxo com LLM
(opcional, Fase 6+): quando um ADR tem `## Constraints` mal-formado ou ambíguo, o parser
determinístico produz uma regra com `confidence < 1.0` e `status: 'proposed'`; só passa a `active`
depois de `architecture:approve <rule-id>` (comando proposto, ver §12; reaproveita `ApprovalLedger` — **não** um sistema
de aprovação paralelo).

`architecture:check` reaproveita o mesmo motor de "isso que era verdade parou de ser" que o
`drift:check` (SPEC-030, em implementação nesta sessão) já constrói — arquitetura é um caso
particular de drift: a fonte é `constitution.json` em vez de um documento livre, e a comparação é
contra imports/dependências reais (via `CodeGraph`/`extractDeterministicRelations`, que já produz
arestas `DEPENDS_ON`) em vez de contra uma relação semântica textual qualquer.

## 9. Change Risk Engine — design

Fórmula inicial, documentada e com pesos configuráveis (nunca hardcoded sem explicação — pedido
explícito da visão):

```ts
interface RiskFactor { readonly name: string; readonly weight: number; readonly compute: (input: RiskInput) => number /* 0-1 */; }

const DEFAULT_RISK_FACTORS: readonly RiskFactor[] = [
  { name: 'blast_radius',        weight: 0.20, compute: /* GraphLoop.impact(origin).nodes.length, normalizado */ },
  { name: 'architecture_violations', weight: 0.20, compute: /* count de architecture:check reprovado no diff */ },
  { name: 'security_sensitivity',weight: 0.15, compute: /* categorias 'secrets'|'database'|'deployment' tocadas, já vocabulário de PolicyCategory */ },
  { name: 'historical_failure_rate', weight: 0.15, compute: /* EvaluationReport do domínio/capability afetado */ },
  { name: 'test_confidence',     weight: 0.10, compute: /* cobertura de teste dos arquivos afetados, inverso */ },
  { name: 'reversibility',       weight: 0.10, compute: /* migration/schema change = baixa reversibilidade */ },
  { name: 'deployment_complexity', weight: 0.10, compute: /* número de serviços/apps afetados */ },
];

score = round(100 * Σ(factor.weight * factor.compute(input)))
```

Todo fator carrega `evidenceIds` (nós/arestas do grafo, `Observation`s) — nunca um número solto.
`confidence` do assessment é a fração de fatores que tiveram dado real disponível (ex.: sem
histórico de falha nesse domínio ainda → esse fator entra com peso mas confiança reduzida,
declarado, não escondido).

Integração com `PolicyEngine` (§ visão original, Feature 4): **sem** motor de decisão paralelo.
`RiskLevel` (`'low'|'medium'|'high'|'critical'`) já é o vocabulário do `PolicyRule.scope.risks` e
de `approvalRequiredRisks` — a mudança é permitir que `PolicyRequest` opcionalmente carregue um
`riskScore: ChangeRiskAssessment` calculado por `RiskEngine` (interface pequena, injetada, igual
`request.policy` já é injetado hoje), e que uma regra de política possa referenciar faixas de score
(`scope.riskScoreRange?: [number, number]`) além de `risks: RiskLevel[]`. As faixas 0-25/26-50/51-
75/76-100 sugeridas na visão viram os **valores default** de configuração, nunca constantes fixas
no código — mesmo princípio já usado em `RuntimeLimits`/`PolicyLimits` (default object, sempre
sobrescrevível).

## 10. Engineering Evidence Ledger

Não é um sistema novo — é `Evidence`/`AuditRecord` (já existem em `packages/contracts`) mais
`SqliteAuditStore`/`SqliteObservationStore` (já existem em `packages/adapter-sqlite`), com um
formato de **exportação** append-only por run (o JSON de exemplo na visão — `run/intent/agent/risk/
architectureCheck/tests/approvals/commit`) construído a partir de dados que já são gravados hoje em
tabelas separadas. O trabalho real aqui é uma **view agregada**, não uma nova fonte de dado.

## 11. API Contracts (packages/engineering)

```ts
// packages/engineering/architecture/src/index.ts
export interface ArchitectureEngine {
  compile(sources: { adrs: readonly string[]; specs: readonly string[] }): readonly ArchitectureRule[];
  check(rules: readonly ArchitectureRule[], graph: GraphLoop): ArchitectureCheckReport;
  explain(ruleId: string, rules: readonly ArchitectureRule[]): ArchitectureRuleExplanation;
}

// packages/engineering/risk/src/index.ts
export interface RiskEngine {
  assess(input: RiskInput): ChangeRiskAssessment;
}
// Consumido opcionalmente por PolicyEngine via uma interface local pequena — PolicyEngine não
// importa @forja/engineering-risk, só uma interface estrutural (mesmo padrão de CapabilityPolicy
// hoje: PolicyEngine satisfaz a interface por forma, não por import direto).

// packages/engineering/provenance/src/index.ts
export interface ProvenanceEngine {
  recordGeneration(input: { readonly files: readonly string[]; readonly lines?: readonly [number, number][]; readonly runId: RunId; readonly agentId: EntityId }): void;
  blame(file: string, lineRange?: readonly [number, number]): readonly ProvenanceRecord[];
}

// packages/engineering/identity/src/index.ts
export interface AgentIdentityService { register(profile: AgentProfileInput): AgentProfile2; get(id: EntityId): AgentProfile2 | undefined; }
export interface AgentReputationService { score(agentId: EntityId, domain?: string): AgentReputationScore; }
```

Cada um é **puro domínio** (sem `fs`/`spawnSync`/rede) — os adapters (`apps/cli`, `packages/mcp`,
`apps/server`) é que ligam a fontes reais (arquivos ADR, git log, SQLite).

## 12. CLI Plan

Sem explosão de comandos — agrupado por domínio, uma façade principal (`engineer`) por cima do
resto. **Nenhum comando abaixo existe ainda** — esta é a superfície proposta para os Sprints 1-3;
por isso a tabela usa nome do comando sem o prefixo `forja`/`npm run` (convenção deste repositório
para citação de comando *proposto*, não real — ver `lib/core/doc-graph.ts`, `DOC_SURFACES`: `docs/`
é superfície que orienta o agente *agora*, então só cita comando que já existe no registry;
comando proposto pertence à spec que o define, referenciada na coluna "Spec").

| Domínio | Comando proposto | Spec |
|---|---|---|
| Façade | `engineer "<objetivo>"` — compõe tudo abaixo | SPEC-035 |
| Arquitetura | `architecture:compile` / `:check` / `:status` / `:explain <rule-id>` / `:approve <rule-id>` | SPEC-033 |
| Risco | `risk:assess "<mudança>"` / `:explain <assessment-id>` | SPEC-034 |
| ADR | `adr:list` / `:show <id>` / `:impact <id>` / `:graph` | SPEC-032 |
| Agente | `agent:list` / `:show` / `:score` / `:history` | Fase 3 (fora desta spec master) |
| Proveniência | `provenance:blame <arquivo>` / `:generate` (AI-SBOM) | Fase 5 (fora desta spec master) |
| Outros | `simulate "<mudança>"`, `explain <alvo>`, `timeline` | Fases 4/2 (fora desta spec master) |

`eval:*`, `route`, `learn:*`, `watch` ficam para Fases 3/6/7 — não fazem parte da primeira entrega
de comandos (P0).

## 13. Events

Novos eventos no `EventBus` já existente (`packages/events`), sem barramento paralelo:

```text
architecture.compiled          architecture.violation_detected
change.risk_assessed
agent.identity_registered      agent.reputation_updated
provenance.recorded
simulation.completed
incident.detected              learning.proposed
```

## 14. Persistence

SQLite local-first, como todo o resto do framework. `constitution.json` é a única exceção
deliberada (artefato versionado em git, não em SQLite) — mesma categoria de `.context/forja-runs.jsonl`:
precisa ser revisável em PR por humano, não só consultável por comando.

## 15. Security

Segue os princípios já estabelecidos e reforçados pela auditoria de 2026-08-31: local-first,
fail-closed em ambiguidade, LLM nunca é fonte de verdade para segurança crítica (Constitution:
regra `active` só de parser determinístico ou aprovação humana explícita — nunca de sugestão de
LLM direto).

## 16. Policy Integration

Detalhado em §9. Resumo: `RiskEngine` é consumido por `PolicyEngine`, nunca o substitui.

## 17. Migration Strategy / Compatibility

Toda extensão de contrato é aditiva (campos opcionais). Nenhum comando existente muda de
comportamento. `ENGINEERING_NODE_TYPES`/`ENGINEERING_EDGE_TYPES` são vocabulário adicional sobre o
`type: string` já livre de `GraphNode`/`GraphEdge` — zero migração de dado existente necessária.

## 18. Test Strategy

Mesmo padrão do resto do repo: `node --test`, sem mocking framework, fixtures de fake
store/backend (ver `test/sandbox.test.js` para o padrão de referência). `ArchitectureEngine`/
`RiskEngine` são puros — testáveis sem I/O. Testes negativos obrigatórios para: regra de
Constitution mal-formada, risco com fator sem dado (confidence reduzida, não erro), Constitution
compilada de ADR sem `## Constraints` (vazio, não crash).

## 19. Release Plan

Ver `specs/engineering-intelligence/plan.md` para o detalhamento em sprints — resumo:

- **Sprint 1**: `packages/engineering/architecture` (Constitution compile/check/explain) +
  extração de `ADR`/`SPEC` no grafo.
- **Sprint 2**: `packages/engineering/risk` (RiskEngine) + integração `PolicyEngine`.
- **Sprint 3**: Evidence Ledger (view agregada) + `forja engineer` (façade mínima, sem routing/
  identity ainda).
- Fases 2-7 da visão original ficam para specs subsequentes, quebradas quando Sprint 1-3 estiver
  em produção e puder informar as decisões de design das fases seguintes (Agent Identity, em
  particular, se beneficia de já ter dados reais de `RiskEngine`/`ArchitectureEngine` rodando).

## 20. Riscos

| Risco | Mitigação |
|---|---|
| `packages/engineering` virar um monólito acoplado | Sub-diretórios com fronteira de interface clara desde o dia 1 (§4); nenhum dos quatro importa os outros três diretamente |
| Risk score "mágico" sem explicação | Fórmula documentada em código E neste doc (§9); todo `ChangeRiskAssessment` carrega `factors[]` com `evidenceIds` |
| Architecture Constitution virar fonte de falso-positivo (ruído) | Reaproveita a mesma mitigação já desenhada para drift-sentinel: comparação por relação semântica (import/depend), não por hash de texto |
| Confundir sugestão de LLM com regra ativa | `confidence`/`status: 'proposed'` obrigatórios em qualquer regra não-determinística; `active` só por parser ou aprovação humana |

## 21. Open Questions

1. `AgentProfile2` é um nome provisório — o contrato final substitui ou convive com
   `AgentIdentity` atual? (Decisão de ADR-0078, marcada como aberta até Sprint 3.)
2. `constitution.json` versionado em git — e se dois branches compilarem regras conflitantes?
   Fica para o design de `architecture:compile` (Sprint 1), não bloqueia a arquitetura geral.
3. Onde mora o limite entre "Change Risk Engine" e "Policy Engine" quando os dois crescerem —
   revisar depois que `RiskEngine` tiver uso real (Sprint 2 retro).
