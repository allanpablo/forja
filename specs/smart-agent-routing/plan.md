# Plan: Smart Agent Routing

- **Spec**: ./spec.md
- **Status**: approved
- **Criado em**: 2026-09-01

## 1. Abordagem técnica

Extensão de `packages/engineering/identity` (mesmo pacote de SPEC-036, não um novo sub-domínio):
`recommendAgent(profiles, criteria)`, função pura, mesmo estilo de `recommendProfile`
(`packages/llm`) — soma pontos por critério casado, nunca esconde o porquê. `scripts/agent.ts`
ganha `agent:recommend`, reaproveitando `SqliteAgentProfileStore.list()` já existente.

## 2. Módulos afetados

| Caminho | Mudança | Risco |
|---|---|---|
| `packages/engineering/identity/src/index.ts` | `recommendAgent` novo | Baixo — função pura pequena |
| `scripts/agent.ts` | `agent:recommend` novo subcomando | Baixo |
| `lib/core/registry.ts` | 1 comando novo | Baixo |
| `test/agent-identity-reputation.test.js` | testes unitários de `recommendAgent` | — |
| `test/agent-cli.test.js` | teste de CLI de `agent:recommend` | — |

## 3. Contratos

```ts
// packages/engineering/identity/src/index.ts
export interface AgentRecommendation { readonly agentId: string; readonly score: number; readonly reasons: readonly string[]; }
export function recommendAgent(profiles: readonly AgentProfile2[], criteria: { readonly role: string; readonly domain?: string }): readonly AgentRecommendation[];
```

Fórmula (D1): `score = (role === criteria.role ? 100 : 0) + (domain casado em architectureDomains ?
50 : 0) + (trustLevel ?? 0) * 10` (0-50). Pesos documentados aqui e no código — mesmo princípio de
`computeReputationScore`/`RiskEngine`. Sem `trustLevel`, o termo de reputação é 0 (não excluído do
ranking, AC-2) e o motivo declara "sem pontuação ainda".

```bash
agent:recommend --role <role> [--domain <d>]
```

## 4. Decisões

**D1**: pesos 100/50/(0-50) espelham a proporção já usada em `recommendProfile` (100 pro papel, 50
pra tarefa/domínio) — reaproveita a mesma "linguagem de score" em vez de inventar uma nova escala,
mais fácil de comparar mentalmente entre os dois comandos irmãos.

## 5. Rollout

Sem migração, sem feature flag — comando novo, opt-in por natureza.

## 6. Kill criteria

Já coberto pelo mesmo princípio de SPEC-034/036: se o ranking não corresponder a julgamento humano
sobre dado real, os pesos de D1 são revisados antes de qualquer consumo automático (§5 do spec,
"Fora").
