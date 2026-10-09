# Criar um projeto — `forja project:new`

Cria um projeto no workspace Forja (`~/forja-workspace/projects/<nome>`) já conectado à IA que você
usa. O gerador é `bin/init-project.ts`; a conexão vem de `lib/project-wiring.ts` (ADR-0086).

```bash
forja workspace:init                                   # uma vez por máquina
forja project:new meu-projeto --ai claude,codex
cd ~/forja-workspace/projects/meu-projeto
forja project:wire --check                             # tudo conectado?
forja status                                           # memória indexada, specs, handoffs
```

## Opções

| Opção | Padrão | Efeito |
|---|---|---|
| `--ai <lista>` | `copilot,claude,gemini,codex` | IAs a conectar |
| `--template <nome>` | — | Parte de um template validado (`forja project:templates`) |
| `--skip-backend` | — | Não gera nem instala o backend NestJS |
| `--skip-db` | — | Não indexa a memória do projeto |
| `--skip-git` | — | Não roda `git init` |
| `--skip-design` | — | Não copia a biblioteca `design-md/` |
| `--verbose` | — | Saída detalhada (ex.: erros do `npm install`) |

O workspace é resolvido por: `FORJA_WORKSPACE` → `workspaceRoot` em `~/.forjarc.json` →
`~/forja-workspace`.

## O que acontece, em ordem

1. **git init** e `.gitignore` inicial.
2. **Memória e agentes** (`create-memory-nest-kit`): `memory/` hierárquica (00-global a
   90-decisions), `agents/`, `prompts/`, `skills/`, `specs/` e o backend NestJS (exceto com
   `--skip-backend`). O backend segue o `nest new` do NestJS 12: ESM, Vitest, oxlint; a página
   `/api/ops` mostra specs, handoffs e a memória indexada do projeto.
   - Com `--template`, o backend e a memória específica vêm do boilerplate (ADR-0088).
3. **design-md/**: biblioteca de referências de design.
4. **Conexão com a IA**:
   - `AGENTS.md` com o bloco do Forja (lido por Codex, Copilot agent e Gemini).
   - `CLAUDE.md` e `GEMINI.md` importando o `AGENTS.md`; `.github/copilot-instructions.md`.
   - `.claude/settings.json`: hooks `forja hook:session-start` (briefing da sessão) e
     `forja hook:user-prompt` (anexa a spec citada), mais a permissão `Bash(forja *)`.
   - `.claude/agents/`: orchestrator, product, sdd-architect, context-engineer, governance, marketing.
   - `.mcp.json`: servidor `forja mcp:start` (e `codegraph`, se instalado); o mesmo servidor em
     `.codex/config.toml` (Codex), `.gemini/settings.json` (Gemini) e `.vscode/mcp.json` (Copilot).
   - `.forja/models.json`: cadeia de fallback entre IAs.
   - `memory/sqlite/` e `.context/` no `.gitignore`.
5. **npm install** do backend.
6. **Indexação da memória** (`forja sync:universal` no projeto).
7. **Context pack** em `.context/context-pack.md`.
8. **Ficha** do projeto em `<workspace>/memory/30-projects/<nome>.md`.

No fim aparece um resumo. Falha essencial (ex.: a conexão não verificou) faz o comando sair com
**exit 1** e listar cada pendência. Falha recuperável (ex.: `npm install` sem rede) aparece como
pendência, com o comando para refazer.

## O que a IA encontra ao abrir o projeto

- **Claude Code**: lê o `CLAUDE.md` → `AGENTS.md`; o hook de sessão injeta specs ativas, handoffs
  do projeto e a saúde do núcleo; ao citar uma spec no prompt, o hook anexa spec, plan e tasks.
- **Codex / Copilot / Gemini**: leem o `AGENTS.md` (o Gemini via `GEMINI.md`, o Copilot via
  `.github/copilot-instructions.md`).
- **Qualquer IA com MCP**: as capacidades do Forja como ferramentas (`forja mcp:start`).

Hooks e MCP chamam o binário `forja`. Instale-o globalmente (`npm i -g forjajs`). Sem ele, a sessão
abre normalmente e o `project:wire --check` avisa.

## Seu conteúdo é preservado

Em `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` e no arquivo do Copilot, o Forja só reescreve o trecho entre
`<!-- forja:begin -->` e `<!-- forja:end -->`. Um sub-agent em `.claude/agents/` que você editar e do
qual remover a marca `<!-- forja:managed -->` não é mais tocado. Hooks e servidores MCP seus em
`.claude/settings.json`/`.mcp.json` são mantidos; o Forja só acrescenta os dele.

## Projeto existente ou gerado antes da v5

```bash
cd meu-projeto
forja project:upgrade              # dry-run: peças de scaffold novas + conexão a refazer
forja project:upgrade --apply      # aplica (aditivo; só traz backend se o projeto já tem um)
forja project:wire --check
```

Para o workspace inteiro: `forja project:upgrade --all` (relatório por projeto) e depois
`--all --apply`.

Num repositório que nunca foi Forja, comece por `forja project:wire --ai claude,codex` e depois rode
o `project:upgrade --apply`.

## Problemas comuns

| Sintoma | Causa | Correção |
|---|---|---|
| `Workspace não encontrado` | workspace não criado | `forja workspace:init` (ou `forja setup`) |
| `Projeto ja existe no workspace` | nome em uso | escolha outro nome ou use `project:upgrade` dentro dele |
| `npm install do backend falhou` | sem rede/registry | `cd backend && npm install` depois |
| Briefing não aparece no Claude Code | `forja` fora do PATH | `npm i -g forjajs`; confira com `forja project:wire --check` |
| `project:wire --check` com FAIL | arquivo de conexão ausente/alterado | `forja project:wire` |

Veja também: [`processo-projeto.md`](processo-projeto.md) (criar × atualizar) e a
[ADR-0086](../memory/90-decisions/0086-projeto-conectado-e-jornada-como-gate.md).
