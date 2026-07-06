# Capacidades externas integradas

Três produtos open-source foram alocados ao `2-projeto-agents` como capacidades de
primeira classe (ver [ADR-0016](../memory/90-decisions/0016-integracao-capacidades-externas.md)).
Antigamente viviam em `projects/`; agora estão no workspace Forja
(`~/forja-workspace`, configurável — ver [ADR-0019](../memory/90-decisions/0019-workspace-separado.md)).
Aqui ficam só a fiação e o modo de uso.

## 1. codegraph — análise de código (MCP)

Grafo de código semântico, 100% local. Registrado como **servidor MCP** no repo
(`.mcp.json`) e disponível no PATH (`~/.local/bin/codegraph`).

**Ferramentas MCP** (aparecem automaticamente em sessões Claude Code neste repo):
- `codegraph_explore` — símbolos relevantes + call paths de uma área, num disparo só.
- `codegraph_node` — fonte de um símbolo + trilha de callers/callees, ou leitura de arquivo.

**CLI / npm scripts:**
```bash
npm run code:index    # codegraph init — constrói o índice inicial (respeita .gitignore)
npm run code:sync     # sincroniza mudanças desde o último índice
npm run code:status   # status e estatísticas do índice
npm run code:query "<termo>"   # busca símbolos
codegraph explore "<query>"    # exploração ad-hoc
codegraph callers <símbolo>    # quem chama um símbolo
```

O índice fica em `.codegraph/` (já coberto por `.gitignore` do projeto, se necessário).

## 2. harness — orquestração de times de agentes (plugin)

Plugin do Claude Code (`harness@harness-marketplace`, instalado e habilitado) que
transforma uma descrição de domínio em um time de agentes + skills, a partir de 6
padrões: Pipeline, Fan-out/Fan-in, Expert Pool, Producer-Reviewer, Supervisor,
Hierarchical Delegation.

**Uso:** numa sessão Claude Code, peça _"build a harness for this project"_ (ou
_"configure um harness para X"_) e ele gera `.claude/agents/` e `.claude/skills/`
adequados ao domínio.

**Gestão:**
```bash
claude plugin list                       # confirmar harness habilitado
claude plugin marketplace list           # confirmar marketplace local
claude plugin update harness@harness-marketplace
```

Complementa o sistema de orquestração nativo do framework (AGENTS.md, handoffs,
`scripts/agent-router.mjs`): harness ajuda a *desenhar* novos times; o framework
*opera* os handoffs.

## 3. ai-engineering-from-scratch — base de conhecimento (referência)

Currículo de AI engineering: 503 lições, 20 fases, 4 linguagens (Python, TypeScript,
Rust, Julia). Material de referência para fundamentar decisões técnicas de IA do
framework. Não há instalação — consultar diretamente:

- `projects/ai-engineering-from-scratch-main/ROADMAP.md` — índice das 20 fases.
- `projects/ai-engineering-from-scratch-main/phases/` — lições por fase.
- `projects/ai-engineering-from-scratch-main/glossary/` — glossário.

## Reinstalação

Se `projects/` for limpo, recriar a fiação:
```bash
ln -sf "$PWD/projects/codegraph-linux-x64/bin/codegraph" ~/.local/bin/codegraph
claude mcp add codegraph --scope project -- codegraph serve --mcp
claude plugin marketplace add "$PWD/projects/harness-main"
claude plugin install harness@harness-marketplace
```
