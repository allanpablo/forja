# Spec: Engineering Intelligence / Engineering Twin (master)

- **ID**: SPEC-031
- **Status**: draft
- **Owner**: apk
- **Criado em**: 2026-09-01
- **Sprint alvo**: Sprints 1-3 (fundação); fases seguintes ficam em specs próprias
- **ADRs relacionadas**: [ADR-0078](../../memory/90-decisions/0078-forjajs-3-engineering-control-plane.md)

> **Spec master.** Não é implementada diretamente — decompõe em
> [SPEC-032](../engineering-graph-extensions/spec.md) (Engineering Graph),
> [SPEC-033](../architecture-constitution/spec.md) (Architecture Constitution + drift),
> [SPEC-034](../change-risk-engine/spec.md) (Change Risk Engine) e
> [SPEC-035](../engineering-evidence-ledger/spec.md) (Evidence Ledger + façade `forja engineer`).
> Ver [`docs/architecture/FORJA-3-ENGINEERING-INTELLIGENCE-ARCHITECTURE.md`](../../docs/architecture/FORJA-3-ENGINEERING-INTELLIGENCE-ARCHITECTURE.md)
> para a auditoria completa, gap analysis e desenho técnico que fundamentam esta spec.

## 1. Problema

A Forja hoje orquestra *como* agentes de IA trabalham (processo, memória, aprovação, sandbox) mas
não entende *por que* o software que eles produzem existe, *se* o que produzem respeita a
arquitetura pretendida, *qual o risco* de uma mudança antes de ela acontecer, nem *quem/o quê*
produziu cada linha depois do fato. Essas perguntas hoje só têm resposta manual — um humano lendo
ADRs, olhando `git blame`, adivinhando risco. Para operar com autonomia supervisionada em escala
(múltiplos agentes, múltiplos projetos), essas respostas precisam ser estruturadas, auditáveis e
consultáveis por comando — não tribais.

## 2. Proposta de valor

A Forja passa a responder, de forma estruturada e com evidência: por que um código existe (SPEC/ADR
de origem), se uma mudança viola a arquitetura pretendida, qual o risco de uma mudança antes dela
acontecer, e quem/o quê a produziu. **GitHub guarda o código. A Forja guarda a engenharia.**

## 3. User stories

- **Como** sdd-architect, **quero** que uma decisão registrada em ADR vire uma regra que o sistema
  verifica sozinho, **para que** "arquitetura documentada" e "arquitetura em vigor" nunca divirjam
  em silêncio.
- **Como** governance, **quero** um score de risco explicável (não uma caixa-preta) antes de uma
  mudança grande, **para que** eu saiba quando exigir revisão humana em vez de deixar autonomia
  supervisionada seguir sozinha.
- **Como** desenvolvedor/consultor operando múltiplos projetos, **quero** uma única pergunta
  (`forja engineer "<objetivo>"`) que já traga arquitetura, risco, ADRs relevantes e fluxo
  recomendado, **para que** eu não precise consultar cinco comandos manualmente antes de começar.

## 4. Critérios de aceite (Definition of Done)

- [ ] AC-1: Engineering Graph (SPEC-032) extrai `ADR`/`SPEC` como nós de primeira classe, com
      `status` (accepted/proposed/deprecated/superseded) e arestas `governed_by`/`implements`,
      **sem LLM** (mesmo padrão determinístico de `extractDeterministicRelations`).
- [ ] AC-2: `forja architecture:compile`/`architecture:check`/`architecture:explain` (SPEC-033)
      funcionam sobre pelo menos um ADR real deste repositório com `## Constraints`.
- [ ] AC-3: `forja risk:assess "<mudança>"` (SPEC-034) produz um score 0-100 com fatores nomeados e
      `evidenceIds` — nunca um número sem explicação.
- [ ] AC-4: Risk assessment é **opcionalmente** consumível por `PolicyEngine` via uma interface
      pequena, sem duplicar o motor de decisão de política existente.
- [ ] AC-5: Evidence Ledger (SPEC-035) produz uma view agregada por run a partir de dados já
      persistidos (`AuditRecord`/`Observation`), sem nova fonte de verdade primária.
- [ ] AC-6: `forja engineer "<objetivo>"` compõe `ContextEngine` + `DeterministicPlanner` +
      `GraphLoop` + `RiskEngine` (novo) + `PolicyEngine`, sem reimplementar nenhum deles.
- [ ] AC-7: nenhum comando existente muda de assinatura ou comportamento; toda extensão de
      contrato é aditiva.

## 5. Escopo

**Dentro** (Sprints 1-3, esta spec master):
- Engineering Graph: vocabulário de nós/arestas de engenharia + extratores determinísticos para
  ADR/SPEC.
- Architecture Constitution: compile/check/explain, reaproveitando o motor de drift já em
  construção em `specs/drift-sentinel`.
- Change Risk Engine: fórmula documentada, fatores configuráveis, integração opcional com Policy.
- Evidence Ledger: view agregada por run.
- Façade `forja engineer` (versão mínima: contexto + arquitetura + risco + ADRs relevantes +
  fluxo recomendado — **sem** roteamento de agente/seleção de time, que depende de Agent
  Identity/Reputation, fora de escopo aqui).

