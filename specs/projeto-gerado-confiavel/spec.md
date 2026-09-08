# Spec: projeto-gerado-confiavel — smoke por `--ai` no CI + coerência multi-IA

- **ID**: SPEC-047
- **Status**: implementing
- **Owner**: apk
- **Criado em**: 2026-09-08
- **Sprint alvo**: <a definir>
- **ADRs relacionadas**: nenhuma — extensão de `project:smoke` (SPEC-015) e wiring de CI, sem
  decisão estrutural. A geração multi-IA já parte de fonte única (`.gemini-instructions.md`).
- **Origem**: `docs/roadmap-v4.1.md`, Onda 3 (W7 + W8).

## 1. Problema

**W7 — o smoke não varia por `--ai`.** `forja project:smoke` gera via
`bin/create-memory-nest-kit` direto (só memória) e roda no CI dentro do job `release-gate`, **sem
matriz e sem exercitar o `--ai`**. O caminho que um usuário de verdade usa — `init-project.ts`
com `--ai claude,copilot,…`, que escreve as instruções nativas por IA — nunca é validado
automaticamente. Uma quebra nesse caminho só aparece quando alguém gera um projeto à mão.

**W8 — não há check de que as instruções por IA concordam.** `init-project.ts step02` já deriva
cada `.ia-instructions/<ai>.md` de **uma** fonte (`.gemini-instructions.md`), trocando só o
cabeçalho. Mas nada verifica isso: uma edição que diverge o corpo de `claude.md` do de
`copilot.md`, ou um `models.json` com `fallback_chain` fora de sincronia com o `--ai` pedido,
passa batido. O check `agent-topology` que garante coerência existe **só para este repo**, não
para o projeto gerado.

**Como medimos hoje**: `ci.yml` roda `project:smoke` uma vez, tier barato, sem `--ai`. Nenhum
check de coerência multi-IA no gerado.

## 2. Proposta de valor

`forja project:smoke --ai <lista>` gera pelo caminho real (`init-project.ts --skip-backend`) e
prova que o projeto sai coerente para aquela combinação de IAs — incluindo que as instruções
nativas derivam da mesma fonte. O CI roda isso numa matriz pequena de combinações a cada PR, no
tier barato (sem `npm install`). Uma quebra do gerador multi-IA falha o CI, não a máquina de
quem clona.

## 3. User stories

- **Como** mantenedor do gerador, **quero** que um PR que quebra `init-project.ts --ai` falhe o
  CI, **para que** eu não descubra pelo issue de um usuário.
- **Como** usuário que gera com `--ai claude,copilot`, **quero** garantia de que as duas
  instruções têm o mesmo conteúdo, **para que** trocar de IA no meio do projeto não mude as regras.
- **Como** QA, **quero** `forja project:smoke --ai <lista>` rodável localmente, **para que** eu
  reproduza o cenário do CI sem esperar o pipeline.

## 4. Critérios de aceite (Definition of Done)

- [ ] **AC-1**: `runProjectSmoke({ ai?: string[] })` — quando `ai` é passado, gera via
      `bin/init-project.ts <dir> --ai <lista> --skip-backend --force` em vez de
      `create-memory-nest-kit` direto. Sem `ai`, comportamento atual inalterado.
- [ ] **AC-2**: `forja project:smoke --ai claude,copilot` (CLI) — parseia a lista, chama
      `runProjectSmoke({ ai })`, mesma saída/veredito/exit code do smoke atual.
- [ ] **AC-3**: novo check `aiInstructionsCoherent` (só quando `ai` foi pedido): para cada `<ai>`
      da lista, `.ia-instructions/<ai>.md` existe; o corpo (sem as 2 linhas de cabeçalho que
      `step02` reescreve) é **idêntico** entre todos os `<ai>.md` da lista;
      `.ia-instructions/models.json` tem `fallback_chain` === a lista pedida e uma entrada em
      `engines` por IA. Falha crítica se divergir.
- [ ] **AC-4**: os checks existentes (`noPlaceholders`, `jsonValid`, `structure`,
      `gateInherited`) rodam sobre a saída do `init-project.ts` também (não só a do
      `create-memory-nest-kit`).
- [ ] **AC-5**: `.github/workflows/ci.yml` — job/step novo em **matriz** sobre 3 combinações
      (`claude` · `copilot` · `claude,copilot,gemini,codex`) rodando
      `node bin/forja.ts project:smoke --ai <combo>` no tier barato. Roda em PR e push.
- [ ] **AC-6**: `test/project-smoke.test.js` (ou novo) — `runProjectSmoke({ ai: ['claude','copilot'] })`
      num tmp: gera, `aiInstructionsCoherent` verde; um teste que injeta divergência (edita um
      `<ai>.md`) e vê o check reprovar.
- [ ] **AC-7**: `forja project:smoke --ai claude,copilot,gemini,codex` local passa (tier barato).
- [ ] **AC-8**: `tsc --noEmit`, `node --test test/*.test.js`, `forja spec:check`,
      `forja project:check` verdes; `ci.yml` continua válido (lint de workflow / `act` se disponível,
      senão revisão).

## 5. Escopo

**Dentro**:
- `lib/core/project-smoke.ts` — opção `ai` em `withGeneratedProject`/`runProjectSmoke`; branch de
  geração via `init-project.ts`; check `aiInstructionsCoherent`.
