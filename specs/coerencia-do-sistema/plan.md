# Plan: coerencia-do-sistema

- **Spec**: ./spec.md
- **Status**: done
- **Criado em**: 2026-07-15

> Como vamos construir o que a spec define. Sem código aqui — só estrutura e decisões.

## 1. Abordagem técnica

Três checks novos no catálogo de `health.mjs`, no molde dos que já existem (`runtime-deps`,
`mcp-json`): `scope: repo`, guardados por `isFrameworkRepo(env)`, cada um nomeando arquivo, linha e
correção. **Nenhuma máquina nova** — o runner de `checks.mjs` já roda tudo isso.

O que é genuinamente novo é a **leitura da documentação como dado**. Hoje o `health.mjs` lê código
(imports, `package.json`, `.mcp.json`); agora precisa ler os `.md` e extrair duas coisas: comandos
citados e links relativos. Isso vira `lib/core/doc-graph.mjs` — um scanner puro, sem opinião sobre
severidade, testável isoladamente. Os três checks são finos: chamam o scanner e comparam com a
verdade (o registry, o sistema de arquivos).

O ponto que decide se a spec vale a pena é o **AC-2**: a allowlist de comandos do projeto gerado
tem que ser *derivada*, não escrita. Confirmei em campo que dá: parsear o bloco `"scripts"` dos
`lib/generators/*.js` produz exatamente `start:dev`, `test:cov`, `memory:db:*` etc. — os 7 falsos
positivos que a auditoria manual pegou. Lista manual mente com o tempo; a derivada acompanha o
gerador sozinha.

## 2. Módulos afetados

| Caminho | Mudança | Risco |
|---|---|---|
| `lib/core/doc-graph.mjs` | **criar** — scanner puro: cita comandos, coleta links, deriva allowlist | M |
| `lib/core/health.mjs` | editar — 3 checks novos no `CHECKS[]` | B |
| `test/doc-graph.test.js` | **criar** — o scanner, isolado | B |
| `test/health.test.js` | editar — os 3 checks nos dois estados, incluindo o falso positivo do AC-2 | B |
| `docs/token-optimization.md` etc. | corrigir o que o check acusar (já limpo na v1.1.4, mas o gate é quem confirma) | B |
| `README`/`docs` | documentar `memory:extract` (AC-10) | B |
| `memory/90-decisions/0025-*.md` | **criar** — ADR | B |

Risco no `doc-graph.mjs`, não no `health.mjs`: os checks são triviais; a dificuldade toda é o
scanner não gerar falso positivo. Um `docs-commands` que acusa demais reprova a documentação
inteira e é desligado no primeiro dia — pior que não existir.

## 3. Diagrama de fluxo

```
  tools:doctor (scope: repo)
        │
        ▼
  ┌──────────────── lib/core/doc-graph.mjs ────────────────┐
  │  scanDocs(env)  → [{ file, line, command }]            │  citações forja/npm run
  │  scanLinks(env) → [{ file, line, target }]             │  links markdown relativos
  │  projectCommands(env) → Set<string>                    │  derivada de lib/generators/
  └────────────────────────────────────────────────────────┘
        │                    │                     │
        ▼                    ▼                     ▼
  docs-commands         docs-links          commands-documented
  (critical)            (warn)              (warn)
  citado ∈ registry     target existe       registry ⊆ citados
    ∪ projectCommands                       nos .md
        │                    │                     │
        └──────────── Result[] { file, line, detail, fix } ──────────┘
```

## 4. Contratos (API/CLI/Schema)

```js
// lib/core/doc-graph.mjs — leitura pura, sem juízo de severidade

/** Superfícies de instrução escaneadas. docs/archive, boilerplates e specs ficam de fora (§5 D3). */
export const DOC_SURFACES;   // ['docs', 'prompts', '.claude/agents', 'AGENTS.md', 'CLAUDE.md', 'README.md', 'README.en.md', 'DOC-MAP.md']

/** Comandos citados como `forja x:y` ou `npm run x:y` em bloco de código. { file, line, command } */
export function scanCommands(env);

/** Links markdown relativos (não http, âncora ignorada). { file, line, target } */
export function scanLinks(env);

/** Allowlist DERIVADA: keys do bloco "scripts" dos geradores. Nunca uma lista literal. */
export function projectCommands(env);   // -> Set<string>
```

**Regex de comando** — casa `(?:forja |npm run )` seguido de um token **com ao menos um `:`**
(`spec:new`, `code:impact`). O `:` é o discriminador: todo comando do registry o tem, e nenhuma
prosa (`"forja does X"`) o casa por acidente. Só dentro de bloco/span de código — prosa livre.

**Contrato dos checks** (severidade honesta, AC-6):