**Fora** (fases seguintes, cada uma com spec própria quando chegar a vez — ver
`plan.md` desta spec para a ordem):
- Agent Identity / Agent Reputation / Project Evals / Smart Routing (Fase 3 da visão original).
- Predictive Change Simulation (Fase 4).
- AI Code Provenance / `forja blame` / AI-SBOM (Fase 5).
- Agent Runtime Monitoring / Behavior Anomaly Engine (Fase 5).
- Learning Loop / Incident → Knowledge / Cross-project Intelligence (Fase 6).
- Autonomous Maintenance (Fase 7) — só arquitetura preparatória, nunca habilitação automática.
- Dashboard/visualização do Engineering Graph — core primeiro, UI depois, por princípio explícito
  da visão recebida.

## 6. NFRs / restrições

- **Local-first**: nenhuma dependência de rede nova.
- **Determinismo antes de LLM**: extração de ADR/SPEC e cálculo de risco são determinísticos; LLM
  entra só como sugestão opcional revisável por humano (nunca regra `active` direto).
- **Fail-closed em ambiguidade**: regra de Constitution mal-formada não vira regra `active`
  silenciosamente — fica `proposed` até aprovação.
- **Compatibilidade**: zero breaking change nesta spec master; qualquer breaking change futuro tem
  ADR próprio (ver ADR-0078, "Negativas/Trade-offs").

## 7. Riscos e mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Escopo da visão original (33 features) vazar para dentro desta spec master | Alta se não vigiado | Alta (nunca termina) | Escopo §5 explicitamente limitado a Sprints 1-3; fases seguintes exigem spec própria, não emenda desta |
| `packages/engineering` virar acoplamento cruzado entre architecture/risk/provenance/identity | Média | Média | Nenhum sub-domínio importa outro nesta spec; revisão de import cruzado faz parte do `project:check` |
| Risk score sem uso real por falta de dado histórico (cold start) | Alta no início | Baixa | `confidence` do assessment reflete isso explicitamente — não é um bloqueador, é um dado honesto |

## 8. Métricas de sucesso

30 dias após Sprint 3: rodar `forja engineer "<mudança real deste repositório>"` produz uma saída
com ADRs corretos, risco plausível e nenhuma alucinação de arquitetura que não existe — validado
por revisão humana em pelo menos 3 mudanças reais consecutivas.

## Apêndice — plano de sprints (não é `plan.md` formal: esta spec ainda está em `draft`, e o
próprio gate de `spec:check` do Forja recusa `plan.md` antes de `spec: approved` — o rascunho de
sprints pedido na primeira entrega vive aqui até a aprovação formal, quando então vira `plan.md`
de verdade)

**Abordagem**: bottom-up a partir do Engineering Graph (SPEC-032), porque toda outra peça
(Constitution, Risk, Evidence) lê ou escreve nele. Cada sprint entrega um comando funcional real
sobre este próprio repositório antes de passar ao próximo.

| Sprint | Specs | Entrega | Prova de sucesso |
|---|---|---|---|
| **1** | SPEC-032, SPEC-033 | `ADR`/`SPEC` como nós de primeira classe; `architecture:compile`/`check` sobre `memory/90-decisions/` real, reaproveitando o motor do `drift-sentinel` (SPEC-030) | `architecture:check` neste repo aponta zero violação na linha de base e detecta uma violação injetada de propósito em teste |
| **2** | SPEC-034 | `risk:assess`/`risk:explain` funcionais; `RiskAssessor` opcionalmente consultado por `PolicyEngine` | score sobre um diff real deste repositório concorda com julgamento humano |
| **3** | SPEC-035 | view agregada de evidência por run; façade `forja engineer` (contexto + arquitetura + risco + ADRs + fluxo recomendado) | saída de `forja engineer` sobre um objetivo real seria usada sem edição para começar o trabalho |

Diagrama:

```text
Sprint 1                Sprint 2              Sprint 3
Engineering Graph   →   Change Risk Engine  →  Evidence Ledger
Architecture             (consome Graph +        (agrega dados já
Constitution              Architecture)            persistidos)
        │                       │                       │
        └───────────────────────┴───────────────────────┘
                                 │
                          forja engineer
                         (façade, Sprint 3)
```

Decisão registrada (D1): ordem Graph → Constitution → Risk → Evidence, não a ordem alfabética/de
prioridade P0 da visão original — cada peça depende de contratos que a anterior estabiliza;
implementar em paralelo geraria retrabalho. Não é estrutural o suficiente para ADR própria (a
decisão estrutural maior — 3.0 vs. 2.x — já está em ADR-0078).

Dependências: specs SPEC-032 a SPEC-035 (todas draft); SPEC-029 (cost-aware-autonomy-budget, done)
e SPEC-030 (drift-sentinel, base do `architecture:check`) já em implementação nesta mesma janela.
Nenhum pacote npm novo.

Rollout: feature flags `features.engineeringGraph`/`architectureConstitution`/`changeRiskEngine`
default `false` até cada sprint fechar seus próprios testes; nenhuma migração de dado existente
(extensão aditiva de vocabulário); docs impactadas — `docs/architecture/`, `AGENTS.md` (papel
opcional "architecture reviewer"), `DOC-MAP.md`.

Kill criteria: se `architecture:check` gerar mais falso-positivo que sinal real sobre este próprio
repositório depois do Sprint 1, o motor é redesenhado antes de avançar para o Sprint 2 — não
empilhamos risco em cima de arquitetura que não detecta corretamente. Falta de histórico para
`confidence` alta no Risk Engine (Sprint 2) é limitação documentada, não kill criteria.
