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

## Tools Doctor (ferramentas de processo)

`tools:doctor` (ADR-0018) e o raio-x das ferramentas opcionais que potencializam o processo. Detecta sem impor:

```bash
npm run tools:doctor
```

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
