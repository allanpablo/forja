# ADR-0075: Workspace de demonstração isolado

- **Status**: proposed
- **Data**: 2026-08-17
- **Autor(es)**: Allan Pablo
- **Tags**: demo, workspace, marketing, local-first

## Contexto

O dashboard e a demonstração comercial precisam de artefatos visuais, mas usar dados reais de produto
expõe contexto e torna a apresentação irreproduzível. Uma UI vazia também não permite demonstrar o
fluxo SDD, handoffs, memória e observabilidade.

## Decisão

Adicionar `forja demo:workspace`, que cria por padrão `~/forja-demo-workspace`, separado do workspace
de produção. O cenário é explicitamente marcado, contém apenas dados sintéticos e recusa escrever em
um diretório existente sem o selo de demo.

## Alternativas consideradas

- **Preencher o workspace padrão**: rejeitada porque mistura dados de apresentação e dados reais.
- **Usar screenshots estáticos**: rejeitada porque não prova que CLI, SQLite e dashboard lêem o mesmo
  cenário local.
- **Chamar uma LLM para gerar dados**: rejeitada porque torna a demo variável, pode exigir credenciais
  e não acrescenta prova de produto.

## Consequências

**Positivas**:
- Demonstrações reproduzíveis mostram artefatos reais do ForjaJS sem dados de cliente.
- Dashboard, CLI e observabilidade podem ser apresentados com a mesma fonte local.

**Negativas / Trade-offs**:
- Os dados precisam permanecer explicitamente rotulados como sintéticos.
- O cenário não substitui uma prova de autonomia com Git real, coberta por `demo:autonomy`.

## Rastreamento

- Implementação: `scripts/demo-workspace.ts`, `lib/core/registry.ts`
- Testes: `test/demo-workspace.test.js`
- Documentação: `docs/produto/roteiro-demo.md`
- ADRs relacionadas: ADR-0019, ADR-0069, ADR-0074
