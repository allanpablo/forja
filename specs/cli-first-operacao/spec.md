# Spec: cli-first-operacao

- **ID**: SPEC-CLI-FIRST-001
- **Status**: done
- **Owner**: orchestrator
- **Criado em**: 2026-06-02
- **Sprint alvo**: refinamento-cli-2026-06
- **ADRs relacionadas**: ADR-0005, ADR-0007, ADR-0008

## 1. Problema
O projeto tinha forte presenca de dashboard/web e referencias visuais na entrada operacional. Isso poluia a operacao diaria e desviava o uso do objetivo principal: orquestracao, SDD, GSD, sprints e handoffs por comandos.

## 2. Proposta de valor
Operar o framework pelo terminal com sprints, contexto, specs, handoffs, checks e governanca em uma trilha curta e repetivel.

## 3. User stories
- **Como** operador do framework, **quero** acompanhar sprints pelo CLI, **para que** eu nao dependa da web para saber o proximo passo.
- **Como** Orchestrator, **quero** registrar handoffs GSD pelo CLI, **para que** SDD e governanca tenham rastreabilidade.
- **Como** Governance, **quero** validar entregas CLI-only sem brief visual, **para que** design nao bloqueie trabalho sem UI.

## 4. Criterios de aceite
- [x] AC-1: `npm run sprint:start/status/complete` funciona no repositorio raiz sem argumento de projeto.
- [x] AC-2: backlog em tabela RICE gera sprint com itens P0/P1.
- [x] AC-3: `gsd:check` nao exige brief visual quando a entrega e CLI-only.
- [x] AC-4: README, AGENTS e docs apontam CLI-first como caminho operacional principal.
- [x] AC-5: dashboard/web permanece opcional/legado, nao gate operacional.
- [x] AC-6: `npm run project:check` valida o framework raiz quando chamado sem projeto.

## 5. Escopo
**Dentro**:
- Scripts de sprint e GSD.
- Check de governanca do projeto raiz.
- Documentacao de operacao CLI-first.
- Reducao de ruido visual no CLI principal.

**Fora**:
- Remover fisicamente o dashboard.
- Reescrever frontend.
- Alterar SQLite ou schema de handoffs.

## 6. NFRs / restricoes
- Compatibilidade: manter comandos existentes.
- Operabilidade: saida de terminal simples, sem depender de browser.
- Governanca: preservar ADR-0005 e fluxo SDD.

## 7. Riscos e mitigacao
| Risco | Probabilidade | Impacto | Mitigacao |
|---|---|---|---|
| Usuarios ainda abrirem dashboard por habito | M | B | README e AGENTS priorizam CLI-first |
| Sprint duplicar itens de backlog RICE | B | B | Tabela RICE nao e removida; sprint vira selecao operacional |

## 8. Metricas de sucesso
Em 30 dias, 90% das execucoes de sprint e handoff devem ser feitas por CLI, com `gsd:check` e `project:check` usados antes de entrega.
