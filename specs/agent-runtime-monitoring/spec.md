# Spec: Agent Runtime Monitoring / Behavior Anomaly Engine

- **ID**: SPEC-040
- **Status**: done
- **Owner**: apk
- **Criado em**: 2026-09-01
- **Sprint alvo**: Sprint 8 (fecha a Fase 5 da visão original, junto de SPEC-039)
- **ADRs relacionadas**: ADR-0078; depende de `packages/evals.EvaluationEngine` (reaproveitado),
  `packages/policy` (extensão aditiva, mesmo padrão de SPEC-034 `riskScoreRange`)

> Gap analysis original (`docs/architecture/...` §3): "Não existe. `PolicyEngine` já é o lugar
> certo pra acoplar (política decide, não o LLM) — Construir, mas *dentro* de Policy, não paralelo."
> Interpretação (mesma resolvida em SPEC-034 D3 pra risco): "dentro de Policy" não significa o
> cálculo morar em `packages/policy` — significa que a **decisão** continua sendo do
> `PolicyEngine`/humano, nunca de um motor de anomalia paralelo. O cálculo é um pacote separado
> (mesmo padrão de `RiskEngine`), e `PolicyRequest` ganha um campo `number` opcional pra consultá-lo
> — exatamente a forma que `riskScoreRange`/`riskScore` já tomaram em SPEC-034.

## 1. Problema

Nada compara o comportamento **recente** de um agente contra sua própria linha de base — um agente
que de repente começa a falhar mais, gastar mais, ou tocar categorias diferentes de arquivo não
gera nenhum sinal. `EvaluationEngine` já calcula as taxas certas por escopo, mas só olha pra um
recorte de dado por vez, nunca compara dois recortes (linha de base vs. recente).

## 2. Proposta de valor

`forja agent:monitor <id> [--window-hours <n>]` compara os `Observation`s recentes de um agente
contra sua linha de base histórica e reporta um `AnomalyAssessment` com sinais nomeados — nunca um
alarme sem explicação, mesmo princípio de `RiskEngine`/`AgentReputationScore`.

## 3. User stories

- **Como** governance, **quero** saber quando o comportamento recente de um agente se desvia do
  histórico dele, **para que** eu investigue antes que o desvio vire um incidente.

## 4. Critérios de aceite (Definition of Done)

- [x] AC-1: `detectAnomaly` (função pura, `packages/engineering/monitoring`) recebe dois
      `EvaluationReport` (linha de base + recente, ambos já produzidos por `EvaluationEngine`,
      reaproveitado sem reimplementar nenhuma métrica) e devolve `AnomalyAssessment` — `score`
      0-100, `signals[]` nomeados (quais métricas desviaram e por quanto), nunca um score sem
      explicação.
- [x] AC-2: amostra insuficiente em qualquer um dos dois recortes (linha de base ou recente) marca
      `confidence` baixa explicitamente — fail-closed/honesto, mesmo princípio de
      `AgentReputationScore`/SPEC-036 AC-3, nunca reporta anomalia alta por falta de dado.
- [x] AC-3: `forja agent:monitor <id> [--window-hours <n>]` (CLI) — linha de base = todo o histórico
      anterior à janela; recente = últimas `n` horas (default configurável). Reaproveita
      `SqliteObservationStore` (já existente).
- [x] AC-4: `PolicyScope.anomalyScoreRange`/`PolicyRequest.anomalyScore` (extensão aditiva de
      `packages/policy`, mesmo padrão exato de `riskScoreRange`/`riskScore` em SPEC-034) —
      `packages/policy` nunca importa `packages/engineering/monitoring`; quem calcula o score chama
      `detectAnomaly` antes de montar o `PolicyRequest`, exatamente como já acontece com risco.
- [x] AC-5: nenhuma aplicação automática — `agent:monitor` nunca chama `PolicyEngine`/bloqueia
      nada sozinho; é leitura, mesmo princípio de `RiskEngine` D3.

## 5. Escopo

**Dentro**: `detectAnomaly` (motor puro); `agent:monitor` (CLI); extensão aditiva de
`packages/policy` (campo `number`, não motor paralelo).

**Fora**: qualquer regra de política real usando `anomalyScoreRange` neste sprint (só a capacidade
estrutural, mesmo raciocínio de `riskScoreRange` em SPEC-034 — não é este sprint que decide
*quando* pausar um agente, só habilita que uma regra futura possa); alertas/notificação automática
(fica pra quando houver um canal real de notificação, fora de escopo desta fundação); detecção via
ML/estatística avançada (comparação de taxa determinística e documentada é suficiente e verificável
— mesmo princípio de "determinístico antes de LLM" já estabelecido em toda a fundação).

## 6. NFRs / restrições

- Determinístico — nenhum LLM/ML em nenhum ponto; fórmula documentada em código e aqui.
- Fail-closed: amostra insuficiente nunca produz confiança alta (AC-2).
- Zero migration SQLite nova.

## 7. Riscos e mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Anomalia virar bloqueio automático de agente | Baixa (mesmo padrão já seguido em Risk/Reputation) | Alta se acontecesse | AC-5 explícito; nenhuma regra de política usando o campo é criada nesta spec (§5 "Fora") |
| Falso positivo por baixa amostra em qualquer um dos dois recortes | Média em agentes novos/pouco usados | Média (alarme sem sentido) | AC-2: confidence baixa declarada, não escondida |

## 8. Métricas de sucesso

Comparar dois recortes sintéticos documentados como tais (um com comportamento estável, outro com
degradação clara — ex.: `successRate` caindo de 90% pra 30%) e confirmar que `detectAnomaly` sinaliza
a anomalia com os `signals[]` corretos — revisão humana, mesma metodologia das specs anteriores.

**Validado** (`test/agent-cli.test.js`): amostra sintética documentada como tal (10 `Observation`s
de linha de base com 90% de sucesso, 10 recentes com 30%) — `agent:monitor` reportou o `signal`
`successRate: 0.90 → 0.30`, score de anomalia > 0, nunca acionou `PolicyEngine`/bloqueio algum. Caso
de zero `Observation` reporta corretamente score 0 (sem degradação sem dado, não um alarme
por falta de dado — mesma honestidade de AC-2/`AgentReputationScore`).
