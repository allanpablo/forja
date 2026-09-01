# ADR-0078: ForjaJS 3.0 — de framework de agentes a Engineering Control Plane

- **Status**: proposed
- **Data**: 2026-09-01
- **Autor(es)**: apk
- **Tags**: architecture, vision, graph, policy, engineering-intelligence

## Contexto

A Forja 2.0 prova, em código real (não em documentação), quatro capacidades: um motor de política
com aprovação supervisionada (`packages/policy`), um runtime com checkpoint e retomada
(`packages/runtime`), um grafo de conhecimento com evidência e validade temporal
(`packages/graph`), e um sandbox real via git worktree (`packages/sandbox`,
`runSandboxedCapability`). `scripts/demo-autonomy.ts` fecha o ciclo de ponta a ponta.

A visão recebida propõe estender isso para um "Engineering Control Plane": a Forja passa a
entender não só código, mas **por que** o software existe (specs, requisitos), **como deveria
funcionar** (ADRs, arquitetura), **quem/o quê o mudou** (agentes, modelos, runs), e **o que
aconteceu depois** (incidentes, regressões). Isso é uma mudança de escopo real — de "orquestra
agentes com processo e memória" para "governa engenharia de software feita por agentes,
independente de que agente/modelo a fez".

A questão que este ADR decide: **isso é uma extensão incremental (2.x) ou uma mudança de versão
maior (3.0)?**

## Decisão

**É ForjaJS 3.0.** Critério: uma mudança de versão maior é justificada quando o **modelo mental**
do produto muda, não quando a superfície de comando cresce. 2.0 já foi essa mudança uma vez (ADR
implícito em `docs/vision/FORJA-2.0-VISION.md`: de CLI 1.x para "plataforma local-first"). A
mudança agora é da mesma ordem: de "orquestra o trabalho de agentes de IA" para "é a fonte de
verdade de por que o sistema existe e se comporta como deveria, com ou sem IA envolvida" — o grafo
deixa de ser CodeGraph (código) e passa a ser Engineering Graph (produto + arquitetura + código +
runtime + histórico). Isso é incompatível com o critério "2.x incremental" porque nenhuma feature
isolada da visão é 3.0 — é o **conjunto**, com o grafo como eixo central de todas elas, que muda o
que a Forja *é*.

Consequência prática: as extensões de contrato descritas em
[`docs/architecture/FORJA-3-ENGINEERING-INTELLIGENCE-ARCHITECTURE.md`](../../docs/architecture/FORJA-3-ENGINEERING-INTELLIGENCE-ARCHITECTURE.md)
são aditivas (nenhum campo removido, nenhum comando quebrado) — 3.0 aqui é sobre *posicionamento e
modelo mental*, não sobre breaking changes de API. A Forja continua podendo ser descrita, ao final
da migração, sem versão nova de `CONTRACT_VERSION` forçada por isso sozinho; se algum sprint
subsequente exigir de fato um breaking change de contrato, esse será o gatilho para
`CONTRACT_VERSION = '3.0'`, decidido separadamente quando (e se) acontecer.

**Não** construímos nenhuma das 33 features da visão original diretamente. Este ADR autoriza:

1. Um novo bounded context, `packages/engineering/{architecture,risk,provenance,identity}`,
   seguindo a mesma regra de independência de framework de todo `packages/*` hoje (ADR-0020).
2. Extensão aditiva de `packages/contracts`: vocabulário de tipos de nó/aresta de engenharia sobre
   o `GraphNode.type`/`GraphEdge.type` já livres (nenhum novo contrato de grafo), `ArchitectureRule`,
   `ChangeRiskAssessment`, `AgentProfile2` (nome provisório).
3. Composição, nunca duplicação, de `PolicyEngine`, `GraphLoop`, `SandboxEngine`, `ContextEngine`,
   `EvaluationEngine`, `EventBus` já existentes.
4. Uma ordem de implementação em 3 sprints imediatos (Constitution → Risk Engine → Evidence Ledger
   + façade `forja engineer`), com as fases seguintes da visão original (Provenance, Identity,
   Simulation, Learning Loop, Autonomous Maintenance) especificadas só depois que essas três
   estiverem em produção — ver `specs/engineering-intelligence/plan.md`.

