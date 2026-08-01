# ADR-0040: Context Engine determinístico com orçamento e cache por checksum

- **Status**: accepted
- **Data**: 2026-07-31
- **Autor(es)**: ForjaJS
- **Tags**: context, tokens, cache, memory

## Contexto

Enviar memória integral ao agente aumenta custo, repetição e risco de contexto obsoleto. Busca,
deduplicação, diff e imports são operações determinísticas e não devem depender de LLM.

## Decisão

O Context Engine recebe candidatos recortados de memória e GraphLoop, exige evidência atual,
ordena por relevância, deduplica por checksum e seleciona até o orçamento de tokens. O conteúdo
pode ser omitido no pacote e expandido sob demanda pelo checksum. Cache e métricas são portas e o
`ContextPackage` registra referências, checksum, tokens selecionados, cache hits e conteúdo não
utilizado.

## Consequências

O contexto enviado é menor, auditável e reproduzível. O Engine não lê banco nem arquivos; adapters
devem produzir candidatos com locators, snippets e evidências. A estimativa atual é bytes UTF-8 / 4,
compatível com o proxy existente do ForjaJS 1.x.

## Rastreamento

- Implementação: `packages/context/src/index.ts`
- Contrato: `packages/contracts/src/index.ts`
- Testes: `test/context.test.js`
- Relacionadas: ADR-0003, ADR-0009
