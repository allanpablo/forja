# ADR-0076: Modos embedded e studio

- **Status**: proposed
- **Data**: 2026-08-17
- **Autor(es)**: Allan Pablo
- **Tags**: workspace, cli, consumer-project, local-first

## Contexto

ForjaJS é usado tanto como CLI de studio para criar produtos quanto como dependência dentro de um
projeto existente. Resolver sempre `~/forja-workspace` faz comandos de memória, LLM e auditoria de um
consumidor gravarem fora do repositório que estão operando.

## Decisão

Adotar dois modos. `embedded` usa o `cwd` de um projeto consumidor para memória, specs, contexto e
auditoria. `studio` usa o workspace externo para catálogo e criação de múltiplos projetos. O core
detecta `package.json` no consumidor, força studio para comandos de catálogo e aceita
`FORJA_MODE=embedded|studio` como override explícito.

## Alternativas consideradas

- **Workspace global obrigatório**: rejeitada porque viola isolamento do projeto consumidor.
- **Uma flag em cada comando**: rejeitada porque torna o caminho comum frágil e fácil de esquecer.
- **Detectar somente pela instalação global/local**: rejeitada porque binários podem ser chamados por
  `npx`, symlink ou scripts; o `cwd` é a fonte confiável da superfície operada.

## Consequências

**Positivas**:
- Um projeto que depende de ForjaJS carrega seus próprios artefatos e histórico.
- Studio permanece adequado para um operador que mantém vários produtos.

**Negativas / Trade-offs**:
- Scripts fora de um projeto precisam declarar `FORJA_MODE` quando quiserem embedded.
- Integrações antigas que presumem banco global devem usar explicitamente studio ou `FORJA_WORKSPACE`.

## Rastreamento

- Implementação: `lib/workspace.ts`, `bin/forja.ts`, `scripts/sync-universal-memory.ts`
- Testes: `test/embedded-mode.test.js`
- Documentação: `docs/modos-de-operacao.md`
- ADRs relacionadas: ADR-0019, ADR-0032, ADR-0075
