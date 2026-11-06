# Spec: v6-docs-drift

- **ID**: SPEC-055
- **Status**: done
- **Owner**: allanpablo
- **Criado em**: 2026-11-05
- **Sprint alvo**: v6.0 Wave 1
- **ADRs relacionadas**: a criar em memory/90-decisions/

## 1. Problema
A documentação (README.md, README.pt-BR.md, docs/) deriva do código e ninguém detecta a deriva até um usuário tropeçar nela. Estado validado em 2026-11-05 no repo (v5.2.0):

- `forja setup` não era mencionado em nenhum dos dois READMEs (0 ocorrências) — o onboarding não estava documentado.
- O registry tem 104 comandos; o README EN documentava **72** únicos e o pt-BR **42** — 32 comandos não apareciam em lugar nenhum (não havia referência completa).
- **12 comandos** não declaravam `usage` no registry, embora os READMEs documentassem suas flags (`agent:route --open/--mine`, `llm:run --profile`, `audit:query --failed` etc.) — a fonte única estava incompleta, e não o README errado.
- Drift de sintaxe de flags: registry declara `[-- --ai ...]` em `project:new`, `README.md:139` documenta `--ai` direto (as duas formas funcionam — o `--` é repassado e ignorado pelo gerador; o check passa a validar **existência** da flag, não o estilo do separador).
- `README.pt-BR.md` **não estava em `DOC_SURFACES`**: o scanner de "doc como dado" lia README.md/README.en.md e era cego para a superfície em português.
- Contagem de skills nos READMEs ("34") **estava correta**: `templates/project/skills/` tem 34 pastas + 1 README.md (35 entradas). A regra de contagem existe para impedir drift futuro, não para corrigir o atual.

Quem sente: novos usuários (onboarding quebrado), agentes de IA que leem o README como fonte de verdade, e o maintainer (correção manual tardia).

## 2. Proposta de valor
As regras de coerência doc × código vivem **no catálogo do doctor** (`lib/core/health.ts`), que já é gate no CI e na bateria `check:all` — deriva de documentação vira falha `critical` no PR, sem criar uma segunda máquina de ler markdown (princípio do repo: duas máquinas iguais divergem com o tempo; é exatamente o defeito que a SPEC-058 ataca). A referência completa de comandos (`docs/commands.md`) passa a ser **gerada** do registry por `forja docs:gen`, e o check `commands-ref` garante que ninguém a edita à mão.

## 3. User stories
- **Como** maintainer, **quero** que o doctor compare registry ↔ doc, **para que** nenhum comando novo seja publicado sem documentação.
- **Como** novo usuário, **quero** que o README documente o fluxo real de instalação e `forja setup`, **para que** eu consiga começar sem ler o código.
- **Como** agente de IA consumindo o README, **quero** números gerados do código (skills, comandos), **para que** o contexto injetado não contenha fato falso.

## 4. Critérios de aceite (Definition of Done)
- [x] AC-1: `forja docs:gen` regenera `docs/commands.md` a partir do registry (idempotente) e `forja tools:doctor` sai 0 no estado corrigido do repo.
- [x] AC-2: O doctor detecta (a) comando `tier: 'core'` ausente de **qualquer um dos dois** READMEs (`core-in-readme`, critical), (b) comando documentado que não existe no registry (`docs-commands`, já existia), (c) flag documentada que o comando não declara em `usage`/`examples` (`docs-flags`, critical), (d) contagem de skills divergente de `templates/project/skills/` (`docs-skills-count`, warn), (e) `docs/commands.md` fora de sincronia com o registry (`commands-ref`, critical).
- [x] AC-3: README.md e README.pt-BR.md documentam instalação + `forja setup` + fluxo mínimo (workspace:init → project:new → spec:new → …).
- [x] AC-4: Drifts reais corrigidos — `forja setup` nos dois READMEs, `forja next`/orientação no pt-BR, `usage` declarado nas 15 entradas que não tinham, `demo:workspace --path`, `project:new --skip-backend` e `llm:run --context/--output-schema/--validation` declarados, `--verbose` (flag que nunca existiu) removido do quick-reference, e referência completa dos 105 comandos em `docs/commands.md` ligada na seção Documentação dos dois READMEs.
- [x] AC-5: Os checks rodam no CI (job `test`, passo "Doctor do núcleo", todas as células da matriz) **e** na bateria `check:all` pelo grupo de saúde do núcleo — `critical` que falha bloqueia (exit 1).
- [x] AC-6: `docs-flags` não produz falso positivo nas classes medidas no repo real: citação de comando sem prefixo `forja`/`npm run` (prosa), flag de binário de terceiro na mesma linha (`llm:run` → `claude -p`), clítico do português ("consultá-lo" ≠ `-lo`) e comando inexistente de superfície planejada (`docs/2x/*`).

## 5. Escopo
**Dentro**:
- `lib/core/doc-graph.ts`: `README.pt-BR.md` em `DOC_SURFACES`; `scanFlags`, `scanSkillCounts`, `flagTokens` (tokenizer único de flags).
- `lib/docs-reference.ts` (novo): o lado código da comparação — `declaredFlags`, `skillsCount`, `renderCommandsDoc`.
- `scripts/gen-commands-doc.ts` (novo) + entrada `docs:gen` no registry + script npm.
- 4 checks novos em `lib/core/health.ts` (`docs-flags`, `core-in-readme`, `docs-skills-count`, `commands-ref`), todos `scope: 'repo'`.
- `docs/commands.md` gerado do registry (referência completa, 105 comandos).
- `usage`/`examples` declarados nos comandos que não tinham (fonte única completa).
- Correção factual dos READMEs (setup, orientação, link da referência) e do `docs/quick-reference.md`.
- Testes em `test/health.test.js` (18 novos).

