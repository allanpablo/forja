# Tasks: coerencia-do-sistema

- **Spec**: ./spec.md
- **Plan**: ./plan.md
- **Status**: done
- **Criado em**: 2026-07-15

> Decomposição executável. Cada task tem dono claro, critério de done e referência a arquivos.

Ordem do plano §7: o scanner e seus testes primeiro (nada o consome), depois os três checks, depois
rodar o doctor e corrigir o que ele acusar. O CI pega de graça — `tools:doctor` já é step (ADR-0024).

---

## T1 — `doc-graph.mjs`: o scanner puro
- **Owner**: Worker
- **Estimativa**: M
- **Depende de**: —
- **Paths**: `lib/core/doc-graph.mjs`, `test/doc-graph.test.js`
- **Escopo**: leitura pura, zero juízo de severidade. É a parte difícil — todo o risco da spec mora
  aqui, no não-gerar-falso-positivo.
- **Done quando**:
  - [ ] `scanCommands(env)` devolve `{ file, line, command }` para cada `forja <cmd>` / `npm run <cmd>`
        onde `<cmd>` tem ao menos um `:` (o discriminador do plano §D4)
  - [ ] `scanLinks(env)` devolve `{ file, line, target }` para links markdown **relativos**; ignora
        `http(s)://` e âncoras (`#sec`). Link para diretório (`memory/90-decisions/`) conta como alvo
  - [ ] `projectCommands(env)` **deriva** a allowlist das keys do bloco `"scripts"` dos
        `lib/generators/*.js` — nunca uma lista literal (plano §D2). Retorna Set
  - [ ] `DOC_SURFACES` exportado; escaneia `docs/` (menos `archive/`), `prompts/`, `.claude/agents/`
        e os `.md` de raiz. **Não** varre `boilerplates/`, `specs/`, `memory/` (plano §D3)
  - [ ] `env` injetável (`{ root, fs }`) no padrão de `checks.mjs`, para os testes não tocarem o disco
  - [ ] `test/doc-graph.test.js`: fixtures cobrindo comando com/sem `:`, link relativo/http/âncora/
        diretório, e a derivação pegando um `"foo:bar"` de um gerador de fixture

## T2 — Check `docs-commands` (critical)
- **Owner**: Worker
- **Estimativa**: P
- **Depende de**: T1
- **Paths**: `lib/core/health.mjs`, `test/health.test.js`
- **Done quando**:
  - [ ] `scope: 'repo'`, guardado por `isFrameworkRepo(env)` — não roda numa instalação `forjajs`
  - [ ] Reprova (critical) quando comando citado ∉ `registry ∪ projectCommands` (AC-1, AC-2)
  - [ ] `detail` nomeia `file:line` e o comando ofensor; `fix` diz "renomeie ou remova a citação"
        — nunca "não escreva" (kill criteria do plano §8)
  - [ ] **Teste do falso positivo (AC-2, a prova de fogo)**: doc citando `npm run start:dev` (comando
        do projeto gerado) **não** reprova; doc citando `forja fantasma:x` reprova
  - [ ] Teste: comando real do registry citado passa

## T3 — Checks `commands-documented` e `docs-links` (warn)
- **Owner**: Worker
- **Estimativa**: P
- **Depende de**: T1
- **Paths**: `lib/core/health.mjs`, `test/health.test.js`
- **Done quando**:
  - [ ] `commands-documented` (**warn**): comando do registry citado em nenhuma superfície → aviso
        com "documente em algum `.md` ou remova do registry" (AC-3). `worstStatus` não escala warn
  - [ ] `docs-links` (**warn**): link relativo sem alvo → aviso com `file:line` e o alvo (AC-4)
  - [ ] Ambos `scope: 'repo'`, guardados por `isFrameworkRepo`
  - [ ] Teste de cada um nos dois estados (são/quebrado)
  - [ ] Teste garantindo que os três checks novos são `skipped` fora do repo do framework

## T4 — Rodar o gate e reconciliar a realidade
- **Owner**: Worker
- **Estimativa**: P
- **Depende de**: T2, T3
- **Paths**: `docs/`, `README.md`/`README.en.md`, conforme o gate acusar
- **Escopo**: o primeiro `tools:doctor` com os checks ligados é o teste real — ele deve **concordar
  com as correções manuais** já feitas (a doc foi limpa na v1.1.4), não inventar trabalho novo.
- **Done quando**:
  - [ ] `forja tools:doctor` roda com os 3 checks e o núcleo fica **verde ou só com warns**
  - [ ] Qualquer `docs-commands` crítico remanescente é corrigido na fonte (renomear/remover citação)
  - [ ] AC-10: `memory:extract` — documentar numa superfície escaneada **ou** remover do registry.
        Decisão de quem conhece o uso; qualquer das duas fecha o `commands-documented` warn
  - [ ] `docs-links` warns zerados ou reduzidos a alvos que se decide criar depois (registrar quais)

## T5 — Validação executável do AC-2
- **Owner**: Worker
- **Estimativa**: P
- **Depende de**: T2
- **Paths**: `test/health.test.js` (ou um teste dedicado)
- **Escopo**: garantir que a derivação é *real*, não que o teste passou por sorte.
- **Done quando**:
  - [ ] Teste que injeta um `"foo:bar"` no bloco `scripts` de um gerador de fixture e confirma que
        `docs-commands` passa a **aceitar** `foo:bar` na doc — provando que a allowlist segue o
        gerador, não uma lista congelada (plano §7)

## T6 — ADR-0025 e CI
- **Owner**: SDD Architect + Worker
- **Estimativa**: P
- **Depende de**: T2, T3, T4
- **Paths**: `memory/90-decisions/0025-*.md`, `.github/workflows/ci.yml` (verificar)
- **Done quando**:
  - [ ] ADR-0025 registra D1 (scanner puro), D2 (allowlist derivada) e D3 (escopo = instrução, não
        histórico); referencia ADR-0023/0024 (a família de gate, terceira fronteira) e ADR-0021
  - [ ] Confirmar que o CI **já** exercita os checks via `tools:doctor` (step do ADR-0024) — não deve
        precisar de mudança no workflow; se precisar, ajustar
  - [ ] `npm test` verde, `spec:check` verde

---

## Validação final
- [ ] Renomear um comando do registry num teste e confirmar que `docs-commands` **acusa** a doc que
      ainda usa o nome antigo — a métrica de sucesso da spec (renomear vira ato detectável)
- [ ] Suíte completa verde; `tools:doctor` verde/warn; spec → `done`

## Nota de implementação — o code-span é endurecimento, não requisito
O plano §4 menciona "só dentro de bloco/span de código". A auditoria manual que originou esta spec
usou **scan de arquivo inteiro** + discriminador `:` e funcionou — os únicos falsos positivos foram
os comandos do projeto gerado, tratados pela allowlist (T2). Começar pelo scan de arquivo inteiro; só
adicionar consciência de code-span **se** T2/T4 revelarem um falso positivo que o `:` não filtre. Não
construir parser de markdown para um problema que ainda não apareceu (plano §6).

## Handoffs entre agentes
Worker (T1-T5), SDD Architect (T6). Handoff a cada fronteira via `forja agent:route` — 7 campos
(ADR-0005).
