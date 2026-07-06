# ADR-0020: CLI única `forja` como core executivo dos comandos

- **Status**: accepted
- **Data**: 2026-07-06
- **Autor(es)**: apk
- **Tags**: cli, orchestration, governance, workspace

## Contexto
Os comandos do Forja cresceram em três camadas paralelas sem núcleo comum: `scripts/agent-harness.mjs` (workspace/GSD/code), `scripts/dev.mjs` (context/memória, duplicando parte do harness) e ~40 scripts npm apontando direto para scripts soltos — com a chave `project:check` duplicada no `package.json`. Não havia trilha de auditoria unificada, gates eram aplicados de forma desigual e a resolução do workspace (ADR-0019) dependia de cada script lembrar de usá-la. Projetos criados por `project:new` não eram registrados em ficha alguma.

O posicionamento do produto ("processo que governa" como pilar) exige que o processo passe, de fato, por um ponto governável.

## Decisão
Criar o **core executivo** do Forja:

- `bin/forja.mjs` — dispatcher único; todo comando de processo roda como `forja <comando>`.
- `lib/core/registry.mjs` — registry declarativo: domínio, descrição, alvo (script ou binário) e gates por comando.
- **Gates transversais** aplicados pelo core antes do alvo: `workspace` (comandos de produto falham cedo sem workspace, com instrução de correção).
- **Auditoria append-only**: cada execução gera uma linha JSON em `<workspace>/.context/forja-runs.jsonl` (fallback `.context/` do repo), com ts, cmd, args, exitCode, durationMs. Falha de auditoria nunca bloqueia o comando.
- Scripts npm viram aliases finos para `node bin/forja.mjs <cmd>`; `forja` é publicado em `"bin"`.
- `project:new` passa a registrar ficha automática em `<workspace>/memory/30-projects/<nome>.md`.
- `agent-harness.mjs`, `spec-cli.mjs`, `sprint-manager.js` etc. permanecem como implementação roteada; `dev.mjs` vira alias legado.

## Alternativas consideradas
- **Promover `agent-harness.mjs` a core**: rejeitada porque mistura implementação de gates GSD com roteamento; o registry declarativo separa "o que existe" de "como executa".
- **Promover `dev.mjs` a core**: rejeitada porque seu registry embute handlers (não é declarativo) e já nasceu duplicando o harness.
- **Registrar auditoria direto no SQLite universal**: adiada; JSONL em `.context/` é append-only, sem dependência e legível por humanos. Promoção a tabela pode vir depois via `sync:universal`.
- **Manter scripts npm diretos**: rejeitada porque perpetua a ausência de gates/auditoria — o problema que motivou a decisão.

## Consequências
**Positivas**:
- Um único ponto de entrada auditável; help agrupado por domínio.
- Gates de processo aplicados uniformemente (workspace hoje; extensível para spec/governance).
- Todo projeto nasce registrado no workspace.
- npm scripts ficam finos e sem duplicatas.

**Negativas / Trade-offs**:
- Um spawn adicional por comando (npm → forja → script), ~dezenas de ms.
- Registry precisa acompanhar novos scripts (mitigado por teste de integridade).
- `dev.mjs` convive como caminho legado até ser absorvido.

## Rastreamento
- Implementação: `bin/forja.mjs`, `lib/core/registry.mjs`, `package.json`, `scripts/agent-harness.mjs`, `test/forja-core.test.js`
- Issues/PRs: SPEC-025 (`specs/forja-core/spec.md`)
- ADRs relacionadas: ADR-0005, ADR-0017, ADR-0019
