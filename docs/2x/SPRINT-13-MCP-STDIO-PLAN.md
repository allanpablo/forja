# Sprint 13 — MCP stdio real

## Objetivo

Provar que clientes externos conseguem iniciar `forja mcp:start`, negociar o
protocolo JSON-RPC por stdio, descobrir tools, descrever e executar capability,
ler resource e encerrar sem perder o contrato de transporte.

## Critérios de aceite

- processo MCP real é iniciado por `node bin/forja.ts mcp:start`;
- cada resposta é JSON-RPC válido em stdout;
- stdout não contém logs não-JSON e stderr permanece limpo no caminho feliz;
- `initialize`, `notifications/initialized`, `tools/list`, `tools/call`,
  `resources/list` e `resources/read` funcionam;
- execução retorna `ExecutionResult` estruturado;
- EOF encerra o servidor com exit code 0.

## Evidência

`test/mcp-stdio.test.js` executa um cliente filho real contra o transporte.

## Próximo passo

Compor o mesmo transporte no servidor oficial e provar reinício abrupto com
runtime, approval, context cache e GraphLoop persistidos.