| Check | Severity | Reprova quando | Fix prescrito |
|---|---|---|---|
| `docs-commands` | critical | comando citado ∉ registry ∪ `projectCommands` | "renomeie para `<x>` ou remova a citação em `file:line`" |
| `commands-documented` | warn | comando do registry citado em nenhum `.md` | "documente `<cmd>` em algum `.md` (ou remova do registry)" |
| `docs-links` | warn | link relativo aponta para inexistente | "crie o alvo ou corrija o link em `file:line`" |

## 5. Decisões e alternativas

**D1: Scanner puro separado dos checks.** `doc-graph.mjs` lê e devolve dados; os checks julgam.
Permite testar o parsing (a parte difícil) sem montar o ambiente do doctor, e permite que um quarto
consumidor use o mesmo scan amanhã. Alternativa rejeitada: lógica de parsing embutida em cada check
— foi assim que o `runtime-deps` e o `release.mjs` acabaram com dois parsers de import quase iguais.

**D2: Allowlist derivada dos geradores (AC-2).** A prova de fogo da spec. `projectCommands(env)`
parseia o bloco `"scripts"` dos `lib/generators/*.js`. Alternativa rejeitada: lista literal no
código — é a armadilha do `.gitignore` da SPEC-009, onde a allow-list manual engoliu uma spec em
silêncio. Uma lista que não acompanha o gerador vira mentira no primeiro comando novo do boilerplate.

**D3: Escopo do scan — instrução, não histórico.** Escaneia `docs/` (menos `archive/`), `prompts/`,
`.claude/agents/` e os `.md` de raiz. **Fora**: `docs/archive/` (legado, off-limits), `boilerplates/`
(é conteúdo do projeto gerado — cita comandos do projeto, não do Forja), `specs/` e `memory/90-*`
(registro histórico: uma spec ou ADR pode legitimamente citar um comando proposto ou já removido).
O gate protege o que instrui o agente *agora*, não o que registrou o passado.

**D4: `:` como discriminador de comando.** Em vez de tentar entender a gramática do CLI, exijo o
`:`. Simples, e cobre 42/42 do registry. Um comando futuro sem `:` escaparia — mas hoje nenhum
existe, e inventar parser de gramática para um caso inexistente é criar o problema que não temos.

**D5: `docs-commands` é o único crítico.** Comando fantasma faz o agente agir errado — trava.
Comando não-documentado e link quebrado atrapalham mas não param ninguém: `warn`. Reprovar release
por um link quebrado num doc é como o `deps-unused` seria se fosse crítico — ensina o time a ignorar
o gate.

**D6: `memory:extract` — decisão adiada para as tasks.** É o único órfão real. Documentar ou remover
é chamada de quem conhece o uso dele; o plano não força a mão. O que o plano garante é que, depois,
o `commands-documented` não deixa nascer um órfão novo.

D1, D2 e D3 são estruturais → **ADR-0025**, referenciando ADR-0023/0024 (mesma família de gate,
terceira fronteira: a instrução) e ADR-0021 (a classe "erra sem avisar").

## 6. Dependências

- **Specs**: SPEC-009 (`health.mjs`/`checks.mjs` são a base). Já `done`.
- **Pacotes npm**: **nenhum novo.** `node:fs` e regex. Parsear markdown com um lexer completo seria
  peso morto — precisamos de citações em code-span e links, não de um AST de CommonMark.
- **Migrações**: nenhuma.

## 7. Rollout

- [ ] **Ordem**: `doc-graph.mjs` + seus testes primeiro (nada o consome ainda) → os 3 checks →
      rodar o doctor e **corrigir o que ele acusar** → CI já pega de graça (o doctor já é step, ADR-0024).
- [x] Doc/persona: governança ganha mais um critério; nenhuma persona muda de fluxo.
- [ ] **Validar o AC-2 de verdade**: adicionar um `"foo:bar"` temporário aos scripts de um gerador e
      confirmar que `docs-commands` **não** passa a exigir `foo:bar` na doc. Se exigir, a derivação
      não está pegando o gerador certo.
- [ ] O primeiro `npm run tools:doctor` depois disto é o teste real: ele deve passar (a doc já foi
      limpa na v1.1.4), provando que o gate concorda com a correção manual — não inventa trabalho.

## 8. Sinais de fracasso (kill criteria)

- **`docs-commands` gera um falso positivo crítico.** Se acontecer uma vez com comando legítimo, ele
  é rebaixado a `warn` até o scanner ser corrigido — um crítico que mente é pior que um warning
  honesto, e aqui ele bloquearia o CI de todo mundo.
- **O scanner fica caro.** Se ler os `.md` todos passar de ~1s, o scan vira lazy/cacheado por mtime —
  mas os checks são `scope: repo`, fora do `SessionStart`, então a folga é grande.
- **A regra vira desincentivo a documentar.** Se alguém parar de escrever doc para não "brigar com o
  gate", erramos: o gate só cobre citação de *comando*, e isso precisa estar claro na mensagem de
  erro (que aponta a linha e diz "renomeie ou remova a citação", nunca "não escreva").
