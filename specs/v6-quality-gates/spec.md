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
- [ ] AC-4: Testes que dependem de comportamento unix (permissões, `bin:` shells) têm skip condicional explícito e justificado, não falha silenciosa — a levantar pela primeira rodada verde/vermelha das células macOS/Windows.
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
| Testes falharem só em Windows/macOS por paths/shell | A | M | Esperado: corrigir ou skip justificado (AC-4); é exatamente o valor do gate |
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
- Verificação pendente de propósito: as células `macos-latest`/`windows-latest` só existem no CI — a primeira rodada delas é o que levanta AC-4.
