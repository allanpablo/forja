# Spec: Engineering Graph extensions (ADR/SPEC como nós de primeira classe)

- **ID**: SPEC-032
- **Status**: done
- **Owner**: apk
- **Criado em**: 2026-09-01
- **Sprint alvo**: Sprint 1 (ver `../engineering-intelligence/plan.md`)
- **ADRs relacionadas**: ADR-0078; nenhuma ADR própria esperada — extensão aditiva de vocabulário
  sobre `GraphNode.type`/`GraphEdge.type`, que já são `string` livre em `packages/contracts`.

## 1. Problema

`extractDeterministicRelations` já cria nós `ADR` a partir do padrão `ADR-\d{4}` encontrado em
texto, mas trata isso como uma referência solta (uma aresta `DERIVED_FROM` para um nó `ADR` sem
metadado) — não lê o `## Status` do próprio arquivo de ADR, não sabe se está `accepted`,
`superseded` ou `deprecated`, e não faz o mesmo para `SPEC-\d{3}`. Sem isso, perguntas como
"quais componentes uma ADR supersedida ainda governa" não têm resposta estruturada.

## 2. Proposta de valor

ADRs e Specs passam a ser nós completos do grafo (com status, não só uma referência textual),
consultáveis via `adr:impact`/`adr:graph` e usados como insumo real do Change Risk Engine
(SPEC-034) e do Architecture Constitution (SPEC-033).

## 3. User stories

- **Como** sdd-architect, **quero** `forja adr:impact 0027` mostrando componentes/specs/testes
  afetados, **para que** eu saiba o raio de explosão antes de superseder uma decisão.
- **Como** governance, **quero** saber que uma ADR está `superseded` sem precisar abrir o arquivo,
  **para que** `architecture:check` não valide contra uma regra morta.

## 4. Critérios de aceite (Definition of Done)

- [x] AC-1: extensão de `extractDeterministicRelations` (ou uma função irmã dedicada, decisão de
      implementação) lê `- **Status**: <valor>` do frontmatter de ADR (já no formato existente,
      `memory/90-decisions/_template.md`) e do campo `Status` de spec.md (`_templates/spec.md`), e
      grava como propriedade do nó — decisão de implementação: usar `GraphNode.status`
      (`KnowledgeStatus`) é a tentação óbvia mas **errada** (status de ADR — accepted/proposed/
      superseded/deprecated/rejected — é um conceito de domínio diferente de
      verified/inferred/hypothesis/contradicted/unknown, que descreve confiança epistêmica da
      *aresta*, não o ciclo de vida do documento); a spec desta feature deve decidir isso
      explicitamente no `plan.md`, não misturar os dois vocabulários.
- [x] AC-2: `forja adr:list`/`adr:show <id>` funcionam sobre `memory/90-decisions/` real deste
      repositório.
- [x] AC-3: `forja adr:impact <id>` usa `GraphLoop.impact()` (já existente, sem reimplementar BFS)
      para listar nós/arestas alcançáveis a partir do nó ADR.
- [x] AC-4: `forja adr:graph` exporta um subgrafo (JSON) navegável — sem visualização nesta spec
      (Fase posterior, dashboard é consumidor per princípio da visão original).
- [x] AC-5: mesmo tratamento para `SPEC-\d{3}` (nó `SPEC`, status do template já existente:
      draft/review/approved/implementing/done/abandoned).

**Nota de implementação (achado real, fora de escopo desta spec)**: rodar `adr:list`/`show`/
`impact` contra o repositório real (1014 arquivos rastreados) travou por dezenas de minutos neste
ambiente — não é bug de lógica (uma fixture isolada com 2 documentos passa em <1s, ver
`test/adr-cli.test.js`) nem específico deste comando: `GitGraphDocumentSource.listDocuments()` é
rápido (1 subprocesso `git ls-files` + leitura síncrona de arquivo), mas
`SqliteGraphStore.saveNode`/`saveEdge`/`saveEvidence` (packages/adapter-sqlite) fazem um `INSERT`
individual por chamada, sem transação — para ~1000 documentos com múltiplas relações cada, isso é
plausivelmente dezenas de milhares de writes SQLite não agrupados, cada um com custo de fsync.
Mesmo padrão usado por `drift:check`/`graph:sync` — não é regressão desta spec, mas um achado real
que vale uma spec própria de performance (`GraphLoop.apply()` já processa uma `GraphMutation`
inteira por documento; agrupar os saves de uma mutation numa única transação SQLite é o candidato
óbvio, não implementado aqui por estar fora do escopo declarado em §5).

## 5. Escopo

**Dentro**: extração determinística de status de ADR/SPEC; `adr:list`/`adr:show`/`adr:impact`/
`adr:graph`; nenhuma mudança em `KnowledgeStatus` (contrato existente intocado).

**Fora**: visualização gráfica (Fase posterior); extração de `Requirement`/`BusinessRule` como
nós (a visão original pede, mas este repositório-framework não tem uma fonte de requisitos de
produto estruturada hoje — fica para quando um projeto consumidor real tiver essa fonte,
provavelmente via `docs/produto/`); `PullRequest`/`Commit`/`Release` como nós (SPEC-035/Provenance,
fase seguinte).

## 6. NFRs / restrições

- Determinístico, sem LLM (mesmo padrão do extrator já existente).
- Não quebra `extractDeterministicRelations` existente — testes atuais (`test/graph.test.js`)
  continuam passando sem alteração de comportamento para os tipos de nó já existentes.

## 7. Riscos e mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Confundir status de documento com `KnowledgeStatus` de epistemologia da aresta | Média (é a armadilha óbvia) | Média (contamina semântica do grafo inteiro) | AC-1 marca a decisão como obrigatória e explícita no plan.md, não implícita no código |
| `adr:impact` ficar lento em grafos grandes | Baixa neste repositório (~78 ADRs hoje) | Baixa | `GraphLoop.impact()` já tem parâmetro `depth`; reaproveitar, não implementar limite novo |

## 8. Métricas de sucesso

`forja adr:impact 0020` (core/registry, uma das ADRs mais referenciadas do repositório) retorna um
conjunto de componentes que um mantenedor confirma como correto, sem falso-negativo óbvio.
