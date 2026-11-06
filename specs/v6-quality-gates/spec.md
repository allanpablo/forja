# Spec: v6-quality-gates

- **ID**: SPEC-056
- **Status**: implementing
- **Owner**: allanpablo
- **Criado em**: 2026-11-05
- **Sprint alvo**: v6.0 Wave 1
- **ADRs relacionadas**: a criar em memory/90-decisions/

## 1. Problema
O forja vende gates de qualidade para os projetos que adota, mas não aplica todos a si mesmo. Estado validado em 2026-11-05 (`.github/workflows/ci.yml`, v5.2.0):

- CI roda **100% em ubuntu-latest** — o framework é usado em macOS e Windows (paths, `bin:` shells, cópia de skills), e regressões de plataforma só aparecem na máquina do usuário. O próprio `lib/paths.ts` documenta histórico de bug de raiz dupla (v1.6.1, v4.x, 18 scripts).
- **Sem lint do próprio repo e sem coverage** — `any` explícito aparece **359×** no código-fonte (medição da máquina desta spec, não grep de linha), `process.exit(1)` em 32 arquivos, e `cli-output.ts` é usado em apenas 8 de 54 scripts sem que nada sinalize a tendência.
- A suíte nunca foi rodada sob instrumentação de cobertura, e é justamente aí que um defeito real do contrato `--json` estava escondido (ver Evidências: stdout truncado em 64KB com exit 0).

Quem sente: mantenedor (regressões descobertas tarde), usuários Windows/macOS (bugs de plataforma), agentes de IA (saída inconsistente — e às vezes cortada — entre scripts).

## 2. Proposta de valor
CI que roda a suíte em matriz multi-OS e cobra, a cada push, dois ratchets versionados em `lib/core/quality-budget.json`: teto de `any` explícito (check `type-debt` no doctor) e piso de cobertura de linhas (`forja quality:coverage`, com a cobertura nativa do Node). Sem ESLint e sem c8 de propósito: adotar toolchain nova para medir o que uma regex e o `--experimental-test-coverage` já medem é importar uma segunda máquina — o defeito que a SPEC-058 ataca. Qualidade do próprio forja passa a ser medida a cada push, como ele exige dos projetos que adota.

## 3. User stories
- **Como** usuário Windows/macOS, **quero** que o CI rode nos três SOs, **para que** bugs de caminho/shell sejam pegos antes do release.
- **Como** maintainer, **quero** um teto de `any` e piso de coverage versionados, **para que** a dívida de tipos não cresça silenciosamente.
- **Como** contribuidor, **quero** feedback de lint no PR, **para que** eu corrija antes do review humano.

## 4. Critérios de aceite (Definition of Done)
- [x] AC-1: Job `test` roda em matriz multi-OS (`ubuntu-latest` × Node 22/24, `macos-latest` e `windows-latest` × Node 24) com `fail-fast: false`; falha em qualquer célula bloqueia.
- [x] AC-2: Check `type-debt` no catálogo do doctor conta `any` explícito (`: any`, `as any`, `<any>`, `any[]`) em `bin/lib/scripts/apps` (`.ts`/`.tsx`, fora `.d.ts`, com template literals descartados) e compara com `anyCeiling` versionado em `lib/core/quality-budget.json`: acima do teto → `critical` fail; abaixo → `warn` mandando descer o teto. Sem ESLint.
- [x] AC-3: `forja quality:coverage` roda **a mesma suíte** com `--experimental-test-coverage`, lê a linha `all files` da tabela e cobra `coverageLineFloor` (exit 2 abaixo do piso, exit 1 se a suíte falhar, `--json` no contrato do ADR-0082). O CI usa esse passo na célula ubuntu **no lugar** de `npm test` — custo adicional zero.
- [ ] AC-4: Testes que dependem de comportamento unix (permissões, `bin:` shells) têm skip condicional explícito e justificado, não falha silenciosa — a levantar pela primeira rodada verde/vermelha das células macOS/Windows. **Levantado (2026-11-06)**: macOS 665/665; Windows 23 → 14 → 11 → 10 em quatro rodadas, com 7 causas de produto/robustez fechadas no caminho e o *skip justificado* escrito para o caso SIGTERM. Restam 3 causas no inventário — uma delas (runtime de agentes) é lacuna de produto, não teste. Ver Evidências.
- [x] AC-5: Tempo total do CI não cresce por causa das réguas: a cobertura substitui o passo de teste no ubuntu (não soma), e as células novas rodam em paralelo.
- [x] AC-6: O stdout do contrato `--json` nunca sai truncado — `lib/cli-output.ts` escreve com `fs.writeSync` em laço antes do `process.exit()`, com teste de regressão de payload de 400KB (6× o buffer do pipe).

