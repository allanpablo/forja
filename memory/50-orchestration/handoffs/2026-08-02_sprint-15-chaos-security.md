# Handoff — Sprint 15: caos e segurança

- **from:** chaos-and-security-engineer
- **to:** release-hardening-engineer
- **intent:** fechar os casos de falha restantes antes do próximo release
- **context:** adapter Git, policy, SQLite, MCP stdio, Sprint 15, ADR-0072
- **acceptance:** approval expirada, payload corrompido, deny-by-default,
  path traversal e herança de secrets têm comportamento determinístico e testado
- **constraints:** sem mascarar corrupção; sem secrets no ambiente padrão do sandbox;
  nenhuma leitura fora da raiz; alterações críticas continuam sob Policy Engine
- **return:** implementar SQLite lock/timeout, processo morto no meio do step,
  checkpoint rollback, fuzz MCP, plugins maliciosos e threat model formal
- **evidence:** testes de chaos/security e 291+ testes de integração existentes
