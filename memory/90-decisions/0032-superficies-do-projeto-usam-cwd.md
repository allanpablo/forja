# ADR-0032: superfícies do projeto usam `cwd`; recursos do framework usam `__dirname`

- **Status**: accepted
- **Data**: 2026-07-22
- **Autor(es)**: apk
- **Tags**: cli, consumer, dist, invariants, release-gate

## Contexto

Uma mesma classe de bug voltou quatro vezes: um comando funciona no repo do framework (onde `cwd`
e `__dirname/..` coincidem) e quebra no pacote **publicado** de um consumidor, porque resolve as
superfícies do projeto do usuário por `__dirname`, apontando para `node_modules/forjajs/dist`.
Já mordeu `spec:new` (v1.6.2, escrevia dentro do pacote), `project:upgrade` (v1.6.0, extensão `.ts`
cravada) e `project:check` (v1.7.1, auditava o pacote — travou uma corrida do `orchestrate`).

Corrigir caso a caso não fecha a classe. Uma auditoria sistemática dos comandos consumer-facing
revelou **mais três instâncias vivas**, todas escondidas atrás de um `const root = __dirname/..` que
misturava dois papéis: em `agent-harness` o `gsd:*`/`design:check` gravavam/liam no pacote; em
`context-ops` o `cmdBudget` resolvia o alvo e o guardrail de travessia contra o pacote. `sprint-manager`
saiu limpo — ele opera pelo workspace (`resolveProject`/`getWorkspaceRoot`, caminhos absolutos).

## Decisão

Todo script separa **dois papéis de raiz**, com nomes distintos:

- **`root` = recursos do FRAMEWORK** (templates, `design-md/`, `boilerplates/`, `specs/_templates`) —
  resolvidos por `__dirname`, porque viajam dentro do pacote.
- **`projectRoot = process.cwd()` = o PROJETO do usuário** (`.context/`, `specs/`, `memory/`,
  `.memoryrc.json`, briefs) — onde o comando foi invocado.

Cravar `__dirname/..` para uma superfície do projeto é o bug; cravar `cwd` para um recurso do
framework é o bug espelhado. O nome da variável passa a **declarar** o papel — some o `root`
ambíguo que dava para ler dos dois jeitos.

A regra vira **invariante que roda**: o gate `consumer-project-surfaces` (em `release:check`) empacota,
instala isolado e EXECUTA `gsd:plan` + `context:budget` no cwd do consumidor, conferindo que o runbook
cai em `<cwd>/.context/` e que o budget o encontra de lá. Testemunha cruzada e independente do banco.

## Alternativas consideradas
- **Só corrigir os dois novos offenders** — rejeitada: é o caso-a-caso que deixou a classe reabrir.
- **Um único `root` esperto (heurística cwd-vs-pacote)** — rejeitada: a ambiguidade É o bug; dois
  nomes explícitos custam nada e removem a decisão do call site.
- **Gate só a nível de fonte (grep de `__dirname`)** — rejeitada como suficiente: `__dirname` é
  legítimo para recursos do framework; só EXECUTAR no mundo do consumidor separa certo de errado.

## Consequências

**Positivas**:
- `gsd:*`, `context:*`, `design:check` passam a operar no projeto do consumidor, como já faziam
  `spec:new`/`project:check`.
- A classe inteira ganha um gate que a reprova antes do publish — não depende de um consumidor relatar.
- O código fica auto-documentado: `projectRoot` vs `root` diz o papel sem comentário.

**Negativas / Trade-offs**:
- `catalog:*` (varre `boilerplates/`/`design-md/` do framework) só faz sentido rodado do repo; no
  pacote publicado é inócuo — aceitável, é comando de manutenção, não de consumidor.
- O gate custa um `npm pack` + install por corrida de `release:check` (já era o caso dos outros dois).

## Rastreamento
- Implementação: `scripts/agent-harness.ts`, `scripts/context-ops.ts`, `lib/core/release.ts`
  (`consumerProjectSurfaces`), `test/consumer-project-surfaces.test.js`
- ADRs relacionadas: ADR-0021 (invariante > disciplina), ADR-0026 (dual-runtime TS), ADR-0031 (motor
  de orquestração — a corrida que o bug do `project:check` travou)
