# Spec: Engineering Evidence Ledger + `forja engineer` (façade)

- **ID**: SPEC-035
- **Status**: done
- **Owner**: apk
- **Criado em**: 2026-09-01
- **Sprint alvo**: Sprint 3
- **ADRs relacionadas**: ADR-0078; depende de SPEC-032, SPEC-033, SPEC-034 (a façade compõe as
  três)

## 1. Problema

`AuditRecord`/`Observation`/`RuntimeRun` já são gravados por run, mas cada um em sua própria
tabela/stream — não existe uma view única "o que aconteceu neste run, do intent à evidência".
Separadamente, montar o quadro completo de uma mudança antes de começar (contexto + arquitetura +
risco + ADRs relevantes) hoje exige rodar vários comandos manualmente.

## 2. Proposta de valor

Uma view agregada por run (Evidence Ledger) e uma façade única (`forja engineer`) que compõe tudo
que já existe — sem introduzir nenhuma fonte de dado nova.

## 3. User stories

- **Como** governance, **quero** um registro append-only por run (`intent`, `agent`, `risk`,
  `architectureCheck`, `tests`, `approvals`, `commit`), **para que** eu audite uma execução sem
  cruzar manualmente quatro tabelas.
- **Como** desenvolvedor, **quero** `forja engineer "<objetivo>"` trazendo de uma vez arquitetura
  afetada, ADRs relevantes, risco estimado e o fluxo recomendado, **para que** eu comece o trabalho
  já orientado.

## 4. Critérios de aceite (Definition of Done)

- [x] AC-1: view agregada (função pura sobre `AuditRecord`/`Observation`/`RuntimeRun` já
      persistidos) produz o JSON no formato do exemplo da visão original (`run`, `intent`, `agent`,
      `risk`, `architectureCheck`, `tests`, `approvals`, `commit`) — sem nova tabela SQLite além
      das já existentes.
- [x] AC-2: `forja engineer "<objetivo>"` compõe, nesta ordem: `ContextEngine.build()` (já
      existente) → `GraphLoop`/ADR relevantes (SPEC-032) → `architecture:check` (SPEC-033;
      não escopado sem `--ref`, ver D1 do plan — não há diff ainda antes do trabalho começar) →
      `RiskEngine.assess()` (SPEC-034, só com `--ref`) → fluxo recomendado (parseado de
      `docs/fluxo.md`, D2 do plan — não reinventado).
- [x] AC-3: saída de `forja engineer` é estruturada (JSON opcional via `--json`, texto legível por
      padrão) e nunca afirma nada que os componentes subjacentes não afirmaram — sem síntese de
      LLM que possa alucinar arquitetura inexistente.
- [x] AC-4: nenhuma lógica de negócio nova em `forja engineer` além de composição e formatação —
      qualquer decisão real continua nos engines que ela chama.

## 5. Escopo

**Dentro**: view agregada de evidência; façade `forja engineer` na versão mínima descrita acima
(sem seleção de time de agentes, que depende de Agent Identity/Reputation, fora de escopo).

**Fora**: seleção/recomendação de agente ou modelo (Fase 3); relatório de release
(`release:engineering-report`, feature separada da visão original, útil mas não bloqueante para
esta fundação); qualquer persistência nova — esta spec é puramente uma camada de leitura/composição
sobre dados que Sprints 1-2 e o framework já existente produzem.

## 6. NFRs / restrições

- View de evidência é derivável a qualquer momento a partir do que já está persistido — se
  recalculada, produz o mesmo resultado (sem estado próprio para divergir).
- `forja engineer` nunca é a única fonte de verdade de nada — é sempre um resumo do que os
  componentes subjacentes já disseram, rastreável de volta a cada um.

## 7. Riscos e mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| `forja engineer` virar um "resumo de LLM" que esconde de onde vieram os fatos | Média (é a tentação óbvia de UX) | Alta (quebra auditabilidade) | AC-3 proíbe síntese que não seja rastreável componente-a-componente |
| Evidence Ledger duplicar dado já em `AuditRecord`/`Observation` | Baixa se implementado como view | Média (duas fontes de verdade) | AC-1 explicitamente "função pura sobre dados já persistidos", sem gravação própria |

## 8. Métricas de sucesso

Rodar `forja engineer` para uma mudança real proposta neste repositório produz uma saída que um
humano usaria sem edição para decidir se e como prosseguir — mesma métrica da spec master, aqui
verificada no nível do comando específico.

**Validado**: `forja engineer "compilar a architecture constitution deste repositório"` rodado
contra este próprio repositório (grafo real, 1013 arquivos). Produziu contexto relevante (specs e
testes de SPEC-033), ADRs/SPECs corretos (ADR-0078, SPEC-032/033/034), `architecture:check` real
(constitution já compilada neste repo) e o fluxo recomendado de `docs/fluxo.md` — utilizável sem
edição.

**Achado real corrigido durante a implementação (não um bug de lógica — um limite de exibição
ausente)**: a primeira execução sem `maxItems` devolveu **1013** referências de contexto (todo o
grafo do repositório caiu dentro do orçamento de 20k tokens), tornando a saída inutilizável sem
edição — o oposto do que esta métrica pede. Corrigido passando `maxItems: 10` para
`ContextEngine.build()` (as 10 mais relevantes, já ordenadas por `ContextEngine`); a lista completa
continua disponível via `context:smart`/`code:query`, que `forja engineer` não substitui.
