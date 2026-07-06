# Personas — Forja

## 1. Dev solo multi-produto (persona primária)

- **Contexto**: opera 2–10 produtos simultaneamente usando IA como principal força de trabalho; não tem PM, arquiteto nem QA dedicados.
- **Dores**: cada sessão de IA recomeça do zero; decisões evaporam; contexto de um produto vaza no outro; disciplina de processo depende só da própria memória.
- **Ganhos esperados**: retomar qualquer produto em minutos (memória + smart-context), decisões rastreadas (ADRs), pipeline que impede código sem spec, trilha de auditoria do que rodou (core, ADR-0020).

## 2. Time pequeno com IA intensiva (persona secundária)

- **Contexto**: 2–5 pessoas compartilhando agentes e convenções; múltiplas IAs no mesmo repo (Claude, Copilot, Gemini, Codex).
- **Dores**: cada pessoa opera a IA de um jeito; handoffs informais; retrabalho por falta de fonte única de decisão.
- **Ganhos esperados**: papéis e handoffs padronizados (7 campos), memória universal compartilhada, gates de governança iguais para todos.

## 3. Operador de agentes ("agent wrangler")

- **Contexto**: desenha e roda times de agentes por projeto (harness); trata a IA como equipe, não como autocomplete.
- **Dores**: sem topologia clara, agentes pisam um no outro; sem gates, entregam código não verificável.
- **Ganhos esperados**: topologia de 6 papéis pronta, codegraph como gate de impacto, runbooks GSD verificáveis por comando.

> Personas de produtos gerados vivem na ficha de cada projeto no workspace, não aqui.
