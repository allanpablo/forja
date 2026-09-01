# Spec: Agent Identity & Reputation

- **ID**: SPEC-036
- **Status**: done
- **Owner**: apk
- **Criado em**: 2026-09-01
- **Sprint alvo**: Sprint 4 (primeiro sprint da Fase 3 da visão original — Agent Identity / Agent
  Reputation / Project Evals / Smart Routing; esta spec cobre as duas primeiras, Smart Routing fica
  para spec própria — ver §5)
- **ADRs relacionadas**: ADR-0078 (bounded context `packages/engineering/*` já autorizado; nenhuma
  decisão estrutural nova aqui, só mais um sub-domínio dentro do mesmo contexto)

> Depende de SPEC-034 (Change Risk Engine — dados reais de risco começam a existir a partir de
> agora) e reaproveita `packages/evals.EvaluationEngine` (já existente, scope `'agent'`) — a razão
> pela qual `docs/architecture/FORJA-3-ENGINEERING-INTELLIGENCE-ARCHITECTURE.md` §19 recomendou
> começar a Fase 3 só depois do Sprint 1-3 estar rodando: reputação precisa de comportamento real
> pra pontuar, não de um motor de decisão novo.

## 1. Problema

`AgentIdentity` (`packages/contracts`) hoje é efêmero — `{id, name, role, autonomy}` passado a cada
`PolicyRequest`, sem histórico persistido. Não existe registro de "quais agentes operam neste
projeto, com quais capabilities, e qual o histórico de confiabilidade de cada um" — cada run começa
do zero, sem memória de que um agente já causou 3 rollbacks nesta capability ou tem 95% de sucesso
naquela. `EvaluationEngine.evaluate({scope:'agent', scopeId})` já produz as métricas certas
(`successRate`, `reworkRate`, `rollbackRate` etc.), mas nada as transforma num score consultável
nem as persiste como identidade.

## 2. Proposta de valor

`forja agent:register`/`:list`/`:show`/`:score`/`:history` dão à Forja uma identidade de agente
persistente com reputação derivada de comportamento real (nunca auto-declarada) — base para, no
futuro, `PolicyEngine` e `forja engineer` considerarem "este agente já provou que lida bem com este
tipo de mudança" em vez de tratar todo agente como desconhecido a cada run.

## 3. User stories

- **Como** governance, **quero** ver o histórico de confiabilidade de um agente antes de ampliar
  sua autonomia, **para que** a decisão seja baseada em comportamento real, não em confiança cega.
- **Como** desenvolvedor operando múltiplos agentes/projetos, **quero** `agent:list` mostrando quem
  são os agentes registrados e seu nível de confiança atual, **para que** eu saiba a quem atribuir
  o quê sem adivinhar.
- **Como** sdd-architect, **quero** que `trustLevel` seja sempre derivado de `Observation`s reais
  (nunca um campo que alguém simplesmente edita), **para que** reputação não vire teatro.

## 4. Critérios de aceite (Definition of Done)

- [x] AC-1: `AgentProfile2` (extensão aditiva de `packages/contracts`, `AgentIdentity` continua
      existindo sem mudança) é persistido via `SqliteAgentProfileStore` (reaproveita
      `SqliteJsonRepository`/`forja_records` já existente — **sem** migration nova, revisado em
      D3 do plan) — `role`/`provider`/`model`/`capabilities`/`architectureDomains`/`limits` são
      dados de registro; `trustLevel`/`autonomyLevel` **nunca** aceitos em `agent:register` — só
      escritos por `agent:score`.
- [x] AC-2: `computeReputationScore` (função pura, `packages/engineering/identity`) recebe um
      `EvaluationReport` (já produzido por `EvaluationEngine`, reaproveitado sem reimplementar) e
      devolve `AgentReputationScore` — `trustLevel` 0-5, `confidence` proporcional ao tamanho da
      amostra (`observationCount`), nunca escondida.
- [x] AC-3: sem amostra suficiente (cold start, `observationCount` abaixo de um mínimo
      configurável), `autonomyLevel` cai para `human_in_the_loop` por padrão — fail-closed em
      ambiguidade (mesmo princípio já usado em Architecture Constitution/Risk Engine), nunca
      `autonomous` por falta de dado.
- [x] AC-4: `forja agent:register/:list/:show/:score [--domain <d>]/:history` funcionais;
      `agent:score` persiste o `trustLevel`/`autonomyLevel` calculado de volta no profile (cache
      da última pontuação, não fonte de verdade paralela — a fonte de verdade continua sendo os
      `Observation`s).
