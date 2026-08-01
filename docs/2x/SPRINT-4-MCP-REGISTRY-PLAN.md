# Sprint 4 — MCP nativo sobre o Capability Registry

## Objetivo

Disponibilizar o catálogo de capabilities por MCP sem duplicar ferramentas, handlers ou regras de
policy, incluindo um transporte local JSON-RPC por stdio.

## Escopo

- `forja mcp:start`;
- `tools/list`, `tools/call`, `resources/list`, `resources/read` e `initialize`;
- `forja_capability_describe`;
- ferramentas dinâmicas derivadas dos IDs visíveis no registry;
- execução dinâmica delegada ao mesmo `CapabilityRegistry`;
- identidade e permissões MCP locais;
- testes do adapter e smoke test stdio.

Fora do escopo: transporte HTTP/SSE MCP, autenticação remota, GraphLoop persistente e aprovação
interativa de ações críticas.

## Critérios de aceite

1. `mcp:start` responde JSON-RPC por linha sem depender de provedor externo.
2. `tools/list` contém ferramentas fixas e uma ferramenta derivada por capability visível.
3. `forja_capability_describe` retorna a definição versionada do registry.
4. Execução dinâmica retorna `ExecutionResult` e passa pelo Policy Engine.
5. Recursos MCP continuam disponíveis e erros são normalizados.
6. Nenhuma regra de domínio é implementada dentro do transporte stdio.

## Riscos e hipóteses

- O transporte stdio implementa o subconjunto local necessário para a operação do Forja; clientes
  que exigirem recursos MCP adicionais ficam para uma sprint própria.
- Schemas de payload específicos ainda são genéricos porque `CapabilityDefinition` não carrega um
  schema de input serializável; a validação definitiva continua no registry.
