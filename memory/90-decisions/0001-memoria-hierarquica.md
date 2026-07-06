# ADR-0001: Memória hierárquica em 9 camadas (00-90)

- **Status**: accepted
- **Data**: 2026-04-21
- **Tags**: memory, structure

## Contexto
Agentes precisam de contexto durável entre sessões, mas carregar todo o histórico estoura janela de tokens. Memórias planas (single file) ficam ingovernáveis acima de ~5k linhas; pastas sem semântica viram dump.

## Decisão
Adotar hierarquia fixa de 9 prefixos numerados em `memory/`:

| Prefixo | Conteúdo |
|---|---|
| `00-global` | Missão, padrões, política de contexto, contrato de agentes |
| `10-product` | Visão, personas, regras de negócio, NFRs |
| `20-architecture` | Frontend, backend, dados, segurança, observabilidade |
| `30-domains` | Um subdiretório por bounded-context (auth, billing, …) |
| `40-delivery` | Roadmap, sprint atual, backlog |
| `50-orchestration` | Topologia, roteamento, handoff protocol, playbook |
| `60-runs` | Log cronológico de execuções (arquivado após 30d) |
| `70-summaries` | Resumos global e por domínio (gerados por compress-memory) |
| `80-data` | Documentação do SQLite e schemas |
| `90-decisions` | ADRs |

## Alternativas consideradas
- **Memória plana em 1 arquivo** — rejeitada: ingovernável acima de 5k linhas
- **Pastas por feature sem prefixo** — rejeitada: ordem alfabética não reflete relevância
- **Banco vetorial puro** — rejeitada: perde estrutura humana-legível e versionamento git

## Consequências
**Positivas**: navegação previsível, prefixos ordenam por relevância de contexto, fácil arquivamento por nível.
**Negativas**: rigidez — adicionar uma camada nova exige decisão coletiva.

## Rastreamento
- `bin/create-memory-nest-kit.js` (writeMemoryAndOps)
- `lib/generators/memory-generator.js`
- `memory/00-global/` (este repositório)
