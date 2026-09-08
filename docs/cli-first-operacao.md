# Operacao CLI-First

Este framework deve ser operado primeiro por linha de comando. O dashboard web fica como artefato legado/opcional de consulta; nao e gate de entrega, sprint, handoff ou governanca.

## Descoberta pela propria CLI (SPEC-043, SPEC-044)

```bash
forja status               # onde estou: workspace, sprint, corrida, specs, runs, handoffs
forja next                 # o que faco agora: 1 linha com a proxima acao + o comando
forja help                 # so o nucleo agrupado por dominio
forja help --all           # todos os comandos + capabilities
forja help spec:new        # uso, argumentos, exemplos e proximos passos de um comando
forja <comando> --help     # o mesmo detalhe, inline
forja setup                # rotina de primeiro uso: workspace:init + sync:universal (pede confirmacao)
forja setup --yes          # sem confirmacao (uso nao-interativo)
```

`forja status` e `forja next` aceitam `--json`. Digitou errado? O `forja` sugere o comando mais
proximo (`forja plan` aponta `spec:plan`). Faltou um argumento obrigatorio? O comando falha antes
de rodar, imprimindo o `Uso:` — sem stack trace.

## Ciclo Diario

```bash
npm run sprint:status
npm run dev -- context:build task <slug> "<palavras-chave>"
npm run gsd:plan -- <slug> "<objetivo>"
npm run gsd:handoff -- spec <slug>
npm run spec:check -- <slug>
npm run gsd:handoff -- plan <slug>
npm run gsd:handoff -- implement <slug>
npm run gsd:check -- <slug>
npm test
npm run project:check
```

## Sprints

No repositorio raiz:

```bash
npm run sprint:start
npm run sprint:status
npm run sprint:complete
```

Em um projeto do workspace (`~/forja-workspace/projects/<NomeDoProjeto>`):

```bash
npm run sprint:start -- NomeDoProjeto
npm run sprint:status -- NomeDoProjeto
npm run sprint:complete -- NomeDoProjeto
```

O backlog pode estar em checklist com secao `## Alta Prioridade` ou em tabela RICE. Quando houver tabela RICE, entram na sprint os itens `P0` e `P1` mais bem posicionados.

## SDD + GSD

Use SDD para decidir o que sera entregue e GSD para controlar a execucao.

1. Product cria ou completa `specs/<slug>/spec.md`.
2. SDD Architect cria `plan.md`, `tasks.md` e ADRs quando houver decisao estrutural.
3. Orchestrator registra cada passagem com `gsd:handoff`.
4. Worker implementa somente os arquivos do ownership definido.
5. Governance roda `gsd:check`, `spec:check`, testes e `project:check`.

## Handoffs Hermes

Todo handoff precisa dos 7 campos da ADR-0005:

```bash
npm run hermes:handoff -- '{"from":"orchestrator","to":"product","intent":"spec","context":"specs/<slug>","acceptance":"spec aprovada com AC testaveis","constraints":"pt-BR; sem codigo nesta fase","return":"orchestrator"}'
```

Para o fluxo padrao, prefira os atalhos:

```bash
npm run gsd:handoff -- spec <slug>
npm run gsd:handoff -- plan <slug>
npm run gsd:handoff -- implement <slug>
npm run gsd:handoff -- review <slug>
```

## Quando Usar Design/Web

Use `design:select` e `design:check` apenas se a tarefa tiver impacto visual real. Em tarefas CLI-only, `gsd:check` nao exige brief visual.

```bash
npm run design:select -- agent-console tecnico
npm run design:check -- design-md/examples/agent-console-brief.md
```
