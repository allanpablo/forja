# ADR-0006: Documentação estruturada por persona

- **Status**: accepted
- **Data**: 2026-05-02
- **Tags**: docs, onboarding

## Contexto
Antes da refator, 30+ `.md` no root sem ordem fizeram onboarding levar horas. Cada perfil (executivo, arquiteto, dev, QA) precisava de visão diferente, mas tudo era apresentado em massa.

## Decisão
Adotar `docs/personas/{executive,architect,developer,qa}/README.md` como ponto de entrada por papel. `DOC-MAP.md` no root indexa as personas. Documentos genéricos (`quick-reference`, `glossary`, `token-optimization`, `dev-workflow`) ficam em `docs/` raiz.

## Alternativas consideradas
- **README único gigante** — rejeitada: ninguém lê linear
- **Wiki externa (Notion/GitBook)** — rejeitada: sai do repo, vira desincronizado

## Consequências
**Positivas**: tempo de onboarding caiu ~83% (medido em tempo até primeiro commit produtivo).
**Negativas**: 4 entradas para manter; risco de divergência mitigado por DOC-MAP central.

## Rastreamento
- `docs/personas/`, `docs/`, `DOC-MAP.md`
- `docs/archive/FASE2-SUMMARY.md` (relatório original)
