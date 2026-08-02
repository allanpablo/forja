# ADR-0070 — MCP stdio como transporte testado por processo real

- **Status:** aceito
- **Decisão:** o transporte MCP local usa JSON-RPC delimitado por newline em
  stdin/stdout; logs operacionais não podem ocupar stdout. Notificações sem `id`
  não recebem resposta. EOF é o shutdown normal.
- **Motivo:** testes unitários do adapter não provavam compatibilidade do processo
  lançado pelo usuário nem isolamento do canal de protocolo.
- **Consequências:** o teste inicia o binário real, envia mensagens em sequência e
  rejeita stdout não parseável; diagnósticos devem usar stderr.
- **Evidência:** `test/mcp-stdio.test.js`.