## Alternativas consideradas

- **Tratar como 2.x incremental** (uma feature de cada vez, sem ADR guarda-chuva) — rejeitada
  porque a visão pede explicitamente um documento de arquitetura e um ADR principal antes de
  qualquer código, e porque o próprio critério acima (mudança de modelo mental, não de superfície)
  não se sustenta como "incremental".
- **Reescrever o framework do zero em torno do Engineering Graph** — rejeitada explicitamente pela
  visão recebida ("Não: reescreva o framework do zero... remova funcionalidades existentes") e pelo
  gap analysis: nenhuma peça existente precisa ser substituída, só estendida.
- **Um pacote monolítico `packages/engineering`** (sem sub-diretórios com fronteira própria) —
  rejeitada porque Risk/Architecture/Provenance/Identity têm ritmos de mudança diferentes e
  acoplá-los cedo repete o erro que `packages/core`/`policy`/`runtime` já evitaram ao se separar só
  depois que a fronteira entre eles estava provada em uso real.
- **Motor de decisão de autonomia paralelo ao `PolicyEngine`** (Risk-Based Autonomy como sistema
  próprio) — rejeitada; `PolicyEngine` já tem o vocabulário certo (`RiskLevel`,
  `approvalRequiredRisks`, `ALLOW_WITH_LIMITS`/`REQUIRE_APPROVAL`) e passa a receber um assessment
  de risco opcional em vez de ganhar um substituto.

## Consequências

**Positivas**:
- Nenhum código existente muda de comportamento até que os sprints da Fase 1 comecem a consumir os
  novos engines — risco de regressão zero na primeira entrega (que é só planejamento).
- O gap analysis (ver documento de arquitetura) mostra que ~80% dos "insumos" das 33 features já
  existem no código de hoje — o trabalho real é composição e três motores novos, não uma
  reescrita.
- `drift-sentinel` (SPEC-030) e `cost-aware-autonomy-budget` (SPEC-029), já em implementação nesta
  mesma janela de trabalho, acabam sendo peças legítimas de Fase 1/Fase 3 desta visão maior
  (Architecture Drift Detection e Cost Intelligence, respectivamente) — não é trabalho descartado.

**Negativas / Trade-offs**:
- O escopo total da visão (33 features, 7 fases) é grande demais para qualquer sprint único — este
  ADR autoriza só a fundação (§19 do documento de arquitetura); fases posteriores exigirão ADRs e
  specs próprias quando chegar a vez delas, o que significa esta decisão fica deliberadamente
  incompleta até lá.
- `AgentProfile2` como nome provisório é uma dívida de nomenclatura assumida conscientemente —
  ver Open Question #1 no documento de arquitetura, a resolver até o fim do Sprint 3.
- Adicionar um bounded context novo (`packages/engineering`) aumenta a superfície do monorepo;
  mitigado por manter os quatro sub-domínios sem imports cruzados entre si desde o primeiro commit.

## Constraints

Regra real, checável hoje (não hipotética) — a primeira que `architecture:compile` (SPEC-033)
compila deste repositório: `packages/policy` é domínio puro (ADR-0020), nunca deveria depender de
um driver de persistência concreto.

- packages/policy não depende de better-sqlite3

## Rastreamento

- Documento de arquitetura: `docs/architecture/FORJA-3-ENGINEERING-INTELLIGENCE-ARCHITECTURE.md`
- Spec master: `specs/engineering-intelligence/spec.md` (SPEC-031)
- Specs de fundação: `specs/engineering-graph-extensions/` (SPEC-032),
  `specs/architecture-constitution/` (SPEC-033), `specs/change-risk-engine/` (SPEC-034),
  `specs/engineering-evidence-ledger/` (SPEC-035)
- ADRs relacionadas: ADR-0005 (handoff 7 campos), ADR-0019 (workspace), ADR-0020 (core/registry),
  ADR-0072 (limites de segurança do sandbox), ADR-0074 (LLM Fit Loop)
