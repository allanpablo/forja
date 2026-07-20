# ADR-0030: O projeto gerado herda os gates do framework

- **Status**: accepted
- **Data**: 2026-07-19
- **Autor(es)**: apk
- **Tags**: generators, gates, memory, governance

## Contexto

O framework construiu uma família de invariantes-que-rodam: `project:smoke`, `memory:audit`,
`adr-refs`, o `release:check`. Mas todos guardam o **framework**. O **projeto do usuário** não
herdava nenhum — gerava com mapas de memória honestos e, com o tempo, um rename sem atualizar o
`context.md` fazia o mapa mentir, silenciosamente, sem nada avisar. A economia de token da memória
(ADR-0009) se degrada, e ninguém percebe. É a mesma classe "vive por disciplina" que o ADR-0021
combate — só que na máquina do usuário, onde o framework não alcança por gate próprio.

## Decisão

O gerador **emite um gate self-contained no projeto**: `scripts/check-memory-maps.mjs`, uma versão
sem dependências do `memory:audit` (coerência mapa↔código: mapa não cita código morto, módulo sem
mapa avisa). Zero acoplamento ao `forjajs` — Node puro, roda em qualquer CI com `node
scripts/check-memory-maps.mjs`. O `project:smoke` do framework passa a **verificar que o gate está
presente** no projeto gerado, fechando o laço: o framework prova que propaga o invariante.

A filosofia de invariantes deixa de ser só do mantenedor do Forja e passa a viajar com cada projeto.

## Alternativas consideradas

- **Projeto depende de `forjajs` e roda `npx forja memory:audit`** — rejeitada: acopla um app NestJS
  ao framework inteiro (e ao `better-sqlite3`), pesado para um gate que é Node puro.
- **Emitir um workflow `.github/` pronto** — rejeitada (por ora): imporia GitHub Actions a todo
  projeto (alguns usam GitLab/outros). O script é portável; o usuário o pluga no CI que usa. Um
  workflow opcional pode vir em follow-up.
- **Não propagar (deixar como doc)** — rejeitada: é exatamente o "regra que depende de memória" que
  o framework existe para eliminar.

## Consequências

**Positivas**:
- O invariante mapa↔código viaja com o projeto; a economia de token da memória fica protegida na
  máquina do usuário, não só na do framework.
- Self-contained: sem dependência nova no projeto gerado.
- `project:smoke` prova a propagação (o gate está presente no output).

**Negativas / Trade-offs**:
- Duplicação de lógica (o `check-memory-maps.mjs` do projeto espelha o `lib/memory-audit.ts`). É o
  preço de projetos independentes; a lógica é pequena e estável.
- O gate não roda sozinho até o usuário plugá-lo no CI — o script está presente, o wiring é dele.

## Rastreamento
- Implementação: `lib/generators/memory-generator.ts` (emite o script),
  `lib/core/project-smoke.ts` (check `gate-inherited`)
- ADRs relacionadas: ADR-0009 (economia de token), ADR-0021 (invariante > disciplina), ADR-0029 (project:smoke), SPEC-017 (memory:audit)
