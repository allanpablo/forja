# AGENTS — Topologia do framework

Contrato de execução e evidência: [instruções comuns](docs/agent-operating-contract.md). Consulte-o antes dos procedimentos abaixo; em divergências operacionais, use esse contrato atualizado.


## Modo operacional

Este projeto e **CLI-first**. Use comandos para operar sprints, SDD, GSD, contexto e handoffs. Dashboard/web e recursos visuais sao opcionais e nao devem bloquear operacao, governanca ou entrega quando a tarefa nao tiver impacto visual.

Todo comando de processo passa pelo **core** `bin/forja.ts` (ADR-0020): registry declarativo em `lib/core/registry.ts`, gates transversais (workspace) e auditoria de cada execucao em `<workspace>/.context/forja-runs.jsonl` — e essa trilha que Governance usa no review. Os scripts npm abaixo sao aliases finos do core; `node bin/forja.ts` lista tudo por dominio.

Os **produtos gerados** vivem no **workspace Forja** (`~/forja-workspace` por padrao, configuravel via `FORJA_WORKSPACE` ou `~/.forjarc.json`). O repositorio atual e apenas o motor/framework. Veja ADR-0019. Toda IA que abre este repo ou um projeto gerado deve entender essa estrutura pelas instrucoes nativas (`CLAUDE.md`, `.github/copilot-instructions.md`, `.gemini-instructions.md`, `.openai-instructions.md`).

Comandos de rotina:

```bash
npm run workspace:init
npm run project:new <nome> -- --ai claude,copilot
npm run project:list
npm run project:check <nome>

npm run sprint:status
npm run gsd:plan -- <slug> "<objetivo>"
npm run gsd:handoff -- spec <slug>
npm run gsd:handoff -- plan <slug>
npm run gsd:handoff -- implement <slug>
npm run gsd:handoff -- review <slug>
npm run gsd:check -- <slug>
npm run project:check
```

6 papéis, cada um materializado em três lugares:

- **Sub-agent Claude Code** em `.claude/agents/<name>.md` (invocável via Task tool)
- **Prompt portátil** em `prompts/<name>-agent.md` (para Copilot/Gemini/Codex)
- **Descrição neste arquivo** (referência canônica de responsabilidades)

Handoffs entre eles passam pela tabela `handoffs` em `~/forja-workspace/memory/sqlite/universal.db` (configurável via `FORJA_WORKSPACE`/`~/.forjarc.json`), registrados via Hermes (`npm run hermes:handoff` ou `npm run gsd:handoff`) sobre `scripts/agent-router.ts` (ADR-0008). Campos obrigatórios em todo handoff: `from, to, intent, context, acceptance, constraints, return` (ADR-0005).

---

## 1. Orchestrator (Master)
**Quando**: demanda atravessa múltiplos papéis ou usuário pede para "orquestrar/coordenar".
**Faz**: decompõe em handoffs, escolhe sub-agents, registra via agent-router, consolida memória ao fim de sprint.
**Não faz**: implementação direta.

## 2. Context Engineer
**Quando**: antes de tarefa pesada (refator amplo, análise multi-arquivo) ou em perguntas sobre tokens/cache.
**Faz**: monta `.context/pack.md` no modo certo (`global`|`domain`|`task` — ADR-0003), mede tokens, comprime memória.
**Não faz**: decisões de produto ou arquitetura.

## 3. SDD Architect
**Quando**: spec aprovada precisando virar plan, ou decisão estrutural pedindo ADR.
**Faz**: escreve `specs/<feat>/plan.md`, abre ADRs em `memory/90-decisions/`, devolve specs mal-escritas.
**Não faz**: código de implementação.

## 4. Product
**Quando**: demanda nova sem spec, ambiguidade sobre "o quê", priorização.
**Faz**: roda `npm run spec:new`, preenche `spec.md`, prioriza `backlog.md` via RICE, define métrica 30d.
**Não faz**: decisões de "como".

## 5. Marketing (Growth)
**Quando**: positioning antes do release, copy/landing, instrumentação AARRR, análise pós-launch.
**Faz**: copy referenciando dor da spec, lista de eventos a instrumentar, relatório de funil.
**Não faz**: invenção de números sem instrumentação.

## 6. Governance
**Quando**: antes de aprovar merge/release.
**Faz**: roda `project:check`, audita handoffs por completude, valida 12-Factor/LGPD/segurança, bloqueia se algo falta.
**Não faz**: aprovar "ficou bom" sem referência verificável.

## 7. Release Auditor
**Quando**: antes de publicar no npm — o especialista de release da governança.
**Faz**: roda `tools:doctor` e depois `release:check --publish`, interpreta os dois pareceres e autoriza (ou barra) a publicação. Valida o núcleo pela fonte canônica e pega quebras que só apareceriam na máquina de quem instala (SPEC-022, ADR-0023, ADR-0024).
**Não faz**: publicar — a publicação exige autorização do usuário, que pode autorizar sua execução pelo agente.

---

## Fluxo SDD padrão

```
usuário → Product (spec.md)
         ↓ approved
         SDD Architect (plan.md + ADRs)
         ↓ approved
         SDD Architect (tasks.md)
         ↓ handoff "implement"
         Worker (código)
         ↓ handoff "review"
         Governance (project:check)
         ↓ aprovado
         merge → Orchestrator consolida memória
```

Context Engineer pode ser invocado em qualquer ponto. Marketing entra antes (positioning) e depois (métricas).

## GSD + Harness

GSD e o harness de execucao do fluxo SDD. Ele roda sempre em steps, valida gates e padroniza handoffs Hermes.

Ordem operacional:

```
briefing → estrutura → sprints → contexto → impacto (codegraph) → spec → design → plan → desenvolvimento → validação → governança
```

Comandos principais:

```bash
npm run dev -- gsd:plan <slug> "<objetivo>"
npm run dev -- gsd:handoff spec <slug>
npm run dev -- gsd:handoff plan <slug>
npm run dev -- gsd:handoff implement <slug>
npm run dev -- gsd:handoff review <slug>
npm run dev -- gsd:check <slug> <brief.md>
```

Antes de planejar/editar, mapeie o impacto com codegraph (ADR-0017) e cheque ferramentas de processo (ADR-0018):

```bash
npm run code:check                # indice codegraph confiavel (worktree + freshness)
npm run code:impact -- <simbolo>  # chamadores + blast radius
npm run tools:doctor              # raio-x: codegraph, gitleaks, ast-grep, lefthook, markdownlint
```

Use `design:select` e `design:check` antes de qualquer implementacao com impacto visual:

```bash
npm run dev -- design:select agent-console tecnico
npm run dev -- design:check design-md/examples/agent-console-brief.md
```

## Onde olhar
- `.claude/agents/` — sub-agents Claude Code (system prompts)
- `prompts/` — prompts portáveis para outras IAs
- `memory/50-orchestration/` — protocolos detalhados (não-executáveis)
- `memory/90-decisions/0005-handoff-7-campos.md` e `0008-sub-agents-claude-handoff-sqlite.md`
- `scripts/agent-harness.ts` — Hermes/GSD/design harness
- `scripts/agent-router.ts` — CLI base de handoff
- `specs/` — pipeline SDD