## 5. Escopo
**Dentro**:
- `.github/workflows/ci.yml`: matriz OS/Node do job `test`, passo de cobertura no ubuntu.
- `lib/core/quality-budget.json` (novo): `anyCeiling` + `coverageLineFloor` versionados.
- Check `type-debt` em `lib/core/health.ts` (`scope: 'repo'`, `critical`).
- `scripts/coverage-gate.ts` (novo) + entrada `quality:coverage` no registry + script npm `test:coverage`.
- Correção do truncamento de stdout em `lib/cli-output.ts` (+ fixture e teste).
- Testes em `test/health.test.js` (6 novos) e `test/cli-output.test.js` (1 novo).

**Fora**:
- ESLint/`typescript-eslint` e c8/istanbul: nada de toolchain nova para medir o que o `tsc` e o runner nativo já medem.
- Refatorar os 359 `any` existentes (Wave 2/3 — aqui só o teto; SPEC-058).
- Substituir `process.exit(1)`/consolidar `cli-output` nos 54 scripts (SPEC-058).
- Codecov/serviço externo — a tabela do Node já vai para o log do CI.
- `release-gate`, `project-smoke-ai`, `project-smoke-full`: continuam ubuntu (o custo deles é compilar better-sqlite3, e replicar isso em três SOs não prova mais).

## 6. NFRs / restrições
- Performance: matriz em paralelo com cache de npm por SO; `quality:coverage` custa o mesmo que `npm test` (é a mesma suíte).
- Custo: minutos de Actions dentro do free tier para repo público (4 células no job `test`, antes 2).
- Compatibilidade: não muda `release:check`, `tools:doctor`, `project:smoke` existentes; `type-debt` é `scope: 'repo'`, logo não toca o orçamento de 5s do hook SessionStart.
- Portabilidade: o contador de `any` emite caminho relativo com `/` (independente do SO), e a suíte já depende só do runner do Node — `npm test` funciona no Windows porque o Node expande o glob `test/*.test.js` sem shell (verificado localmente).

## 7. Riscos e mitigação
| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Testes falharem só em Windows/macOS por paths/shell | M | A | **Realizado na primeira rodada**: macOS limpo, 23 falhas no Windows — 3 causas de produto consertadas (paths POSIX, CRLF, limpeza de temp) e o resto em inventário não-bloqueante. Ver Evidências. |
| Ratchet de `any` bloquear PR legítimo | M | B | Teto = contagem atual (359); só impede crescimento, e subir o teto exige commit próprio justificado |
| Piso de cobertura oscilar entre SOs e dar falso vermelho | M | B | A régua roda só no ubuntu; piso 87 contra 87,45 medido dá folga, e branch/function não bloqueiam. **Realizado, mas por outro caminho**: a oscilação veio do próprio Node (blocos de processos-filho no agregado) — ver Evidências; piso re-ancorado em medição determinística. |
| CI mais lento desestimular contribuição | B | B | Células em paralelo + cache; AC-5 mede |

## 8. Métricas de sucesso
30 dias após: zero releases com regressão exclusiva de Windows/macOS; `any` ≤ 357 e caindo; cobertura de linhas ≥ 90% em todo PR, com o número se repetindo igual entre execuções; nenhum `--json` truncado.

## Evidências e estado real
Medições de 2026-11-05, branch `feat/v6-wave1`:

