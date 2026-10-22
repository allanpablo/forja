# ADR-0092: Critérios de aceite ligados a testes pela citação no teste

- **Status**: accepted
- **Data**: 2026-10-21
- **Autor(es)**: Allan Pablo / Claude
- **Tags**: sdd, testes, governanca

## Contexto

As specs (ADR-0007) definem "pronto" em critérios `AC-N`, mas nada liga um critério ao teste que o
prova. Por costume, testes já citam `SPEC-029 AC-5` no nome ou num comentário, ou usam `AC-1:` num
arquivo dedicado a uma spec. Ninguém confere essa ligação.

## Decisão

1. **A ligação mora no teste**: citar `SPEC-NNN AC-N` (ou `<slug> AC-N`) no nome do teste ou num
   comentário. `AC-N` sozinho vale quando o arquivo cita uma única spec. Não há arquivo de mapeamento
   à parte, que envelheceria separado do teste.
2. **`forja spec:trace`** lê specs e testes e reporta critérios cobertos, sem teste e citações órfãs.
   É estático: não roda os testes, então serve para qualquer stack.
3. **Gate opt-in**: `--strict` rejeita (exit 2) specs `approved`/`implementing`/`done` com lacunas.
   Sem a flag, só informa, para não quebrar projetos com specs antigas.

## Alternativas consideradas

- **Tabela AC → teste dentro da spec.** Rejeitada: duplica a informação e envelhece quando o teste muda de nome.
- **Rodar os testes e mapear resultados por AC.** Rejeitada por ora: depende do executor de cada stack.
  A citação estática já responde "existe teste?" e "a citação aponta para algo real?".
- **Gate obrigatório no `spec:check`.** Rejeitada: specs `done` antigas passariam a falhar de uma vez.

## Consequências

- Citar o critério vira parte de escrever o teste (AGENTS.md e skill `testing` ensinam).
- Uma citação no texto conta como cobertura, mesmo que o teste seja fraco; a revisão do teste segue humana.
- Fixtures que contêm citações de exemplo (`'SPEC-001 AC-1: …'` como dado de teste) contariam como
  cobertura de uma spec real; ficam entre `spec-trace:off` e `spec-trace:on`. Achado no próprio Forja:
  a SPEC-001 aparecia com 2/7 critérios cobertos só por fixtures.