**Fora**:
- Gate paralelo próprio (`docs:check`, `lib/docs-check.ts`, `lib/core/docs-gate.ts`): construído na primeira passada e **removido** — dobrado no doctor.
- Reescrever prosa/marketing dos READMEs.
- Estilo do separador `--` (as duas formas funcionam; o check valida existência de flag).
- CHANGELOG (registro histórico — e nem está em `DOC_SURFACES`).
- `docs/2x/*`, `specs/`, `memory/` (superfície planejada e registro histórico).
- Documentação de projetos gerados (têm a sua).

## 6. NFRs / restrições
- Orçamento do hook SessionStart intacto: os 4 checks são `scope: 'repo'`, logo não rodam no `scope: 'runtime'` (5s, nenhuma tolerância a travar a sessão).
- Determinismo: `renderCommandsDoc` segue a ordem do registry (domínios por primeira aparição), sem depender de ordem de `readdir`; `skillsCount` recebe o diretório pronto, sem impor separador de caminho (portável entre SOs).
- Compatibilidade: não muda a saída de nenhum comando existente; `docs:gen` é aditivo.

## 7. Riscos e mitigação
| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Check estrito bloqueia PR legítimo (comando experimental) | M | M | Comando que o registry não conhece é ignorado por `docs-flags`; flag citada em nome de outro comando da mesma linha absolve |
| Falsos positivos em parsing de markdown | M | M | Dono de flag é só invocação prefixada; as 4 classes medidas viraram teste (AC-6) |
| Duplicar a máquina de ler doc | M | A | Sem scanner próprio: leitura em `doc-graph.ts`, juízo em `health.ts`, tokenizer de flags um só (`flagTokens`) |
| Correção dos READMEs conflitar com PRs em andamento | B | B | Branch dedicada, merge rápido na Wave 1 |

## 8. Métricas de sucesso
30 dias após o release: zero issues de "comando não documentado"; `tools:doctor` verde em todos os PRs; README pt-BR com paridade de comandos documentados ≥ 95% do EN.

## Evidências e estado real
Medições de 2026-11-05, branch `feat/v6-wave1`:

- **Primeira passada no repo real: 35 divergências** — 3 de comando core fora do README (`setup` nos dois, `next` no pt-BR) e 32 de flag. A contagem de skills não disparou: os "34 skills" dos READMEs conferem com as 34 pastas reais (o 35 que circulava na análise contava o `README.md` do diretório).
- Investigação das 32 flags: **todas existem nos scripts** (`--mine/--open` em agent-router.ts, `--role` em agent.ts, `--title` em incident.ts, `--code` em code-context.ts, `--task` em build-smart-context.ts, `--profile/--scope/--id` em llm-fit.ts, `--publish` em release-check.ts, `--full` em gates.ts, `--failed/--cmd/--since` em audit-query.ts). O drift estava no **registry sem `usage`**, não na prosa → 15 entradas ganharam `usage`/`examples` (`agent:route`, `agent:register`, `agent:recommend`, `agent:score`, `agent:monitor`, `incident:record`, `code:context`, `context:smart` (estendido), `llm:recommend`, `llm:run`, `llm:eval`, `drift:check`, `release:check`, `check:all`, `audit:query`).
- **Drift real achado na segunda passada** (com a regra já dobrada no doctor): `demo:workspace --path` (`scripts/demo-workspace.ts:27`) e `project:new --skip-backend` (`scripts/agent-harness.ts:468`) existiam e não estavam no registry — corrigidos; `llm:run --context/--output-schema/--validation` existem em `scripts/llm-fit.ts:126` e não no `usage` — corrigido; `npm run project:new -- --verbose` em `docs/quick-reference.md:57` documentava flag que **não existe** em lugar nenhum — linha removida.
- **Falsos positivos eliminados** (todos viraram teste): (1) citação sem prefixo — "`llm:probe` executa `--version`" e "`llm:run --profile claude` → `claude -p …`" atribuíam flags de terceiros ao Forja → dono de flag passou a exigir `forja`/`npm run`; (2) flag de outro comando citado na linha — "(project:new --template)" dentro da célula de `project:templates` → o check absolve quando qualquer comando citado na linha declara a flag; (3) clítico português — "consultá-lo" casava como `-lo` → traço simples só casa com uma letra; (4) comando inexistente (`capabilities:list` de `docs/2x/*`) → ignorado, quem julga citação é `docs-commands`.
- **Estado final: `forja tools:doctor` com os 4 checks OK** (`docs-flags`, `core-in-readme`, `docs-skills-count` = 34 skills, `commands-ref` = 105 comandos).
- `docs/commands.md` gerado: **105 comandos** em 9 domínios, 34 skills, `|` escapado nas células, cabeçalho "Gerado por `forja docs:gen` … não edite à mão".
- Testes: `test/health.test.js` **72/72 verdes** (18 novos: 6 de `docs-flags`, 2 de `core-in-readme`, 2 de `docs-skills-count`, 3 de `commands-ref`, 1 de não-aplicação fora do repo do framework, 3 de `lib/docs-reference.ts`). Suíte completa: **615/615 verdes** (`npm test`, ~18s). O fs de fixture (`repoStub`) passou a honrar `readdirSync(p, { withFileTypes: true })`, como o `node:fs` real.
- `npm run types:check` (tsc --noEmit): **0 erros**.
- Wiring: `package.json` (`docs:gen`), registry (`docs:gen`, domínio governanca, `next: ['tools:doctor']`); CI inalterado — o passo "Doctor do núcleo" já existente no job `test` (matriz 22.x/24.x) é o que bloqueia.
- Limitação registrada: os checks leem a doc do **framework**; projetos gerados têm a sua própria documentação e não são cobertos aqui.
