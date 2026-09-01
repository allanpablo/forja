# Spec: Predictive Change Simulation

- **ID**: SPEC-038
- **Status**: done
- **Owner**: apk
- **Criado em**: 2026-09-01
- **Sprint alvo**: Sprint 6 (Fase 4 da visão original)
- **ADRs relacionadas**: ADR-0078; depende de SPEC-033 (`checkConstitution`), SPEC-034
  (`assessRisk`/`buildRiskInput`) — reaproveitados, não recalculados

> Gap analysis original (`docs/architecture/...` §3): `SandboxEngine` + `GitWorktreeBackend` +
> `runSandboxedCapability` "já são exatamente 'aplicar em worktree isolado, testar, decidir
> promover ou descartar'" — **compor** sandbox + risk engine + architecture:check, não construir
> nada novo. Esta spec é essa composição.

## 1. Problema

Hoje, avaliar se um ref/branch proposto é seguro pra integrar exige checkout manual, rodar teste
manualmente, rodar `architecture:check`/`risk:assess` manualmente, e cruzar os três resultados na
cabeça. Nenhum comando único simula "e se essa mudança fosse aplicada" com isolamento real e
resposta estruturada.

## 2. Proposta de valor

`forja simulate <ref> [--command "npm test"]` aplica o `ref` num worktree git isolado (nunca a
árvore real), roda o comando de teste, computa `architecture:check`+`risk:assess` contra o estado
resultante, e devolve uma recomendação (`promote`/`review`/`discard`) — sempre destruindo o
worktree ao final, nunca promovendo automaticamente.

## 3. User stories

- **Como** governance, **quero** simular uma mudança antes de integrá-la, **para que** eu veja
  teste+arquitetura+risco combinados sem tocar a árvore real nem rodar três comandos manualmente.

## 4. Critérios de aceite (Definition of Done)

- [x] AC-1: `forja simulate <ref>` cria um worktree git isolado no `ref` (via `SandboxEngine` +
      `GitWorktreeBackend`, já existentes — nenhum motor de isolamento novo), roda o comando de
      teste (`--command`, default `npm test`) dentro dele via `sandbox.execute()`.
- [x] AC-2: `architecture:check`/`risk:assess` rodam contra o **estado do worktree isolado**
      (reaproveitando `checkConstitution`/`buildRiskInput` já existentes — nenhuma lógica de
      violação/risco reimplementada), usando um SQLite temporário próprio da simulação — **nunca**
      o workspace real (evita contaminar o Engineering Graph persistente com estado de um ref que
      pode nunca ser integrado).
- [x] AC-3: o worktree é **sempre destruído** ao final (sucesso, falha de teste, ou exceção) —
      `forja simulate` nunca chama `sandbox.promote()`; a única escrita na árvore real é a remoção
      do próprio worktree. Verificável: `git worktree list` antes/depois idêntico.
- [x] AC-4: recomendação (`promote`/`review`/`discard`) é determinística a partir de teste+
      arquitetura+risco (regra documentada em código e no plan) — nunca decide sozinha (não chama
      `PolicyEngine`, não integra nada), é leitura, mesmo princípio de `RiskEngine`/SPEC-034 D3.
- [x] AC-5: `--json` produz saída estruturada; texto legível por padrão.

## 5. Escopo

**Dentro**: `forja simulate <ref> [--command <cmd>] [--json]`, composição de `SandboxEngine` +
`checkConstitution` + `assessRisk`.

**Fora**: aplicação automática (`sandbox.promote()` nunca é chamado — essa decisão continua manual,
via os fluxos normais de merge/PR); simular a partir de um patch/diff textual solto (só refs git,
mesmo princípio de `risk:assess`/SPEC-034 D1 — verificável, não texto livre); múltiplos comandos de
teste em paralelo (um `--command` por vez, nesta versão).

## 6. NFRs / restrições

- Isolamento real: nenhuma escrita na árvore/branch atual além do worktree (que é sempre removido).
- SQLite temporário e descartável — zero persistência cross-run do Engineering Graph do ref
  simulado.
- Determinístico: nenhum LLM em nenhum ponto.

## 7. Riscos e mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Simulação vazar pro Engineering Graph real | Média se não isolado explicitamente | Alta (grafo persistente contaminado com ref nunca integrado) | AC-2: SQLite temporário próprio, nunca `getWorkspaceDbPath()` |
| `forja simulate` promover por engano | Baixa (mesmo padrão de `runSandboxedCapability`) | Muito alta (mudaria a árvore real sem revisão) | AC-3: nenhuma chamada a `sandbox.promote()` em todo o código; teste de CLI verifica `git worktree list` antes/depois |
| Comando de teste do projeto não ser `npm test` | Média (todo projeto é diferente) | Baixa | `--command` configurável, `npm test` é só o default |

## 8. Métricas de sucesso

Simular um ref real deste repositório (ex.: um commit já mergeado, comparado contra seu pai) produz
teste+arquitetura+risco coerentes com o que se sabe sobre aquela mudança — revisão humana, mesma
metodologia de SPEC-034/036/037 §8.

**Validado**: `forja simulate <commit real deste repositório> --command "node --test
test/risk-engine.test.js"` — teste passou, `architecture:check` achou a regra active real (0
violações, coerente com o estado real do repositório), risco 18/100 (`autonomous`), recomendação
`promote`. `git worktree list`/`git status` idênticos antes/depois (AC-3 confirmado sobre dado
real, não só fixture).

**Achados reais corrigidos durante a implementação (não adiados)**:

1. **`sandboxEnvironment()` não passava `HOME`/`USERPROFILE`** (`packages/adapter-git/src/index.ts`
   — código pré-existente, não escrito nesta spec, mas exposto por ela: nenhum consumidor anterior
   do sandbox rodava um comando dependente de resolver `HOME`). `npm test` como comando de teste
   travava indefinidamente com o ambiente restrito por padrão — sem `HOME`, `npm` não consegue
   resolver seu diretório de config/cache e trava em vez de falhar rápido (reproduzido
   isoladamente com `env -i` fora do sandbox pra confirmar a causa antes de mexer no código).
   Corrigido adicionando os dois ao allowlist fixo — nenhum dos dois é segredo, e o teste "runner
   não herda secrets do ambiente por padrão" continua passando (cobre uma env var arbitrária do
   processo host, não este allowlist).
2. **Rodar `--command "npm test"` (a suíte inteira, 400+ testes) contra este próprio repositório é
   lento e inconsistente neste ambiente sandboxado** — mesma categoria de achado já documentada em
   SPEC-032 (SQLite não em lote) e SPEC-034 (reindexação do grafo real): I/O pesado sob este
   sandbox específico não é confiável dentro de um timeout razoável. Não é um bug em `forja
   simulate` (a mesma suíte roda em ~10s fora de um worktree recém-criado, sem cache de
   dependências); a validação real do §8 usou um comando de teste mais leve por esse motivo — não
   um limite estrutural de `forja simulate`.