- [x] AC-5: nenhum comando/contrato existente muda de assinatura; `PolicyEngine`/`RuntimeEngine`
      continuam funcionando com `AgentIdentity` efêmero exatamente como hoje — este sprint não
      acopla nada a `AgentProfile2` ainda (ver §5, Smart Routing/Policy fica para spec própria).

## 5. Escopo

**Dentro**: `AgentProfile2` + persistência; `computeReputationScore` (motor puro); CLI
`agent:register/list/show/score/history`.

**Fora** (spec própria quando chegar a vez, mesmo princípio de escopo já usado em SPEC-031 §5 —
"fases seguintes exigem spec própria, não emenda desta"):
- Smart Agent Routing (estender `scripts/llm-fit.ts`/`llm:recommend` com dados de reputação) — a
  visão original agrupa isso na mesma Fase 3, mas é consumo do que esta spec produz, não parte de
  produzir; melhor com `AgentReputationScore` já rodando contra dado real primeiro.
- `PolicyEngine`/`forja engineer` passarem a *consultar* `trustLevel`/`AgentReputationScore`
  automaticamente — mesmo raciocínio de SPEC-034 D3 (score é informação, não decisão automática) e
  mesmo motivo de não estar aqui: consumo depende deste sprint já estar em produção.
- Agent Runtime Monitoring / Behavior Anomaly Engine (Fase 5 da visão original) — comportamento
  *durante* um run, não identidade/reputação entre runs.

## 6. NFRs / restrições

- Determinístico: `computeReputationScore` é uma função pura sobre métricas já calculadas por
  `EvaluationEngine` — nenhuma chamada de LLM em nenhum ponto.
- Fail-closed: amostra insuficiente nunca produz `autonomous` (AC-3).
- `trustLevel` nunca é um campo editável por humano ou agente — só `agent:score` escreve nele, e só
  com o valor que `computeReputationScore` calculou.

## 7. Riscos e mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Reputação virar gate automático de autonomia sem revisão humana | Média (é a tentação óbvia) | Alta (agente ruim ganha mais autonomia sozinho) | Este sprint não conecta `trustLevel` a nenhuma decisão de `PolicyEngine` — é só leitura/consulta (§5, "Fora") |
| Cold start: agente novo sem `Observation` | Alta em projetos novos ou agentes recém-registrados | Baixa (esperado) | AC-3: fail-closed pra `human_in_the_loop`, `confidence` baixa declarada, nunca escondida |
| `AgentProfile2` divergir de `AgentIdentity` (dois conceitos de "quem é o agente") | Baixa se documentado | Média | `AgentIdentity` continua sendo o tipo usado em `PolicyRequest`/`RuntimeRun` (efêmero, por run); `AgentProfile2` é o registro persistente — dois papéis diferentes, não dois conceitos concorrentes; nota explícita no código |

## 8. Métricas de sucesso

Registrar pelo menos 1 agente real usado nesta sessão de desenvolvimento (`apk`/o agente que
implementou os Sprints 1-3), rodar `agent:score` contra os `Observation`s reais já persistidos (se
existirem neste workspace) ou contra uma amostra sintética documentada como tal, e confirmar que o
score reflete corretamente sucesso/retrabalho — revisão humana, mesma metodologia usada em SPEC-034
§8.

**Validado**: workspace de desenvolvimento não acumulou `Observation`s reais suficientes ainda
(`sync:universal`/runtime real não foi exercitado neste ambiente sandboxado) — validado com amostra
sintética documentada como tal (`test/agent-cli.test.js`, 4 sucessos + 1 falha com rollback):
`trustLevel` saiu 4/5 (80% de sucesso, 1 rollback em 5) — ordena corretamente entre o caso "0
Observation" (0/5) e o caso "100% sucesso" (5/5), ambos também cobertos nos testes unitários do
motor puro. Revalidar com dado real assim que este workspace acumular `Observation`s de verdade.

**Achado real corrigido durante a implementação (não adiado)**: a primeira execução de
`agent:score` contra um agente recém-registrado, **zero** `Observation`, devolveu `trustLevel 3/5`
— um número "neutro" que sugeria confiabilidade moderada sem nenhuma evidência por trás.
`EvaluationEngine.rate()` devolve `0` (não `undefined`) pra toda métrica quando não há dado, e a
fórmula original lia `reworkRate`/`rollbackRate`/`assertionsWithoutEvidenceRate` zerados como "bom
sinal" — 3/5 do nada. Corrigido em `packages/engineering/identity`: `sampleSize === 0` agora força
`trustLevel: 0` antes mesmo de aplicar a fórmula, com teste unitário e de CLI cobrindo o caso.
`autonomyLevel` já caía corretamente pra `human_in_the_loop` via AC-3 mesmo antes da correção — só
o número exibido é que mentia.
