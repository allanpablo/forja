# Capacidades externas integradas

Três produtos open-source foram integrados ao framework como capacidades de
primeira classe (ver [ADR-0016](../memory/90-decisions/0016-integracao-capacidades-externas.md)).
Os produtos em si **não são versionados neste repo** — são instalados por máquina.
O que o repo versiona é a **fiação**: `.mcp.json` (servidor MCP do codegraph),
os comandos `code:*` no registry do core e este guia. O estado da instalação na
sua máquina é reportado por `forja tools:doctor`.

| Capacidade | Eixo | Fonte |
|---|---|---|
| **codegraph** | análise de código (MCP + CLI) | [colbymchenry/codegraph](https://github.com/colbymchenry/codegraph) |
| **harness** | desenho de times de agentes (plugin Claude Code) | [revfactory/harness](https://github.com/revfactory/harness) |
| **ai-engineering-from-scratch** | base de conhecimento (referência) | [rohitg00/ai-engineering-from-scratch](https://github.com/rohitg00/ai-engineering-from-scratch) |

## 1. codegraph — análise de código (MCP)

Grafo de código semântico, 100% local. Registrado como **servidor MCP** no repo
(`.mcp.json`, comando `codegraph serve --mcp`) — quem clona o repo herda o registro;
basta ter o binário `codegraph` no PATH.

**Ferramentas MCP** (aparecem automaticamente em sessões Claude Code neste repo):
- `codegraph_explore` — símbolos relevantes + call paths de uma área, num disparo só.
- `codegraph_node` — fonte de um símbolo + trilha de callers/callees, ou leitura de arquivo.

**CLI (via core `forja`):**
```bash
forja code:index            # codegraph init — constrói o índice inicial (respeita .gitignore)
forja code:sync             # sincroniza mudanças desde o último índice
forja code:status           # status e estatísticas do índice
forja code:query "<termo>"  # busca símbolos
forja code:check            # gate: índice confiável (worktree + freshness, ADR-0017)
forja code:impact <símbolo> # chamadores + blast radius antes de editar
codegraph explore "<query>" # exploração ad-hoc direto no binário
codegraph callers <símbolo> # quem chama um símbolo
```

O índice fica em `.codegraph/` (coberto pelo `.gitignore` do projeto).

## 2. harness — orquestração de times de agentes (plugin)

Plugin do Claude Code (`harness@harness-marketplace`) que transforma uma descrição
de domínio em um time de agentes + skills, a partir de 6 padrões: Pipeline,
Fan-out/Fan-in, Expert Pool, Producer-Reviewer, Supervisor, Hierarchical Delegation.

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
`forja gsd:handoff` / `forja agent:route`): harness ajuda a *desenhar* novos times;
o framework *opera* os handoffs.

## 3. ai-engineering-from-scratch — base de conhecimento (referência)

Currículo de AI engineering: 503 lições, 20 fases, 4 linguagens (Python, TypeScript,
Rust, Julia). Material de referência para fundamentar decisões técnicas de IA do
framework. Não há instalação nem fiação — consultar direto no repositório upstream:

- [`ROADMAP.md`](https://github.com/rohitg00/ai-engineering-from-scratch/blob/main/ROADMAP.md) — índice das 20 fases.
- `phases/` — lições por fase.
- `glossary/` — glossário.

## Instalação / reinstalação

O `forja tools:doctor` diz o que falta e como instalar. Para as capacidades deste guia:

```bash
# codegraph — binário no PATH (o .mcp.json versionado faz o resto)
npm i -g @codegraph/cli

# harness — clonar o repo e registrar como marketplace local
git clone https://github.com/revfactory/harness ~/tools/harness
claude plugin marketplace add ~/tools/harness
claude plugin install harness@harness-marketplace
```

Depois, confira com `forja tools:doctor` (codegraph) e `claude plugin list` (harness).
Ferramentas ausentes apenas desativam seus gates — o fluxo nunca trava por elas.
