# Visão de Produto — Forja

> A Forja transforma IA de codificação em uma **equipe de engenharia com processo e memória**: todo projeto nasce com spec, toda decisão vira ADR, e nada se perde entre sessões.

## O problema (o inimigo)

Agentes de IA são amnésicos e indisciplinados. Cada sessão recomeça do zero, decisões de arquitetura evaporam, o código diverge da intenção — e quem opera vários produtos ao mesmo tempo paga esse imposto multiplicado por N. Um assistente brilhante sem processo produz velocidade sem direção.

## A aposta

O diferencial durável não é o modelo (commodity que melhora sozinho), é o que fica em volta dele:

1. **Memória que sobrevive** — contexto hierárquico, buscável (SQLite FTS5), compartilhado entre sessões e entre IAs (ADR-0001/0002/0003).
2. **Processo que governa** — nada vira código sem spec; nada estrutural sem ADR; handoffs auditáveis de 7 campos (ADR-0005); comandos passam por um core único com gates e trilha de auditoria (ADR-0020).
3. **Fábrica, não projeto único** — workspace multi-produto com canto fixo (ADR-0019), times de agentes desenhados por projeto (harness), code intelligence como gate (ADR-0017).

## Posicionamento

- **Claude Code sozinho** é um engenheiro brilhante e amnésico; a Forja é o estúdio em volta dele.
- **Frameworks de agentes** (LangGraph etc.) são infraestrutura para *construir* agentes; a Forja é a camada de cima — o sistema operacional do estúdio de software de uma pessoa só.
- **Multi-IA por design** (Claude, Copilot, Gemini, Codex): nenhum vendor entrega isso, e a memória/processo não fica refém de um fornecedor.

A stack gerada (NestJS hoje) é **um boilerplate entre vários** — a identidade da Forja é o processo + a memória, não o framework de backend.

## Métrica-norte

Tempo entre "ideia" e "primeira feature governada em produção" num workspace com N projetos ativos, sem perda de contexto entre sessões e sem decisão estrutural fora de ADR.
