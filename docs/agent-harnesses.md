# Harnesses: Hermes e GSD

Este projeto passa a tratar harness como camada fina em cima dos scripts existentes, nao como framework externo obrigatorio.

## Hermes Agent

Hermes e o harness de roteamento. Ele valida o contrato de 7 campos do ADR-0005 e registra handoffs no SQLite usando `scripts/agent-router.mjs`.

Uso:

```bash
npm run hermes:handoff -- '{"from":"orchestrator","to":"product","intent":"spec","context":"specs/foo/spec.md","acceptance":"spec com AC testaveis","constraints":"pt-BR; sem codigo","return":"orchestrator"}'
```

Quando usar:

- Uma tarefa atravessa mais de um papel.
- Um agente precisa devolver trabalho para outro com aceite objetivo.
- Governance precisa auditar o caminho da decisao.

## GSD Harness

GSD e o harness de execucao. Ele gera um runbook curto para sair de uma demanda aberta ate gates verificaveis: contexto, spec, design, plano, implementacao e review.

Uso:

```bash
npm run gsd:plan -- pipeline-sdd-e-orquestracao "fortalecer design-md e harness"
npm run gsd:handoff -- spec pipeline-sdd-e-orquestracao
npm run gsd:check -- pipeline-sdd-e-orquestracao design-md/examples/agent-console-brief.md
```

Saida:

- `.context/gsd-<slug>.md`
- checklist de gates
- comandos sugeridos para contexto, design check, spec check e handoff

Tambem esta integrado ao CLI unificado:

```bash
npm run dev -- gsd:plan pipeline-sdd-e-orquestracao "fortalecer design-md e harness"
npm run dev -- gsd:handoff plan pipeline-sdd-e-orquestracao
npm run dev -- gsd:check pipeline-sdd-e-orquestracao design-md/examples/agent-console-brief.md
```

Fases aceitas por `gsd:handoff`:

| Fase | Origem | Destino | Intent |
|---|---|---|---|
| `spec` | orchestrator | product | spec |
| `plan` | product | sdd-architect | plan |
| `implement` | sdd-architect | worker | implement |
| `review` | worker | governance | review |

## Design Harness

O design harness valida se um brief visual tem os campos minimos antes de virar handoff de implementacao.

Uso:

```bash
npm run design:check -- design-md/BRIEF-TEMPLATE.md
npm run design:select -- agent-console tecnico
```

Regra operacional: nenhuma interface relevante deve seguir para implementacao sem referencia primaria e criterios de aceite visual.

## Codegraph Harness (code intelligence)

O codegraph e o harness de inteligencia de codigo (ADR-0017). Ele expoe o grafo de simbolos/edges do projeto e vira gate verificavel do GSD: o Architect/Worker consulta o blast radius antes de editar; a Governanca valida que o indice e confiavel.

```bash
npm run code:check               # indice pertence a este worktree e esta em dia?
npm run code:impact -- <simbolo> # chamadores + blast radius de um simbolo
npm run code:index               # (re)indexa; use codegraph init -i para indice local de worktree
npm run code:sync                # atualiza o indice apos mudancas
```

Regras operacionais:

- **Antes de planejar/editar**: rode `code:impact` para fundamentar "modulos afetados" no plan, em vez de chutar.
- **Degradacao graciosa**: se o binario `codegraph` nao existe, os comandos avisam e seguem — nada trava.
- **Gate de Governanca**: `code:check` reprova (bloqueante) se o indice pertence a outro worktree; e nao-bloqueante se o codegraph simplesmente nao esta instalado.
- `gsd:check` ja inclui o gate codegraph automaticamente.

## Doctor (nucleo + ferramentas de processo)

```bash
npm run tools:doctor
```

Duas secoes, dois contratos:

### Nucleo — o que impede o framework de trabalhar (ADR-0023)

Falha critica aqui **reprova com exit 1**. Cada falha vem com o comando que a corrige.

| Check | O que verifica | Severidade |
|---|---|---|
| `native-abi` | better-sqlite3 carrega no Node em uso | critica |
| `memory-db` | `universal.db` existe e abre | critica |
| `memory-fresh` | indice em dia com `memory/` | aviso |
| `workspace` | workspace resolvido (e por qual origem) | aviso |
| `node-engines` | Node dentro do `engines` declarado | aviso |
| `runtime-deps` | script publicado nao importa devDependency (ADR-0021) | critica |
| `mcp-json` | `.mcp.json` sem path absoluto versionado (ADR-0021) | critica |

O caso que motivou o gate: com o `better-sqlite3` compilado para outra major do Node, a memoria
universal morre inteira — e o doctor antigo reportava "2/5 ferramentas disponiveis", exit 0. A
correcao e `npm rebuild better-sqlite3`; `npm install` **nao** recompila binario nativo.

O doctor diagnostica e prescreve; nao conserta. Nao existe `--fix`.

Os checks `runtime-deps` e `mcp-json` so rodam dentro do repo do framework — numa instalacao
`npm i -g forjajs` nao ha devDependencies nem `.mcp.json`, e eles dariam falso positivo.

### Ferramentas de processo — opcionais (ADR-0018)

Detecta sem impor. Ausencia **nunca** trava o fluxo: apenas desativa o gate correspondente.

| Ferramenta | Papel | Gate |
|---|---|---|
| codegraph | code intelligence | `code:check` / `code:impact` |
| gitleaks | varredura de segredos | `gitleaks detect` no review |
| ast-grep | busca/codemod por AST | refactor do Worker |
| lefthook | pre-commit automatico | `.lefthook.yml` |
| markdownlint | lint de docs | `markdownlint-cli2 "docs/**/*.md"` |

Ferramentas ausentes apenas desativam seus gates. Governanca decide o que exigir conforme disponibilidade.

## Workflow integrado

O fluxo sempre deve operar em steps, nesta ordem:

```text
briefing → estrutura → sprints → contexto → impacto (codegraph) → spec → design → plan → desenvolvimento → validação → governança
```

```bash
npm run dev -- gsd:plan <slug> "<objetivo>"
npm run dev -- design:select agent-console tecnico
# preencher um brief a partir de design-md/BRIEF-TEMPLATE.md
npm run dev -- design:check <brief.md>
npm run dev -- gsd:handoff spec <slug>
npm run dev -- gsd:check <slug> <brief.md>
```

Governance deve usar `gsd:check` como gate leve antes de aceitar review quando a feature passou por GSD.