- **Diagnóstico**: leitura direta de `ci.yml` (5 jobs, todos `ubuntu-latest`) e contagem medida pela própria máquina nova — **359 `any` explícitos** (o grep ingênuo de linhas dava 301 e o de ocorrências 388; a diferença são template literals de geradores de boilerplate, `.d.ts` e `node_modules`, que o check descarta). Maiores arquivos listados no detail do check.
- **Cobertura baseline**: `node --test --experimental-test-coverage` → `all files | 86.40 | 74.18 | 77.85` na primeira medição (com 1 teste falho) e **87.45% de linhas** após o reparo abaixo → piso fixado em **87**.
- **A régua media ruído (achado da Wave 1, 2026-11-05)**: a suíte inteira, dois commits depois, dava `85,71 / 86,09 / 86,50 / 86,96 / 87,33` em execuções *idênticas*, e o gate ficava vermelho ou verde conforme a sorte. Causa raiz, isolada por pares de execução: com `--experimental-test-coverage` o runner expõe `NODE_V8_COVERAGE` e **todo CLI filho herda** — dezenas de processos escrevem blocos parciais dos mesmos arquivos no diretório de agregação, e o agregador do Node não faz união. Reprodução mínima: `packages/adapter-nest/src/index.ts` apareceu **100,00%** numa execução e **51,09%** na seguinte, com branches (70,30) e funções (63,16) idênticos, e o conjunto de arquivos da tabela mudando entre execuções. Um número que muda sem que nada mude não é uma régua: `test/isolate-workspace.mjs` passou a retirar `NODE_V8_COVERAGE` do ambiente (o processo de teste continua medindo a si mesmo; os filhos param de contaminar a agregação), a medição ficou **bit a bit reproduzível** (`91,80 | 79,8x | 87,99` em duas execuções seguidas, exit 0 nas duas) e o piso subiu de 87 para **90** — folga de 1,8pp para a variação entre SOs/Node que só a CI vai medir. `--test-concurrency=1` não muda nada: a instabilidade não é de agendamento.
- **Bug real achado pela instrumentação** (e não pela suíte normal): `contrato: spec:trace --json` falhava **só sob cobertura** com `SyntaxError: Unterminated string in JSON at position 64695`. Causa raiz reproduzida fora do teste — `process.stdout.write(json)` seguido de `process.exit()` trunca no buffer do pipe: payload de 400KB saía com **65536 bytes e exit 0**. Ou seja: qualquer comando `json:true` com resposta grande devolvia JSON cortado para o agente que o consumia, sem sinal de erro. Reparo: escrita síncrona no fd 1 em laço (`lib/cli-output.ts`), regressão coberta por `test/cli-output.test.js` + fixture `big`. Sob cobertura, a suíte voltou a 100%.
- **Estado final**: `forja quality:coverage` → `OK cobertura de linhas 87.45% (piso 87%) · branches 74.28% · funções 77.92%`, exit 0. `forja tools:doctor` → `OK type-debt 359 any explícitos, no teto (359)`. `npm run types:check` → 0 erros. `test/health.test.js` + `test/cli-output.test.js` → **82/82 verdes**.
- **AC-4 levantado pela primeira rodada das células (2026-11-06, PR #83)**: `macos-latest` passou **665/665** — a aposta de que o macOS era a plataforma de risco não se sustentou; quem trouxe defeito foi o `windows-latest`, com **23 falhas em 665**. Era exatamente o que a célula existia para caçar: nenhuma delas aparecia em ubuntu.
  - **Consertado na hora (causa no produto, não no teste)**:
    1. *Separador de caminho no pack* — `lib/code-context.ts` e `lib/context-builder.ts` emitiam `path.relative()` cru, então o mesmo domínio produzía `backend\src\...` no Windows e `backend/src/...` no resto. O pacote é texto colado no contexto de um agente: agora é POSIX nos dois (`relFrom()`; `**Path**` do `context:smart` normalizado na renderização). Derrubava `code-context.test.js:123`, `:232` e o contrato do `modo task`.
    2. *CRLF no frontmatter das skills* — `skillProblem()` exigia `\n` literal (`lib/project-wiring.ts:59`); no checkout Windows toda a validação de skills virava ruído ("frontmatter sem name/description" em 34/34), e o que isso puxava era o `project:new`/`project:wire` falhando — ou seja, a jornada inteira do usuário gerava projeto quebrado só por causa do separador de linha. Aceita `\r?\n`, com regressão que força o CRLF.
    3. *`rmSync` do diretório temp* — EPERM transitório no Windows com SQLite recém-fechado; a limpeza do `test/memory-index.test.js` ganhou retry.
  - **Rodada 2 (23 → 14), rodada 3 (14 → 11, com 1 skip justificado) e rodada 4 (11 → 10)**. As causas 1-3 caíram como previsto; a 4 não caiu na primeira tentativa e caiu na segunda; e a célula passou a medir 666 com 1 skipped. As restantes se agruparam em quatro causas — três delas defeito de produto, não de teste:
    4. *Forma do caminho do nó* — em Windows o mesmo arquivo era indexado com outra identidade: `memory/00-global/mission.md` em vez de `projects/demo/memory/00-global/mission.md`. Dois atalhos unix-cêntricos no sync, isolados por inferência e confirmados pela forma do sintoma: `path.relative()` entre **unidades diferentes** devolve caminho absoluto (e o teste de "está fora" era `startsWith('..')`, que deixa o absoluto passar), e o `os.tmpdir()` do runner chega como nome **8.3** (`RUNNER~1`) enquanto o walk devolve a forma longa. A chave do nó alimenta busca, dedupe e o classificador de tipo — não era detalhe de exibição. Primeira tentativa (só `realpathSync` dos dois lados) não bastou; o que fecha é seleção por **contenção** (`inside()` com `path.isAbsolute`), com a forma canônica como segundo passo. Em unix o caminho direto vence, então nada mudou localmente — e a rodada 4 é o que prova: o contrato do `modo task` e o `sync:universal` passaram, e o `code:context` já tinha passado na rodada 2. **Regra que ficou do jeito errado da tentativa**: `startsWith('..')` não é teste de contenção; o repo já fazia certo em `lib/workspace.ts:263`, `lib/session-memory.ts:43` e `scripts/build-smart-context.ts:52` (`!rel || startsWith('..') || isAbsolute`). O sync era o único lugar com a versão incompleta — o `inside()` novo segue a convenção que já existia, não uma regra inventada aqui.
    5. *CRLF na régua de derivação de doc* — `commands-ref` comparava `docs/commands.md` byte a byte com o renderizado; em checkout CRLF isso é "diverge" falso, e o `tools:doctor` do repo ficava vermelho sem nada estar velho. A comparação normaliza `\r\n`. **Regra geral que ficou**: o framework valida texto de *projeto do usuário*, que chega em CRLF seja lá o que a gente fizer no nosso repo — tolerar é o certo, `.gitattributes` não resolve o mundo.
    6. *Handle vazado no próprio teste* — o `antes` do teste de sync incremental abria uma conexão `readonly` e nunca fechava. Em unix é inocente; em Windows tranca o `.db` até o processo do runner acabar, e o `rmSync` do temp volta EPERM **para sempre** (a retry de 10×100ms da rodada 1 só provou que não era transitório). Fecha na leitura.
    7. *Sinal POSIX* — `test/server-shutdown.test.js` manda SIGTERM num filho: o sinal não existe em Windows e o probe usa `--import tsx`, opção de runtime que a célula não resolve. Este é o **skip explícito e justificado** que o AC-4 pedia, não um conserto; o contrato continua provado nas células unix. Está marcado como skipped na rodada 3, não como aprovado.
  - **Inventário aberto (a célula está `continue-on-error` só por isto)** — 3 causas, 10 casos na rodada 4:
    - *Runtime de agentes é unix por construção* (6 casos na rodada 4: `test/llm-resume-validation.test.js:142` com `spawn EFTYPE`; `test/agent-evals.test.js:85` e os AC-4/AC-5/AC-6 com `agent.args` nunca escrito; `test/llm-claude-adapter.test.js:99`; `test/llm-integration.test.js:111` — e os 2 casos do AC-1, que eram desta mesma família e ficaram verdes na rodada 2, o que confirma que a causa deles era o CRLF das skills e não o stub). Os testes modelam o CLI do agente como script com shebang, e é assim que ele falha — mas a causa é do produto, em três lugares lidos no código, não chutados do log:
      - `scripts/llm-fit.ts:76,84,91,104,108` sondam o binário com **`shell: false`** explícito. Em Windows o shim que `npm i -g` instala é `codex.cmd`/`claude.cmd`, e Node recusa spawnar `.cmd` sem `shell: true` (endurecimento da CVE-2024-27980). O `llm:probe` não tem como reportar features de um agente instalado nesse SO.
      - `lib/agent-evals.ts:254` executa o check `type: 'command'` com **`spawnSync('sh', ['-c', …])`** — sem `sh`, o check inteiro é inaplicável.
      - `lib/agent-evals.ts:177,183` spawnam o binário direto, mesma restrição do probe.
      Não é para pular: é portabilidade do `llm:run`/`llm:probe`/`eval:agents`, e merece spec própria (candidato a SPEC-059 na wave 2) com o caminho resolvido por `PATHEXT`/`.cmd` e o `sh -c` trocado por uma execução portável do comando do check.
    - *`git worktree`*: os 3 de `test/simulate-cli.test.js` (o `worktree list` antes/depois não fecha igual).
    - *`spec:trace` sem critérios no projeto gerado*: único resto da `jornada` nas quatro rodadas, que já ficou verde em `project:new`, `project:wire`, `context:smart` e `tools:doctor` — as causas 1/2/5 eram a jornada. O que a rodada 4 permite **eliminar**: não é a família do separador de caminho (`loadSpecs` lê o slug por `readdirSync`, e `listFiles` usa `git ls-files`, que fala POSIX por protocolo), não é CRLF na leitura do checklist (`AC_LINE` termina em `(.+)$`, que engole o `\r`), e não é a contagem de *tokens por critério* (AC-7 da SPEC-053) — `0/0` vem de `trace.totals`, antes de qualquer preço. O que fica de hipótese, sem prova: `specs/` vazio ou `readdirSync` lançando no `root` resolvido pela CLI em Windows (a função devolve `[]` nesse caso, e `0/0` é exatamente o que isso produz). Precisa de uma célula com diagnostico impresso, não de mais um patch adivinhado.
  - **Regra de saída**: tirar `continue-on-error` da matriz é o gate de que o inventário zerou. A linha existe no `ci.yml` com esta frase ao lado, para não virar mobília.
