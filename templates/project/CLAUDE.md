@AGENTS.md

## Claude Code neste projeto

- Os hooks em `.claude/settings.json` abrem cada sessão com o estado do projeto (`forja hook:session-start`)
  e anexam a spec citada no prompt (`forja hook:user-prompt`); ao fim de cada turno e antes de compactar,
  `forja hook:session-memory` grava o checkpoint da sessão em `memory/60-runs/sessions/`. Se o
  briefing não aparecer, rode `forja project:wire --check`.
- O servidor MCP `forja` (`.mcp.json`) expõe as capacidades do Forja como ferramentas.
- Sub-agents de cada papel ficam em `.claude/agents/`. Delegue a eles quando a tarefa cruzar papéis.
