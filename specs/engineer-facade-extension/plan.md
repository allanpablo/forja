# Plan: `forja engineer` — compor recomendação de agente + incidentes parecidos

- **Spec**: ./spec.md
- **Status**: approved
- **Criado em**: 2026-09-01

## 1. Abordagem técnica

`rankIncidentsByQuery`/`incidentRecords`/`titleOf` (hoje locais a `scripts/incident.ts`) mudam pra
`lib/core/incident-search.ts` — **não** ficam exportadas de `scripts/incident.ts` (revisado durante
a implementação, D3): um script tem `main()` executado incondicionalmente ao ser importado (mesmo
padrão de todo `scripts/*.ts` deste repositório), então `scripts/engineer.ts` importando de
`scripts/incident.ts` rodaria o `main()` de `incident.ts` como efeito colateral, processando o
`argv` de `engineer` como se fosse de `incident`. `lib/core/risk-collect.ts` já resolveu exatamente
esse problema pra `risk`/`engineer`/`simulate` — mesma solução aqui. `scripts/incident.ts` passa a
*importar* de `lib/core/incident-search.ts`, não a exportar pra ele.

`scripts/engineer.ts` importa as três funções + `recommendAgent`/`SqliteAgentProfileStore` (já
usados em `scripts/agent.ts`, agora também aqui) e adiciona duas seções ao `EngineerReport`.

## 2. Módulos afetados

| Caminho | Mudança | Risco |
|---|---|---|
| `lib/core/incident-search.ts` (novo) | `rankIncidentsByQuery`/`incidentRecords`/`titleOf`, extraídas de `scripts/incident.ts` | Baixo — mesmo padrão já usado por `risk-collect.ts` |
| `scripts/incident.ts` | passa a importar de `lib/core/incident-search.ts` em vez de definir localmente — comportamento idêntico (refactor puro) | Baixo |
| `scripts/engineer.ts` | `--role <role>` novo flag; 2 seções novas no relatório | Baixo — só composição |
| `test/incident-cli.test.js` | nenhuma mudança esperada (comportamento de `incident:similar` idêntico) | — |
| `test/engineer-cli.test.js` | +testes das 2 seções novas | — |

## 3. Contratos

```ts
// lib/core/incident-search.ts
export interface RankedIncident { readonly record: GraphNode; readonly relevance: number; }
export function rankIncidentsByQuery(records: readonly GraphNode[], query: string): readonly RankedIncident[];
export function incidentRecords(store: SqliteGraphStore): readonly GraphNode[];
export function titleOf(node: GraphNode): string;
```

```bash
engineer "<objetivo>" [--ref <ref>] [--role <role>] [--json]
```

`EngineerReport` ganha:
```ts
readonly recommendedAgents?: readonly { readonly agentId: string; readonly score: number; readonly reasons: readonly string[] }[]; // só com --role
readonly similarIncidents: readonly { readonly id: string; readonly title: string; readonly relevance: number }[]; // sempre presente, [] se vazio
```

## 4. Decisões

**D1**: seção de incidentes usa o **objetivo inteiro** como busca (mesmo texto livre já usado por
`ContextEngine.build`/`GraphLoop.contextRecords` na mesma função) — não um `--query` separado, pra
não multiplicar flags sem necessidade real; o objetivo já É a busca mais natural.

**D2**: `rankIncidentsByQuery` extraída sem alterar `incident:similar` de comportamento — mesmo
teste de CLI (`test/incident-cli.test.js`) continua valendo como prova de regressão do refactor.

**D3** (revisada durante a implementação): a extração vai pra `lib/core/incident-search.ts`, não
fica exportada de `scripts/incident.ts` como a primeira versão deste plan previa — ver §1, motivo
completo é o mesmo já documentado no cabeçalho do próprio arquivo novo.

## 5. Rollout

Sem migração, sem feature flag.

## 6. Kill criteria

Já coberto pelo princípio geral — se as duas seções novas não ajudarem na prática (§8), removê-las
é mais barato que mantê-las: nenhuma outra spec depende delas.
