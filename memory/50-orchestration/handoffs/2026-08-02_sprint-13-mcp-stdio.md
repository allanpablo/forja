# Handoff — Sprint 13: MCP stdio real

- **from:** autonomy-integration-engineer
- **to:** persistence-chaos-engineer
- **intent:** continuar a prova de última milha do ForjaJS 2.x
- **context:** `bin/forja.ts`, `test/mcp-stdio.test.js`, Sprint 13, ADR-0070
- **acceptance:** cliente filho inicia MCP real, negocia initialize, lista tools,
  descreve e executa capability, lê resource e encerra por EOF sem ruído em stdout
- **constraints:** stdio newline-delimited JSON-RPC; notificações não recebem resposta;
  nenhuma regra de negócio nova no transporte
- **return:** provar restart abrupto do servidor e retomada de runtime/approval/contexto
  com SQLite; adicionar casos de desconexão e payload inválido
- **evidence:** teste de processo real aprovado; stdout parseável; stderr vazio;
  shutdown exit code 0
