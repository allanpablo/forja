# Spec: Learning Loop — Registro de Incidentes + Sugestão por Similaridade

- **ID**: SPEC-041
- **Status**: done
- **Owner**: apk
- **Criado em**: 2026-09-01
- **Sprint alvo**: Sprint 9 (primeiro sprint da Fase 6 da visão original — Learning Loop /
  Incident → Knowledge; Cross-project Intelligence fica de fora, ver §5)
- **ADRs relacionadas**: ADR-0078; depende de `packages/graph.GraphLoop` (já existente —
  `upsertNode`/`addEvidence`/`upsertEdge` reaproveitados sem mudança)

> Gap analysis original (`docs/architecture/...` §3): "`GraphLoop` + evidência já dão a base; falta
> o tipo de nó `Incident` e o fluxo de sugestão (nunca aplicação automática) — Construir,
> reaproveitando grafo + approvals." `GraphNode.type` já é vocabulário livre (o próprio doc já lista
> `Incident` em `ENGINEERING_NODE_TYPES` §6) — não precisa de contrato novo, só de um adapter que
> grava/consulta esse tipo.

## 1. Problema

Nada registra incidentes de forma consultável, nem sugere "isso já aconteceu antes" quando um novo
problema se parece com um antigo — cada incidente é resolvido isoladamente, sem acumular
conhecimento reconsultável.

## 2. Proposta de valor

`forja incident:record --title <t> [--description <d>]` registra um incidente no Engineering Graph
já existente; `forja incident:similar "<busca>"` sugere incidentes passados parecidos — sugestão
por palavra-chave, determinística, nunca aplica nada sozinha.

## 3. User stories

- **Como** governance, **quero** registrar um incidente de forma estruturada, **para que** ele vire
  conhecimento consultável, não conhecimento tribal.
- **Como** desenvolvedor investigando um problema, **quero** ver incidentes parecidos já resolvidos,
  **para que** eu não resolva o mesmo problema do zero toda vez.

## 4. Critérios de aceite (Definition of Done)

- [x] AC-1: `forja incident:record --title <t> [--description <d>]` grava um nó `Incident` real no
      Engineering Graph (`GraphLoop.upsertNode`+`addEvidence`, já existentes) — mesmo armazenamento
      compartilhado já usado por `adr:*`/`architecture:*` (`SqliteGraphStore`), sem tabela nova.
- [x] AC-2: `forja incident:list` lista os incidentes registrados, mais recentes primeiro.
- [x] AC-3: `forja incident:similar "<busca>"` classifica incidentes registrados por sobreposição de
      palavras-chave contra título+descrição — determinístico (mesmo estilo de matching já usado em
      `GraphLoop.contextRecords`), sem LLM, sem inventar semântica que o texto não sustenta.
- [x] AC-4: **nunca aplicação automática** — nenhum comando desta spec chama `PolicyEngine`,
      modifica arquivo, ou sugere uma correção como se fosse certeza. `incident:similar` é sempre
      leitura/sugestão, nunca decisão.
- [x] AC-5: incidente sem nenhuma busca ainda registrada devolve lista vazia (não erro) em
      `incident:similar`.

## 5. Escopo

**Dentro**: `incident:record`/`:list`/`:similar` — registro + sugestão por palavra-chave.

**Fora** (spec própria futura, mesmo princípio de escopo já usado nas specs anteriores):
- Vincular automaticamente um incidente a ADRs/arquivos/evidência (`--related-adr` etc.) — versão
  mínima desta spec não faz linkagem de grafo além do próprio nó `Incident`+evidência de quem
  registrou; linkagem exigiria resolver ids de nós já indexados (mesmo custo de reindexação de
  `adr:*`), fora do escopo desta primeira entrega.
- "Lições aprendidas" geradas automaticamente (resumo/causa raiz sugerida por LLM) — proibido pelo
  mesmo princípio de "determinístico antes de LLM" de toda a fundação; um humano escreve a
  descrição, o sistema só indexa e sugere por palavra-chave.
- Cross-project Intelligence (correlacionar incidentes entre múltiplos projetos/repositórios) — este
  workspace é de um único projeto; múltiplos projetos exigem uma fonte de dado que não existe hoje
  (workspace compartilhado entre repos), fora de escopo.

## 6. NFRs / restrições

- Determinístico — nenhum LLM/ML em nenhum ponto; matching por palavra-chave, mesmo estilo já usado
  em `GraphLoop.contextRecords`.
- Zero migration SQLite nova — reaproveita `SqliteGraphStore` já existente.
- Evidência de quem registrou (`source: 'forja.cli'`, fonte confiável já reconhecida por
  `GraphLoop.addEvidence` — ver `DEFAULT_TRUSTED_EVIDENCE_SOURCES`) mantém o nó `verified`, não
  `inferred` — é um humano registrando via CLI, ação deliberada, não uma inferência de agente.

## 7. Riscos e mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| `incident:similar` prometer entendimento semântico que não tem (é só palavra-chave) | Média (nome "similar" sugere mais) | Baixa (decepção, não dado errado) | AC-3 explícito; saída indica o score de sobreposição, não uma alegação de "causa igual" |
| Incidentes virarem uma lista sem uso (write-only) | Média se a busca não for útil | Baixa | `incident:similar` é o consumidor imediato — não é write-only por design |

## 8. Métricas de sucesso

Registrar 2+ incidentes reais ou sintéticos documentados como tais, com um par claramente parecido
e um claramente diferente, e confirmar que `incident:similar` ordena corretamente — revisão humana,
mesma metodologia das specs anteriores.

**Validado** (`test/incident-cli.test.js`): 3 incidentes registrados, 2 deles reais achados desta
mesma sessão (SQLite writes não em lote, de SPEC-032; `sandboxEnvironment` sem `HOME`, de SPEC-038)
mais 1 claramente não relacionado (build de frontend). `incident:similar` de cada busca achou
exatamente o incidente correspondente, sem falso-positivo do incidente não relacionado.
