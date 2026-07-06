# ADR-0016: Integração de capacidades externas (codegraph, harness, ai-engineering)

- **Status**: accepted
- **Data**: 2026-06-15
- **Autor(es)**: Allan Pablo
- **Tags**: orchestration, tooling, knowledge-base, mcp, plugins

## Contexto
Durante a refatoração do framework `2-projeto-agents`, três produtos externos
(open-source, baixados em `projects/`, que está 100% no `.gitignore`) foram
escolhidos para serem alocados como capacidades de primeira classe do framework,
cobrindo três eixos da refatoração:

- **Orquestração de agentes** → `harness-main` (plugin do Claude Code, Apache-2.0):
  fábrica de arquitetura de times de agentes a partir de 6 padrões.
- **Análise de código** → `codegraph-linux-x64` (CLI binária, MIT): grafo de código
  semântico com servidor MCP (`codegraph_explore`, `codegraph_node`).
- **Base de conhecimento** → `ai-engineering-from-scratch-main` (currículo, MIT):
  503 lições / 20 fases de AI engineering como material de referência.

Restrição: `projects/` é off-limits para edição e não é versionado, logo a
integração não pode depender de editar nada lá dentro, nem assumir que o conteúdo
permanece commitado no repo do framework.

## Decisão
Integrar cada produto pelo seu mecanismo nativo, com os artefatos de fiação na raiz
do framework (versionados), e nunca dentro de `projects/`:

1. **codegraph** — binário linkado em `~/.local/bin/codegraph` (desacopla do path
   em `projects/`) e registrado como servidor MCP em **escopo project** (`.mcp.json`
   na raiz do repo, comando `codegraph serve --mcp`). Scripts `npm run code:index|sync|status|query`.
2. **harness** — marketplace local registrado (`claude plugin marketplace add`) e
   plugin `harness@harness-marketplace` instalado/habilitado (escopo user).
3. **ai-engineering** — registrado como base de conhecimento/referência em
   `DOC-MAP.md` e `docs/capacidades-externas.md`; não há código a instalar.

## Alternativas consideradas
- **Mover o código para dentro do repo (vendoring)**: rejeitada — são repos externos
  com licenças próprias e tamanho elevado (codegraph traz binário node de ~123MB);
  o usuário pediu "integrar como capacidade", não "mover".
- **MCP do codegraph em escopo user/global**: rejeitada — a intenção é atar a
  capacidade a *este* repo; escopo project (`.mcp.json`) viaja com o framework.
- **Carregar harness só por `--plugin-dir` (sessão)**: rejeitada — não persiste;
  marketplace + install dá capacidade permanente.

## Consequências
**Positivas**:
- Capacidades nativas: harness disponível como plugin, codegraph como ferramentas MCP
  dentro de qualquer sessão Claude Code no repo, ai-engineering como referência catalogada.
- `.mcp.json` versionado: quem clonar o repo herda o MCP do codegraph.
- Baixo acoplamento ao conteúdo gitignored de `projects/` para o codegraph (via PATH).

**Negativas / Trade-offs**:
- O symlink do codegraph e o marketplace do harness ainda apontam para
  `projects/codegraph-linux-x64` e `projects/harness-main` no disco local; se essas
  pastas forem removidas, as capacidades quebram (precisam ser reinstaladas).
- harness fica em escopo **user** (máquina do usuário), não project — não viaja com o repo.

## Rastreamento
- Implementação: `.mcp.json`, `package.json` (scripts `code:*`), `~/.local/bin/codegraph`,
  marketplace `harness-marketplace`, `docs/capacidades-externas.md`, `DOC-MAP.md`
- Fontes: github.com/colbymchenry/codegraph, github.com/revfactory/harness,
  github.com/rohitg00/ai-engineering-from-scratch
- ADRs relacionadas: ADR-0008 (sub-agents), ADR-0009 (hooks/token economy)
