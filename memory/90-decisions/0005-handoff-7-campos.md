# ADR-0005: Handoff entre agentes com 7 campos obrigatórios

- **Status**: accepted
- **Data**: 2026-04-26
- **Tags**: orchestration, handoff

## Contexto
Handoffs em texto-livre entre agentes (Product → SDD Architect → Worker) perdiam contexto, geravam retrabalho e ambiguidade. Sem contrato, cada agente inventa formato.

## Decisão
Todo handoff em `memory/50-orchestration/handoffs/` deve carregar 7 campos:

1. **from** — agente origem
2. **to** — agente destino
3. **intent** — verbo curto: implement | review | plan | research
4. **context** — referências (paths, ADRs, specs) suficientes para isolar a tarefa
5. **acceptance** — critérios mensuráveis de "pronto"
6. **constraints** — limites (tempo, escopo, padrões a respeitar)
7. **return** — o que o destinatário deve devolver e onde

## Alternativas consideradas
- **Texto-livre** — rejeitada (era o estado anterior)
- **Schema mais rico (15+ campos)** — rejeitada: fricção alta, agentes esqueciam

## Consequências
**Positivas**: handoff verificável programaticamente, qualidade mínima garantida.
**Negativas**: precisa ferramenta (`append-handoff.mjs`) para não virar burocracia.

## Rastreamento
- `lib/generators/memory-generator.js` (templates de `50-orchestration/`)
- `scripts/append-handoff.mjs` (no projeto gerado)
- Esta refator: migrar handoff para tabela SQLite (ADR futura)
