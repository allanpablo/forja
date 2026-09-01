# ADR-0079: Autonomous Maintenance — postura de prontidão, sem habilitação automática

- **Status**: accepted
- **Data**: 2026-09-01
- **Autor(es)**: apk
- **Tags**: engineering-control-plane, policy, autonomy, sdd

## Contexto

A visão original do ForjaJS 3.0 lista "Autonomous Maintenance" (Fase 7) como a fase final do
roadmap de 33 features, com uma instrução explícita: "só arquitetura preparatória, nunca habilitação
automática". Os Sprints 1-9 (SPEC-032 a SPEC-041, ADR-0078) já entregaram, de forma independente e
cada um com sua própria evidência real, todos os componentes que uma decisão de manutenção autônoma
precisaria consultar:

- **Risco** (`RiskEngine`/`assessRisk`, SPEC-034) — score 0-100 explicável de uma mudança.
- **Arquitetura** (`checkConstitution`, SPEC-033) — se a mudança viola uma regra derivada de ADR.
- **Reputação do agente** (`computeReputationScore`, SPEC-036) — confiabilidade derivada de
  comportamento real, nunca auto-declarada.
- **Recomendação de agente** (`recommendAgent`, SPEC-037) — adequação de um agente a um papel.
- **Simulação preditiva** (`forja simulate`, SPEC-038) — teste+arquitetura+risco num worktree
  isolado, com recomendação `promote`/`review`/`discard`.
- **Proveniência** (`extractProvenance`, SPEC-039) — quem/qual agente produziu um arquivo.
- **Anomalia de comportamento** (`detectAnomaly`, SPEC-040) — desvio do comportamento recente de um
  agente contra sua própria linha de base.
- **Incidentes e sugestão por similaridade** (`incident:similar`, SPEC-041) — conhecimento
  reconsultável de problemas passados.

Todos os seis primeiros já têm um ponto de integração real e testado com `PolicyEngine`: `RiskLevel`
(nativo), `riskScoreRange`/`riskScore` (SPEC-034), `anomalyScoreRange`/`anomalyScore` (SPEC-040) —
sempre como `number` puro que uma regra de política pode consultar, nunca como um motor de decisão
paralelo (mesmo princípio repetido em toda a fundação, D3 de SPEC-034).

O que falta pra "Autonomous Maintenance" de verdade — um agente detectar um problema, corrigi-lo e
promover a correção **sem** aprovação humana — não é mais peças de dado. É a composição de tudo
isso numa decisão de política real que permita `ALLOW`/`ALLOW_WITH_LIMITS` sem `REQUIRE_APPROVAL`
mesmo em cenários de risco não-trivial. Essa é exatamente a linha que a visão original pede pra não
cruzar ainda.

## Decisão

**Fase 7 fica em prontidão arquitetural, não em implementação.** Nenhuma regra de `PolicyEngine`
neste repositório usa `riskScoreRange`/`anomalyScoreRange` pra conceder `ALLOW`/`ALLOW_WITH_LIMITS`
sem aprovação — as duas capacidades existem (SPEC-034, SPEC-040) e são consultáveis, mas nenhuma
regra real as conecta a uma autonomia maior. Compor os sinais já existentes num fluxo de decisão é
trabalho de composição pura (nenhum motor novo, mesmo padrão de `forja engineer`/`forja simulate`),
mas a regra de política que permitiria a aplicação automática de uma correção **exige aprovação
humana explícita antes de existir**, não só antes de rodar.

Guardrails que qualquer spec futura de "Autonomous Maintenance" real precisa manter, sem exceção
(cada um já é um princípio já seguido em alguma spec anterior, não uma invenção desta ADR):

1. **Fail-closed em ambiguidade** — dado insuficiente (confidence baixa em qualquer um dos sete
   sinais acima) nunca vira permissão, sempre vira `REQUIRE_APPROVAL`/`human_in_the_loop` (mesmo
   princípio de AC-3 de SPEC-036, AC-2 de SPEC-040).
2. **Nenhum motor de decisão paralelo** — a decisão de aplicar ou não uma correção continua sendo
   do `PolicyEngine` (regras existentes, aditivas), nunca de um "orquestrador de manutenção" que
   decide por fora da política (mesmo princípio já resolvido pra risco/anomalia, D3 de SPEC-034).
3. **Simulação antes de qualquer promoção real** — `forja simulate` (SPEC-038) já prova que testar
   uma mudança num worktree isolado antes de decidir é viável e rápido; nenhuma correção autônoma
   deveria pular essa etapa, mesmo com todos os sinais favoráveis.
4. **Reversibilidade obrigatória** — qualquer aplicação automática precisa de um caminho de
   rollback real (`SandboxEngine.rollback`, já existente) testado antes de a regra existir, não
   depois do primeiro incidente.
5. **Nenhum LLM como fonte de verdade de decisão crítica** — os sete sinais acima são todos
   determinísticos; se uma spec futura quiser LLM em algum ponto do fluxo, ele entra como sugestão
   revisável (`status: 'proposed'`, `confidence < 1`), nunca como regra `active`/decisão automática
   — mesmo padrão já estabelecido em `architecture:compile` (SPEC-033) e em toda a fundação.
6. **Auditoria completa e correlacionável** — `AuditRecord`/`Evidence`/`ProvenanceRecord`
   (SPEC-039) já dão o rastro; qualquer aplicação automática precisa gravar evidência suficiente
   pra reconstruir "por que o sistema decidiu isso" sem depender de memória humana.

## Alternativas consideradas

- **Implementar uma regra de política real que já habilita alguma forma de auto-aplicação de baixo
  risco** (ex.: só para mudanças com `riskScore` muito baixo e `trustLevel` muito alto) — rejeitada
  porque cruzaria exatamente a linha que a visão original pede pra não cruzar nesta fase ("nunca
  habilitação automática"), e porque este workspace não acumulou dado real suficiente (histórico de
  `Observation`/incidentes) pra validar que os limiares escolhidos seriam seguros na prática, não só
  em teoria.
- **Não escrever nada pra Fase 7** — rejeitada porque a visão original pede explicitamente
  "arquitetar o caminho" mesmo sem habilitar; documentar os guardrails agora, enquanto o desenho de
  cada peça está fresco, é mais barato e mais correto do que reconstruir esse raciocínio do zero
  quando (e se) uma spec futura decidir implementar de verdade.

## Consequências

**Positivas**:
- Fecha o roadmap de 33 features da visão original ForjaJS 3.0 até onde é honestamente
  implementável neste workspace — nada fica "esquecido", cada item tem uma decisão explícita
  (implementado, ou por que não).
- Qualquer spec futura de manutenção autônoma real começa com os guardrails já escritos, em vez de
  precisar redescobri-los.

**Negativas / Trade-offs**:
- Nenhuma automação de manutenção acontece a partir desta ADR — é puramente preparatório, por
  desenho explícito da visão original, não uma limitação técnica.

## Rastreamento
- Implementação: nenhuma (ADR de prontidão/prep — sem código associado, por desenho)
- Specs relacionadas: SPEC-032 a SPEC-041 (todos os componentes compostos aqui)
- ADRs relacionadas: ADR-0078 (decisão estrutural 3.0), ADR-0020 (domínio puro de `packages/policy`)