- `scripts/project-smoke.ts` — flag `--ai <lista>`.
- `.github/workflows/ci.yml` — matriz de combinações no tier barato.
- `lib/core/registry.ts` — `--ai` no `usage`/`examples` de `project:smoke`.
- Testes; nota em `docs/` (quick-reference / dev-workflow) sobre `project:smoke --ai`.

**Fora** (evita scope creep):
- Rodar `npm install && npm test` do projeto gerado no CI a cada PR (é o tier `--full`, minutos ×
  matriz) — fica opt-in / pré-release, no máximo 1 combinação.
- Reescrever `init-project.ts` ou o modelo de geração multi-IA (já parte de fonte única).
- `project:upgrade`, boilerplates, `exemplo-v3`.
- Portar o `agent-topology` inteiro para o gerado — o check aqui é focado nas instruções nativas.

## 6. NFRs / restrições

- **Performance**: o step de matriz roda `init-project.ts --skip-backend` (memória + instruções,
  sem rede) — segundos por célula. 3 células.
- **Compatibilidade**: `project:smoke` sem `--ai` inalterado (o `release-gate` do CI segue igual).
- **Segurança**: geração em `mkdtemp` isolado, limpo sempre (contrato de `withGeneratedProject`).
- **Observabilidade**: o smoke já usa o runner de `checks.ts` (mesmo do doctor/release).

## 7. Riscos e mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| `init-project.ts` puxa rede mesmo com `--skip-backend` | M | A | Verificar no plan; se puxar, isolar o step de instruções ou usar `--only-memory` + chamada direta de `step02` |
| A "linha de cabeçalho" que `step02` reescreve muda de formato e o check de corpo-idêntico fica frágil | M | M | O check normaliza removendo linhas que casam os 2 regexes de `step02`, não um número fixo de linhas |
| Matriz de 3 células triplica o tempo de um job | B | B | Tier barato (segundos); célula isolada; `fail-fast: false` para ver todas |
| `init-project.ts` escreve fora do `projectDir` (ex.: `~/.forjarc`) | B | M | `HOME`/`FORJA_WORKSPACE` apontados para o tmp no `spawn` do smoke |

## 8. Métricas de sucesso

30 dias:

- Todo PR roda a matriz `project:smoke --ai`; um PR que quebra o gerador multi-IA fica vermelho
  antes do merge (observado ao menos 1×, ou confirmado por um teste de regressão que injeta a quebra).
- Zero divergência de corpo entre `.ia-instructions/<ai>.md` num projeto gerado (medido pelo check).
- `forja project:smoke --ai <lista>` roda local em < 30 s.

## Evidências e estado real

**Implementado em 2026-09-08** na branch `feat/projeto-gerado-smoke` (de `main`).
Bateria: `tsc --noEmit` limpo; `node --test test/*.test.js` **478/478** (+5 em `project-smoke.test.js`);
`forja spec:check` e `forja project:check` (100%) verdes; `ci.yml` parseia (3 jobs).

| AC | Onde | Verificado |
|---|---|---|
| AC-1 | `lib/core/project-smoke.ts` `withGeneratedProject`/`runProjectSmoke` | `runProjectSmoke({ ai })` gera só-memória + `writeAiInstructions`; sem `ai` inalterado (teste + `forja project:smoke` roda o projeto completo) |
| AC-2 | `scripts/project-smoke.ts` `parseAi` | `forja project:smoke --ai claude,copilot` → veredito/exit normais |
| AC-3 | `lib/core/project-smoke.ts` check `ai-instructions` | arquivos existem, corpo idêntico (via `stripInstructionHeader`), `models.json.fallback_chain` == lista; testes de divergência reprovam |
| AC-4 | `lib/core/project-smoke.ts` | `structure` roda `includeNest: !env.ai`; `generated`/`no-placeholders`/`json-valid`/`gate-inherited` agnósticos (todos `ok` no modo `--ai`) |
| AC-5 | `.github/workflows/ci.yml` | job `project-smoke-ai`, `fail-fast:false`, matriz `[claude, copilot, claude,copilot,gemini,codex]`, `npm ci` + `project:smoke --ai` |
| AC-6 | `test/project-smoke.test.js` | 5 testes: skipped sem `--ai`; ok da mesma fonte; corpo divergente reprova; `models.json` fora de sync reprova; integração `runProjectSmoke({ ai })` |
| AC-7 | — | `forja project:smoke --ai claude,copilot` local, exit 0, tier barato |
| AC-8 | — | bateria acima verde |

- **Desvio vs. o plan (D1 revisado)**: `init-project.ts` **não roda em dev** (hardcoda
  `bin/create-memory-nest-kit.js` e `.mjs`; trata o path como projeto de workspace). Em vez de
  consertar, a lógica de `step02CopyInstructions` foi extraída para
  **`lib/multi-ai-instructions.ts`** `writeAiInstructions()` (+ `stripInstructionHeader`); o
  `step02` passou a **delegar** para ela; o smoke gera com `create-memory-nest-kit --only-memory`
  + `writeAiInstructions`. Ganho: a escrita multi-IA virou função `lib/` testada, o coração de W8.
- **Hipótese, não medição**: o valor de §8 depende de um PR real quebrar o gerador; o teste de
  regressão que injeta a divergência é a evidência enquanto isso.
- **Pendências**: revisão de Governança; handoff `review` registrado. Independente das Ondas 1–2
  (mas o `ci.yml` e o `registry.ts` podem conflitar levemente no merge com #61 — trivial).
