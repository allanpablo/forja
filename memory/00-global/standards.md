# Padrões Globais de Engenharia e Crescimento

## Camada de Metodologia Ágil (Agile)
- **Sprints**: Ciclos de 1 a 2 semanas focados em entregas de valor.
- **Backlog**: Única fonte de verdade para futuras implementações.
- **Current Sprint**: Itens em execução imediata. Cada item deve ter um `owner_agent`.
- **Handoffs**: Obrigatórios após cada subtarefa para manter a continuidade.

## Camada de Crescimento (Growth - AARRR)
Todo projeto deve mapear e otimizar o funil:
1. **Aquisição**: Como o usuário chega (SEO, Ads, APIs).
2. **Ativação**: Primeira experiência de valor (Onboarding).
3. **Retenção**: Uso contínuo (Engajamento, Notificações).
4. **Receita**: Monetização (Abacate Pay, Assinaturas).
5. **Recomendação**: Viralidade e indicações.

## Camada de Escalonamento (Scaling - 12-Factor)
Padrões para aplicações modernas e resilientes:
- **Codebase**: Um repositório, múltiplos deploys.
- **Dependencies**: Declaradas e isoladas explicitamente.
- **Config**: Armazenada no ambiente (Environment variables).
- **Backing Services**: Tratados como recursos anexados.
- **Stateless**: Processos devem ser sem estado e compartilhar nada.

## Camada de Produto (Product Discovery)
Protocolo mandatório para o **Agente de Produto**:
- **Definição de Problema**: Antes de qualquer feature, o problema deve ser explicitado.
- **Métricas de Sucesso**: Como mediremos se a feature foi bem-sucedida?
- **Documentação**: Atualização obrigatória de `memory/10-product/business-rules.md`.

## Camada de Marketing e Growth (AARRR Metrics)
Protocolo para o **Agente de Marketing**:
- **SEO & Copy**: Todo projeto deve ter uma estratégia de conteúdo técnico.
- **Loops de Viralidade**: Identificar mecanismos de indicação e compartilhamento (Recomendação).
- **Ativação**: O "Aha! Moment" do usuário deve ser o foco do primeiro deploy.

## Camada de Governança e Compliance
Protocolo para o **Agente de Governança**:
- **Auditoria de Decisão**: Nenhuma mudança arquitetural sem `ADR`.
- **Privacidade by Design**: Verificação de vazamento de PII em logs e tabelas.
- **Qualidade de Handoff**: O score de maturidade (`project:check`) deve ser mantido acima de 80%.

## Qualidade de Código (Clean Code)
...
- **SOLID**: Princípios fundamentais em toda implementação.
- **Surgical Changes**: Evitar refatorações globais em tarefas de feature.
- **Test-First**: Priorizar a criação de testes antes da implementação final.
