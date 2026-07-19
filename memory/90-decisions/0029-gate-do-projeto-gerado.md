# ADR-0029: Gate do projeto gerado (`project:smoke`)

- **Status**: accepted
- **Data**: 2026-07-19
- **Autor(es)**: apk
- **Tags**: quality, gates, generators, sdd

## Contexto

O `release:check` (ADR-0024) guarda uma fronteira com evidência: *o repositório mente sobre o
pacote*. Existe a **mesma classe de bug um nível acima, e estava descoberta**: nada provava que
`forja project:new` gera um projeto coerente.

O gerador escreve a partir de templates — `{{FEATURE}}`, blocos de `scripts`, configs. Cada
substituição é uma chance de mentira silenciosa: um placeholder que vaza, um `package.json` que não
parseia, uma estrutura incompleta. O `structure-validator` já sabia *validar* estrutura, mas nada
*executava* o gerador de ponta a ponta e reprovava. Conhecimento não faltava; execução, sim — o
mesmo diagnóstico da SPEC-010.

## Decisão

Criar `project:smoke` (SPEC-015): um gate que **gera um projeto num diretório temporário isolado e o
inspeciona**, reusando o runner de `checks.ts` — a mesma máquina de probes do doctor e do release.

Dois tiers, espelhando o `release:check`:

- **Barato (default, roda no CI)**: sem rede. Prova que nenhum placeholder `{{...}}` vazou, que todo
  `package.json` parseia, e que a estrutura passa no `validateProjectStructure`.
- **`--full` (opt-in, pré-release)**: `npm install` + `npm run build` no backend gerado, num ambiente
  isolado (sem `NODE_PATH`/`npm_config_*` herdados). É o clean-install do release, na saída do gerador.

O gerador não sabe que está sendo auditado — o gate só o observa via spawn do entry real
(`create-memory-nest-kit`), como o release empacota o tarball real.

## Alternativas consideradas

- **Importar as funções do gerador e chamá-las direto** — rejeitada: testaria as funções, não o
  entry point que o usuário roda. O spawn do orquestrador pega bugs de orquestração também.
- **Rodar sempre o tier pesado (install+build)** — rejeitada: `npm install` de um NestJS é lento e
  usa rede; um gate que reprova por flakiness de registry se contorna (a lição do CI na SPEC-009).
  Por isso o tier barato é o gate de CI e o `--full` é opt-in.
- **Pôr no `tools:doctor`** — rejeitada: o doctor é o raio-x barato do núcleo; gerar um projeto tem
  custo. É gate próprio, como o `release:check`.

## Consequências

**Positivas**:
- A última fronteira do gerador que vivia por disciplina passa a viver no harness.
- Reuso total: runner de `checks.ts` + `structure-validator` existente — uma máquina, não duas.
- O tier barato é rápido o bastante para o CI; o `--full` dá a prova forte antes de publicar.

**Negativas / Trade-offs**:
- Cobre o caminho *default* do gerador; a matriz de boilerplates de stack fica para iteração futura.
- O `--full` depende de rede — mitigado por ser opt-in, fora do gate de CI.

## Rastreamento
- Implementação: `lib/core/project-smoke.ts`, `scripts/project-smoke.ts`, `test/project-smoke.test.js`
- Spec: `specs/project-smoke/spec.md` (SPEC-015)
- ADRs relacionadas: ADR-0024 (gate do tarball — o padrão), ADR-0023 (doctor), ADR-0020 (core/registry)
