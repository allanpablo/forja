# Plan: Agent Identity & Reputation

- **Spec**: ./spec.md
- **Status**: approved
- **Criado em**: 2026-09-01

## 1. Abordagem técnica

Novo sub-domínio `packages/engineering/identity` (autorizado por ADR-0078), puro domínio: só
`computeReputationScore`, uma função que recebe um `EvaluationReport` (já produzido por
`packages/evals.EvaluationEngine`, reaproveitado sem reimplementar nenhuma métrica) e devolve um
`AgentReputationScore`. Persistência de `AgentProfile2` **não precisa de migration nova** —
`packages/adapter-sqlite` já tem `SqliteJsonRepository` (tabela genérica `forja_records`,
`collection`+`id`+`payload`) usada por `SqliteRuntimeRunStore`/`RuntimePersistence`; um
`SqliteAgentProfileStore` fino por cima dela (mesmo padrão) é só mais uma `collection`.

## 2. Módulos afetados

| Caminho | Mudança | Risco |
|---|---|---|
| `packages/contracts/src/index.ts` | `AgentProfile2` novo (aditivo — `AgentIdentity` intocado) | Baixo |
| `packages/engineering/identity/src/index.ts` | novo — `computeReputationScore`, thresholds default | Médio — lógica nova, mas pura/testável |
| `packages/adapter-sqlite/src/index.ts` | `SqliteAgentProfileStore` novo (reaproveita `SqliteJsonRepository`, sem migration nova) | Baixo |
| `scripts/agent.ts` | novo — `agent:register/list/show/score/history` | Médio — I/O fino sobre engine puro + stores já existentes |
| `lib/core/registry.ts` | 5 comandos novos | Baixo |
| `test/agent-identity-reputation.test.js` (novo) | testes puros de `computeReputationScore` | — |
| `test/agent-cli.test.js` (novo) | fixture isolada, CLI ponta a ponta | — |

## 3. Diagrama de fluxo

```text
agent:register <id> --role ... ──► SqliteAgentProfileStore.save (sem trustLevel/autonomyLevel)
                                              │
agent:score <id> [--domain <d>]              │
        │                                    │
        ├─► SqliteObservationStore.list() filtrado por agentId (+ capabilityId===domain)
        │             │
        │             ▼
        ├─► EvaluationEngine.evaluate({scope:'agent', scopeId, observations}) [já existente]
        │             │
        │             ▼
        └─► computeReputationScore(report) [packages/engineering/identity, puro]
                      │
                      ▼
              AgentReputationScore (trustLevel, autonomyLevel, confidence, evidenceIds)
                      │
                      ▼
        SqliteAgentProfileStore.save (profile + trustLevel/autonomyLevel/lastScoredAt)
```

## 4. Contratos (API/CLI/Schema)

```ts
// packages/contracts/src/index.ts — aditivo
export interface AgentProfile2 extends AuditFields {
  readonly id: EntityId;
  readonly role: string;
  readonly provider?: string;
  readonly model?: string;
  readonly capabilities: readonly string[];
  readonly architectureDomains: readonly string[];
  readonly limits?: { readonly maxFiles?: number; readonly maxCostUsd?: number; readonly maxDurationMs?: number };
  // Só escritos por `agent:score` (via computeReputationScore) — nunca aceitos em `agent:register`.
  readonly trustLevel?: number;          // 0-5
  readonly autonomyLevel?: 'autonomous' | 'autonomous_with_review' | 'supervised' | 'human_in_the_loop';
  readonly lastScoredAt?: ISO8601;
}

// packages/engineering/identity/src/index.ts
export interface AgentReputationScore {
  readonly agentId: string;
  readonly domain?: string;
  readonly trustLevel: number;
  readonly autonomyLevel: 'autonomous' | 'autonomous_with_review' | 'supervised' | 'human_in_the_loop';
  readonly confidence: number;
  readonly sampleSize: number;
  readonly metrics: Readonly<Record<string, number>>;
  readonly evidenceIds: readonly string[];
}
export interface ReputationThresholds { readonly minSampleSize: number; readonly autonomous: number; readonly autonomousWithReview: number; readonly supervised: number; }
export const DEFAULT_REPUTATION_THRESHOLDS: ReputationThresholds; // minSampleSize:5, autonomous:4, autonomousWithReview:3, supervised:1 (escala 0-5)
export function computeReputationScore(report: EvaluationReport, meta: { agentId: string; domain?: string; thresholds?: ReputationThresholds }): AgentReputationScore;
```

```bash
agent:register <id> --role <role> [--provider <p>] [--model <m>] [--capabilities <c1,c2>] [--domains <d1,d2>]
agent:list
agent:show <id>
agent:score <id> [--domain <d>]
agent:history <id>
```

## 5. Decisões e alternativas

**D1**: `trustLevel` 0-5, fórmula fixa a partir das métricas que `EvaluationEngine` já calcula —
`0.5·successRate + 0.2·(1-reworkRate) + 0.2·(1-rollbackRate) + 0.1·(1-assertionsWithoutEvidenceRate)`,
arredondado pra 0-5. Pesos documentados aqui e no código (mesmo princípio de RiskEngine, SPEC-034)
— nunca "número mágico". Revisitar se dado real mostrar que os pesos não fazem sentido (mesmo kill
criteria de RiskEngine).

**D2**: `agent:register` **não aceita** `--trust-level`/`--autonomy-level` como flag — não é
validação em runtime, é ausência da opção na CLI. Único jeito de `trustLevel` mudar é
`computeReputationScore` via `agent:score`. Alternativa rejeitada: aceitar e validar contra
"não pode ser setado à mão" — mais frágil (alguém pode enganar a validação) que simplesmente nunca
expor o caminho.

**D3**: sem `SqliteAgentProfileStore` novo com migration própria — reaproveita
`SqliteJsonRepository`/`forja_records` (mesmo padrão de `SqliteRuntimeRunStore`). Zero migration
nova nesta spec inteira.

**D4**: `domain` (do `AgentReputationService.score(agentId, domain?)` do doc de arquitetura) mapeia
pra um filtro por `Observation.capabilityId` — não é um campo novo em `EvaluationScope` (que já tem
`'capability'` como scope próprio, mas isso filtraria SÓ por capability, perdendo o filtro por
agente ao mesmo tempo). Filtro duplo (agentId E capabilityId) é feito no adapter antes de chamar
`EvaluationEngine.evaluate({observations: <já filtrado>})` — `EvaluationEngine` já aceita
`observations` pré-filtrado exatamente pra esse caso (parâmetro existente, não uma mudança).

## 6. Dependências

- `packages/evals.EvaluationEngine` (já existente) — não reimplementado, só consumido.
- `packages/adapter-sqlite.SqliteObservationStore`/`SqliteJsonRepository` (já existentes).

## 7. Rollout

- [ ] Feature flag necessária? Não — comandos novos, opt-in por natureza.
- [ ] Migração de dados existentes? Não (D3).
- [ ] Doc/persona impactada? README (comandos novos).

## 8. Sinais de fracasso (kill criteria)

Se `agent:score` sobre dado real (ou amostra sintética documentada, §8 do spec) não corresponder a
julgamento humano de confiabilidade, os pesos de D1 são revisados antes de qualquer spec futura
conectar `trustLevel` a decisão de política (§5 "Fora" desta spec, explicitamente adiado).
