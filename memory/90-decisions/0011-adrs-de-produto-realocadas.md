# ADR-0011…0015: realocadas para o workspace (dados de produto)

- **Status**: superseded (realocação, não reversão)
- **Data**: 2026-07-06
- **Autor(es)**: apk
- **Tags**: governance, workspace, privacy

## Contexto
As ADRs 0011–0015 eram decisões de **produto** (monitoramento multiprotocolo, idempotência de recorrência, scheduler, importação CSV, notificações on-demand) tomadas durante o desenvolvimento de um produto gerado — não decisões do framework. Com a separação framework × workspace (ADR-0019) e a preparação do repo para visibilidade pública, dados de produto não podem viver no decision log do framework.

## Decisão
Mover as ADRs 0011–0015 para a ficha do produto de origem no workspace (`<workspace>/memory/30-projects/`), mantendo este tombstone para explicar o gap de numeração. A numeração do framework segue de 0016 em diante.

## Consequências
**Positivas**: decision log do framework contém apenas decisões do framework; repo publicável.
**Negativas / Trade-offs**: gap 0011–0015 na numeração (documentado aqui).

## Rastreamento
- ADRs relacionadas: ADR-0019 (workspace separado), ADR-0020 (core)
