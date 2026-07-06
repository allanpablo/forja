# Missão Universal: Projeto Agentes

## Propósito
Criar um ecossistema de agentes orquestrados, independentes de LLM, com memória persistente e universal para acelerar o desenvolvimento de produtos escaláveis.

## Objetivos
1. **Independência de LLM**: Funcionar com Gemini, Claude, OpenAI, etc.
2. **Memória Universal**: Banco de dados SQLite central que indexa documentação de todos os projetos.
3. **Escalabilidade**: Camadas de metodologia para crescimento do produto (Growth, Scaling).
4. **Isolamento**: Projetos gerados são isolados e não poluem o repositório principal.

## Pilares
- **Memória Hierárquica**: Global -> Projeto -> Domínio -> Tarefa.
- **Orquestração**: Divisão clara de papéis e responsabilidades.
- **Continuidade**: Handoffs que preservam o contexto entre sessões e agentes.
