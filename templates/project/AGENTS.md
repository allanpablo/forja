# Forja — como operar este projeto

> Projeto criado pelo Forja. Este bloco vale para toda IA (Claude, Codex, Gemini, Copilot) e é
> mantido por `forja project:wire`, que pode reescrevê-lo. Suas anotações vão **fora** dos
> marcadores `forja:begin`/`forja:end`.

## Regras

- Responda e documente em **pt-BR**.
- **Spec antes de código** em feature não trivial; **ADR antes de mudança estrutural**
  (`memory/90-decisions/`, use `_template.md`).
- **Contexto sob demanda**: não leia `memory/` inteira. Busque primeiro e anexe só o que responde.
- Toda execução de `forja` fica auditada em `.context/forja-runs.jsonl`.

## Contexto: do mais barato ao mais caro

```bash
forja query:universal "<termo>"                    # busca FTS5 na memória do projeto
forja context:smart --mode task --task "<termo>"   # pack mínimo da tarefa → .context/smart-context.md
forja context:smart --mode domain                  # visão, design e regras do projeto
forja sync:universal                               # reindexa depois de editar memory/, docs/ ou specs/
```

Mais de ~2 arquivos de memória no contexto: use `context:smart`.

## Fluxo de uma feature

```bash
forja status                       # onde estamos: specs, corrida, handoffs
forja next                         # próxima ação recomendada, com o comando exato
forja spec:new <slug>              # specs/<slug>/spec.md
forja spec:set-status <slug> spec approved     # depois da revisão
forja spec:plan <slug>             # plan.md (exige spec aprovada)
forja spec:tasks <slug>            # tasks.md
forja spec:check <slug>            # gate de completude
forja orchestrate "<objetivo>" --slug <slug>   # corrida guardada por gates
forja orchestrate:advance          # roda o gate da etapa aberta
```

## Antes de editar e antes de entregar

```bash
forja code:check                   # índice de código confiável (codegraph, opcional)
forja code:impact <símbolo>        # quem chama e o que quebra
forja project:check                # documentação de fundação
forja tools:doctor                 # saúde do Forja e das ferramentas
forja project:wire --check         # IA, hooks e MCP conectados a este projeto
```

## Onde fica cada coisa

```
memory/00-global/        missão e padrões (leia primeiro)
memory/10-product/       visão, personas, growth
memory/20-architecture/  design técnico
memory/30-domains/       regras por domínio
memory/40-delivery/      roadmap, sprint, backlog
memory/50-orchestration/ topologia e handoffs
memory/70-summaries/     resumos compactos (prefira a arquivos brutos)
memory/90-decisions/     ADRs
specs/<slug>/            spec → plan → tasks
agents/, prompts/        papéis e prompts do projeto
```

## Papéis e handoffs

Orchestrator, product, sdd-architect, context-engineer, governance e marketing. No Claude Code
eles são sub-agents em `.claude/agents/`. Um handoff tem 7 campos: `from`, `to`, `intent`,
`context`, `acceptance`, `constraints`, `return`. Registre com:

```bash
forja hermes:handoff '<json com os 7 campos>'
forja agent:route list --open --mine           # handoffs em aberto deste projeto
forja agent:route done <id>                    # fecha um handoff entregue
```
