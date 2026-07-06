# Política de Contexto e Comunicação

## Estrutura de Contexto
- **0-global**: Estratégia, padrões, contrato de agentes
- **10-product**: Requisitos, personas, regras de negócio
- **20-architecture**: Design técnico, componentes, fluxos
- **30-domains**: Contexto por bounded domain (catalog, orders, payments, inventory)
- **40-delivery**: Roadmap, sprints, backlog
- **50-orchestration**: Roteamento entre agentes, handoffs, parallelização
- **60-runs**: Logs de execução, timestamp, status
- **70-summaries**: Resumos executivos e técnicos
- **80-data**: Schemas, SQLite docs
- **90-decisions**: ADRs (Architecture Decision Records)

## Fluxo de Comunicação
1. **Orquestrador** lê missão + padrões
2. **Agentes de negócio** consultam 10-product + 30-domains
3. **Agentes técnicos** consultam 20-architecture + padrões
4. **Após execução** → append em 50-orchestration/handoffs/ com timestamp
5. **Consolidação** → update em 70-summaries/

## Critério de Atualização
- Mudanças de requisito → 10-product
- Mudanças arquiteturais → 20-architecture + 90-decisions (ADR)
- Novos domínios → 30-domains/<novo>/
- Decisões → 90-decisions/ADR-XXX.md (ISO 8601 + slug)

## Retenção
- Runs: Últimas 30 dias em 60-runs/
- Handoffs: Permanente em 50-orchestration/handoffs/
- Summaries: Sempre consolidados (1 global + 1 por domínio)
