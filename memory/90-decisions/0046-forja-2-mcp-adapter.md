# ADR-0046 — MCP como adaptador fino sobre o núcleo

- **Status**: accepted
- **Data**: 2026-07-31
- **Contexto**: Agentes precisam consumir capabilities, contexto, grafo, tarefas e handoffs por MCP sem criar uma segunda implementação de domínio.
- **Decisão**: `packages/mcp` expõe `McpServer`, definições de tools, recursos oficiais e resultados estruturados. O servidor delega a portas e engines existentes, transportando identidade, política e contratos versionados.
- **Regras**:
  - Registry continua sendo a fonte única de execução de capabilities;
  - input é validado antes do dispatch e erros são normalizados;
  - ações mutáveis do MCP passam por `McpPolicy`;
  - recursos são providers externos e ausência de provider não gera conteúdo fictício;
  - o pacote não importa SDK específico de MCP, NestJS, HTTP ou banco nesta fatia.
- **Alternativas rejeitadas**:
  - lógica de negócio dentro de handlers MCP: duplicaria regras e dificultaria CLI/SDK/API consistentes;
  - recurso MCP com snapshot inventado: produziria contexto sem evidência;
  - executar capability diretamente no MCP: bypassaria Registry e Policy.
- **Consequências**: Um adapter de transporte MCP poderá converter `McpServer` para o protocolo oficial; o núcleo permanece testável sem servidor externo.
- **Evidências**: `test/mcp.test.js`, `npm run types:check`, `git diff --check`.
