# ADR-0084: Drift Sentinel (SPEC-030) fecha — gate opt-in permanente, métrica reformulada

- **Status**: accepted
- **Data**: 2026-09-08
- **Autor(es)**: Allan Pablo / Claude
- **Tags**: drift, graph, governance, sdd

## Contexto

SPEC-030 entregou `drift:check` — reindexação determinística do workspace que sinaliza quando uma
relação `verified` do Engineering Graph deixou de ser reproduzível a partir do conteúdo atual do
documento que a originou. AC-1 a AC-5 estão implementados (`lib/drift-sentinel.ts`,
`scripts/drift-check.ts`, `lib/core/drift-gate.ts` ligando ao `check:all --with-drift` opt-in),
com testes em `test/drift-sentinel.test.js`.

A spec está `implementing` desde 2026-08-31 por um único motivo: a **métrica de sucesso do §8** —
"30 dias após o release, rodar `drift:check` num projeto real e ativo resulta em ao menos um
drift genuíno confirmado por um humano". Essa métrica é **infalsificável como bloqueio de
`done`**: ela depende de drift *acontecer* no mundo, o que ninguém controla nem força. O
dogfooding local contra o próprio monorepo nunca achou drift — que é o **estado saudável**, não
uma falha do sentinela. A spec apodrece num limbo enquanto se espera algo que talvez nunca venha
num intervalo dado.

## Decisão

**1 — `drift:check` permanece como gate opt-in (`check:all --with-drift`), nunca default.** O
custo (reindex completo do workspace) justifica o opt-in; o valor (pegar uma aresta `verified`
que morreu em silêncio) justifica manter o comando disponível e ligado ao `check:all` sob flag.
Nenhuma mudança no wiring atual.

**2 — `forja drift:check --all` é adicionado.** Roda `drift:check` uma vez por projeto do
workspace (`listProjects()`), cada um contra o próprio dir (`FORJA_GRAPH_ROOT`) e um grafo
**isolado e persistente** em `<projeto>/.context/drift-graph.db`. A primeira rodada de um projeto
semeia o grafo; da segunda em diante, compara. É o uso em lote que a user story 3 da SPEC-030
pede — "rodar antes de retomar um projeto que não toco há meses". Subprocess por projeto (mesmo
padrão de `drift-gate.ts`), sem misturar grafos.

**3 — O §8 da SPEC-030 é reformulado para um aceite observável agora:**
- `drift:check` é determinístico (mesmo input → mesmo resultado em duas rodadas);
- roda contra o monorepo reportando **zero** drift (nenhum falso positivo);
- `drift:check --all` completa sobre o workspace (0 projetos → saída limpa; N projetos → semeia).

**4 — "Drift real encontrado no mundo" vira janela de observação, não bloqueio.** Até
**2026-10-08** (30 dias): se **nenhum** drift real for confirmado **E** um falso positivo **for**
reportado, revisitar — rebaixar `drift:check` a ferramenta manual (tirar do `check:all`). Na
ausência dessa combinação, o comando fica como está.

**5 — SPEC-030 vai para `done`.**

## Alternativas consideradas

- **Continuar esperando a métrica original.** Rejeitado: infalsificável como gate de `done`; a
  spec fica em `implementing` indefinidamente e o processo perde credibilidade.
- **Rebaixar agora** (tirar `drift:check` do `check:all`). Rejeitado: não há evidência de que o
  sinal seja ruidoso — zero falso positivo no dogfooding. Rebaixar sem dado é tão arbitrário
  quanto esperar sem prazo.
- **`--all` reindexando tudo num grafo só.** Rejeitado: misturaria nós de N projetos; o subprocess
  por projeto com grafo isolado é limpo e reusa o mecanismo existente.

## Consequências

**Positivas**:
- A spec sai do limbo com um aceite que se pode verificar hoje.
- Consultores com muitos projetos gerados ganham o modo lote que a spec previa.
- A pergunta "o sinal vale o custo?" tem um prazo e um critério de revisão, não um "algum dia".

**Negativas / Trade-offs**:
- O valor de campo do `drift:check` (pegar um drift real antes de um humano tropeçar) continua
  **não comprovado** — só a corretude e o não-ruído estão. A janela de observação assume isso
  explicitamente.
- `--all` persiste um `.context/drift-graph.db` por projeto; é gitignorado no gerado, mas ocupa
  disco e cresce com o histórico.

## Rastreamento

- Implementação: `scripts/drift-check.ts` (`--all`), `lib/drift-sentinel.ts` (motor, inalterado)
- [Spec](../../specs/drift-sentinel/spec.md) (SPEC-030) · ADRs relacionadas: ADR-0078 (Engineering
  Control Plane), a auditoria de 2026-08-31 que originou a SPEC-030
- Revisão da janela de observação: 2026-10-08
