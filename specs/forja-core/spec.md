# Spec: forja-core

- **ID**: SPEC-025
- **Status**: done
- **Owner**: framework-team
- **Criado em**: 2026-07-06
- **Sprint alvo**: core-2026-07
- **ADRs relacionadas**: ADR-0020 (core CLI única), ADR-0019 (workspace separado), ADR-0005 (handoff 7 campos), ADR-0017 (codegraph no GSD)

## 1. Problema
O Forja se apresenta como framework de orquestração, mas os comandos não passam por um núcleo comum. Hoje existem **três dispatchers paralelos**:

1. `scripts/agent-harness.mjs` — workspace, GSD, design, code intelligence (com gates próprios).
2. `scripts/dev.mjs` — context, memória, project:health (registry próprio, duplica `design:*`/`gsd:*`).
3. `package.json` — ~40 scripts npm apontando direto para 15+ scripts soltos (`spec-cli`, `sprint-manager`, `sync-universal-memory`, `context-ops`, …), inclusive com a chave `project:check` **duplicada** (a primeira definição é silenciosamente descartada pelo npm).

Consequências mensuráveis:
- Nenhuma trilha de auditoria unificada: não dá para responder "quais comandos rodaram nesta feature?" sem grep em N lugares.
- Gates aplicados de forma desigual: `gsd:check` valida codegraph, mas `spec:tasks` e `sprint:start` não validam nada do processo.
- O workspace (ADR-0019) é resolvido por alguns comandos e ignorado por outros — um comando de produto pode rodar sem workspace e falhar tarde ou agir no lugar errado.
- Projetos gerados não são registrados em lugar nenhum: `project:new` cria a pasta e termina; a ficha em `memory/30-projects/` depende de disciplina manual.

## 2. Proposta de valor
Uma **CLI única `forja`** (bin/forja.mjs) vira o core executivo do framework: todo comando passa por um registry declarativo, com gates transversais (workspace, processo) e **trilha de auditoria** append-only. Projetos passam pelo core no nascimento (registro automático de ficha no workspace). Os dispatchers existentes viram implementação interna — nada é reescrito, tudo é roteado.

## 3. User stories
- **Como** operador do Forja, **quero** rodar `forja <comando>` (ou `npm run <alias>`) e ter um único ponto de entrada com help agrupado por domínio, **para que** eu não precise decorar qual script implementa o quê.
- **Como** governance, **quero** que toda execução de comando seja registrada em `.context/forja-runs.jsonl` (comando, args, exit code, duração), **para que** o review de uma feature tenha trilha de auditoria do processo.
- **Como** operador, **quero** que comandos de produto falhem cedo e com instrução clara quando o workspace não existe, **para que** nada rode no lugar errado (ADR-0019).
- **Como** orchestrator, **quero** que `project:new` registre automaticamente a ficha do projeto em `memory/30-projects/` do workspace, **para que** todo projeto nasça rastreado pelo core.

## 4. Critérios de aceite (Definition of Done)
- [ ] AC-1: `node bin/forja.mjs` (sem args) lista todos os comandos agrupados por domínio; `forja <cmd> --help` ou comando desconhecido orienta com exit ≠ 0 no caso de erro.
- [ ] AC-2: existe `lib/core/registry.mjs` declarativo: cada comando tem domínio, descrição, alvo (script/binário) e gates; teste automatizado garante que todo script referenciado existe.
- [ ] AC-3: toda execução via core gera uma linha JSON em `<workspace>/.context/forja-runs.jsonl` (fallback: `.context/` do repo quando não há workspace) com ts, cmd, args, exitCode e durationMs.
- [ ] AC-4: comandos marcados com gate `workspace` falham cedo com mensagem "rode forja workspace:init" quando o workspace não existe.
- [ ] AC-5: os scripts npm do `package.json` roteiam pelo core (`node bin/forja.mjs <cmd>`); a chave duplicada `project:check` é eliminada; `forja` entra em `"bin"` do pacote.
- [ ] AC-6: `project:new` bem-sucedido grava/atualiza ficha do projeto em `<workspace>/memory/30-projects/<nome>.md`.
- [ ] AC-7: `npm test` cobre registry, help, comando desconhecido e gate de workspace; suíte existente continua verde.

## 5. Escopo
**Dentro**:
- `bin/forja.mjs` (dispatcher), `lib/core/registry.mjs` (registry + gates)
- `package.json`: bin `forja`, rewire dos scripts, remoção da duplicata
- `scripts/agent-harness.mjs`: ficha automática no `project:new`
- `test/forja-core.test.js`
- README/DOC-MAP: documentar o core como ponto de entrada

**Fora** (explícito, evita scope creep):
- Reescrever `dev.mjs`, `spec-cli.mjs`, `sprint-manager.js` etc. — continuam como implementação; `dev.mjs` fica como alias legado documentado
- Embutir a CLI `forja` nos projetos gerados (`lib/generators/`) — fase 2, spec própria
- Dashboard (`dashboard:*`) — front opcional, fora do processo
- Gravar auditoria no SQLite (JSONL primeiro; promoção a tabela é evolução futura)

## 6. NFRs / restrições
- Zero dependências novas (Node stdlib apenas).
- Overhead do roteamento imperceptível (< 100ms além do script alvo).
- Degradação graciosa: auditoria nunca bloqueia o comando (falha de escrita = warning).
- Compatibilidade: todos os aliases npm atuais continuam funcionando com a mesma semântica.
- pt-BR em toda saída de CLI.

## 7. Riscos e mitigação
| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Duplo spawn (npm → forja → script) mascarar exit codes | B | A | Propagar `status` do filho sempre; testes de exit code |
| Registry divergir dos scripts reais | M | M | Teste de integridade (todo alvo existe no disco) |
| Gate de workspace bloquear fluxo legítimo do framework | M | M | Gate só em comandos de domínio de produto; framework roda sem workspace |
| JSONL de auditoria crescer sem limite | B | B | Arquivo em `.context/` (gitignored); rotação futura via `memory:compress` |

## 8. Métricas de sucesso
30 dias após o release: (a) 100% dos comandos de processo listados no help do core; (b) `forja-runs.jsonl` presente e usado em pelo menos um review de governance; (c) zero projetos criados sem ficha em `30-projects/`.
