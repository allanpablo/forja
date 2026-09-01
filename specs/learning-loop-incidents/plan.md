# Plan: Learning Loop — Registro de Incidentes + Sugestão por Similaridade

- **Spec**: ./spec.md
- **Status**: approved
- **Criado em**: 2026-09-01

## 1. Abordagem técnica

Nenhum pacote novo em `packages/engineering` — `GraphNode.type` já é vocabulário livre e
`GraphLoop.upsertNode`/`addEvidence` já fazem tudo que o registro precisa. `scripts/incident.ts` é
puramente um adapter: grava um nó `Incident` + evidência via `GraphLoop` (mesmo `SqliteGraphStore`
compartilhado de `adr:*`/`architecture:*`), e implementa o matching por palavra-chave de
`incident:similar` diretamente (função pequena e local, não uma dependência de
`GraphLoop.contextRecords` — D1).

## 2. Módulos afetados

| Caminho | Mudança | Risco |
|---|---|---|
| `scripts/incident.ts` | novo — `incident:record`/`:list`/`:similar` | Baixo — composição de `GraphLoop` já existente |
| `lib/core/registry.ts` | 3 comandos novos | Baixo |
| `test/incident-cli.test.js` (novo) | fixture isolada, ciclo completo | — |

## 3. Contratos

```bash
incident:record --title <t> [--description <d>]
incident:list
incident:similar "<busca>"
```

## 4. Decisões

**D1**: `incident:similar` implementa seu próprio matching por palavra-chave local (mesmo estilo de
`GraphLoop.contextRecords`: normaliza pra minúsculo, quebra em termos, conta sobreposição,
`relevance = matches / totalTerms`), em vez de reaproveitar `contextRecords` diretamente.
`contextRecords` casa contra **arestas** (`from.label + type + to.label`); nós `Incident` desta
versão não têm aresta nenhuma (§5 do spec, "Fora" — linkagem fica pra depois), então
`contextRecords` nunca encontraria um nó sem aresta. Reimplementar o mesmo *estilo* de matching
sobre nós (não arestas) é a única forma de a busca funcionar nesta versão, sem duplicar a lógica de
extração de relação que `contextRecords` de fato tem (essa parte não é copiada, só o padrão de
scoring por sobreposição de termos, que é trivial e não vale abstrair numa função compartilhada por
uma linha de código).

**D2**: `Incident.label` carrega `título + '\n' + descrição` concatenados (não um campo separado —
`GraphNodeSpec` não tem campo de descrição livre além de `label`). Alternativa considerada: guardar
a descrição como uma segunda `Evidence`/nota — rejeitada por adicionar uma peça de dado sem
necessidade real nesta versão mínima; `label` já é uma string livre, suficiente pro matching de
AC-3.

## 5. Rollout

Sem migração, sem feature flag.

## 6. Kill criteria

Já coberto pelo mesmo princípio das specs anteriores — se `incident:similar` não corresponder a
julgamento humano sobre os incidentes de teste, o scoring é revisado antes de qualquer extensão
futura (linkagem de grafo, cross-project).
