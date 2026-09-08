# Spec: contrato-saida-cli — `--json` e exit codes como contrato de máquina

- **ID**: SPEC-045
- **Status**: done
- **Owner**: apk
- **Criado em**: 2026-09-08
- **Sprint alvo**: <a definir>
- **ADRs relacionadas**: **ADR-0082** (nova — o contrato de saída).
- **Origem**: `docs/roadmap-v4.1.md`, Onda 2 (W5).
- **Depende de**: `cli-intuitiva-v1` (SPEC-043) — o campo `json` do registry já existe;
  `forja-status-caminho-feliz` (SPEC-044) — `status`/`next` já nascem com o formato-alvo.
  Branch empilhada sobre `feat/forja-status`.

## 1. Problema

Um agente LLM que dirige o Forja por automação não tem um contrato estável de máquina. Hoje:

- `--json` é ad-hoc por script. `simulate` e `engineer` emitem um `report` sem chave de status;
  `token:economy` emite um **array cru**; `cost:economy` emite um objeto de forma diferente.
  Nenhum tem uma chave comum que diga "deu certo?".
- Exit codes variam: alguns scripts fazem `process.exitCode = 1` em erro de argumento, `simulate`
  usa `1` também para "recomendação = discard", `llm:run` usa **2** para "validação reprovou"
  (documentado), `bin/forja.ts` já devolve **127** para binário ausente. Não há uma tabela.
- Diagnóstico e resultado se misturam no stdout: um `console.log` de aviso no meio quebra o
  `JSON.parse` de quem consome.

**Como medimos hoje**: não há instrumentação. Evidência: `grep -rl "\-\-json" scripts/` → 10
scripts, 4 formatos diferentes.

## 2. Proposta de valor

Um contrato único, documentado e testado: **`--json` sempre emite um objeto JSON parseável com
uma chave `status`; os exit codes seguem uma tabela fixa (0 / 1 / 2 / 127)**. Comandos marcados
`json: true` no registry cumprem o contrato e um teste de conformidade os verifica. Automação
(inclusive agentes LLM) decide o próximo passo lendo `status` + exit code, sem parsear texto.

## 3. User stories

- **Como** agente LLM em automação, **quero** que todo comando `--json` devolva `{ "status": … }`
  e um exit code da tabela, **para que** eu ramifique sem interpretar prosa.
- **Como** autor de script novo no Forja, **quero** o contrato num doc + um teste que falha se eu
  desviar, **para que** a conformidade não dependa de memória.
- **Como** operador, **quero** que `--json` mande diagnóstico para o stderr, **para que** o stdout
  seja sempre um único valor JSON.

## 4. Critérios de aceite (Definition of Done)

- [ ] **AC-1**: **ADR-0082** registra o contrato: chave `status`, valores, tabela de exit codes,
      regra "stdout = um único JSON, diagnóstico no stderr", e que é **aditivo e incremental**
      (não obriga todo comando a suportar `--json`).
- [ ] **AC-2**: `docs/contrato-saida-cli.md` descreve o contrato para quem escreve e quem consome,
      com exemplos, e é citado no `DOC-MAP.md`.
- [ ] **AC-3**: o contrato:
      - `--json` → stdout carrega **exatamente um** valor JSON, um **objeto**, com string `status`:
        - `"ok"` — sucesso → exit **0**
        - `"error"` — falha operacional (args inválidos, arquivo ausente, subsistema fora) → exit
          **1**, com `error: { message, code? }`
        - `"rejected"` — uma validação/gate que o comando roda deu negativo (caso `llm:run` /
          `simulate`) → exit **2**, com o payload ainda presente
      - `127` reservado para binário externo obrigatório ausente (já em `bin/forja.ts`)
      - campos específicos do comando ficam **ao lado** de `status` (flat), não sob um `data`
      - `--json` implica: sem ANSI, sem prompt interativo (falha em vez de perguntar)
- [ ] **AC-4**: `bin/forja.ts` — comentário/normalização que documenta a tabela de exit codes num
      lugar; nenhuma mudança de comportamento para comandos que já saem 0/1/127.
- [ ] **AC-5**: conjunto inicial marcado `json: true` no registry e **conformado**:
      `status`, `next`, `engineer`, `simulate`, `cost:economy`, `token:economy`.
      `spec:check` e `tools:doctor` ficaram **fora**: já emitem JSON, mas pelo envelope da
      capability (roteados como MCP em `apps/cli/src/index.ts`) — alinhar isso é W6.
      `risk:assess` fica para depois (orientado a arquivo). (Ajustado do texto original no `plan`.)
- [ ] **AC-6**: `test/cli-output-contract.test.js` — para cada comando `json: true`: roda com
      `--json` e argumentos mínimos válidos, e afirma (a) stdout é **um** JSON parseável,
      (b) é objeto com `status` ∈ {`ok`,`error`,`rejected`}, (c) exit code casa com o `status`,
      (d) com args inválidos → `status:"error"` + exit 1.
- [ ] **AC-7**: os comandos que hoje quase cumprem são adaptados sem mudar a saída **default**
      (sem `--json`): `token:economy` deixa de emitir array cru (embrulha em `{status, rows}`);
      `simulate`/`engineer` ganham `status`; exit code de `simulate` para "discard" passa a `2`
      (`rejected`), não `1`.
- [ ] **AC-8**: `forja help` de todo comando `json: true` mostra `--json` no `usage` ou num
      exemplo.
- [ ] **AC-9**: `tsc --noEmit`, `node --test test/*.test.js`, `forja spec:check`,
      `forja project:check` verdes; `forja help --all` sem regressão além do esperado.

## 5. Escopo

**Dentro**:
- ADR-0082 + `docs/contrato-saida-cli.md` + linha no `DOC-MAP.md`.
- `json: true` no registry para o conjunto do AC-5; adaptação dos scripts do AC-7.
- `test/cli-output-contract.test.js`.
- Comentário da tabela de exit codes em `bin/forja.ts`.

**Fora** (evita scope creep):
- Retrofit de `--json` em comandos que hoje não têm (é backlog incremental; o contrato só rege
  quem opta por `json: true`).
- Mudar a saída **default** (sem `--json`) de qualquer comando.
- Padronizar a saída de `capabilities:*` / MCP (isso é W6).
- Um envelope `data`/`meta` aninhado — o contrato é flat de propósito.
- `--json` no `bin/forja.ts` em si (ele repassa; o formato é de cada script).

## 6. NFRs / restrições

- **Compatibilidade**: nenhuma mudança na saída default. `token:economy --json` muda de forma
  (array → objeto) — **é uma quebra do contrato JSON desse comando**, registrada no ADR e no
  CHANGELOG; os outros só ganham a chave `status`.
- **Performance**: irrelevante (formatação de saída).
- **Segurança**: `--json` não pode vazar stack trace no stdout; erro vai em `error.message`
  saneado + stderr.
- **Observabilidade**: exit code auditado em `forja-runs.jsonl` como hoje.

## 7. Riscos e mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Mudar `token:economy --json` quebra algum consumidor | M | M | ADR + CHANGELOG explícitos; é o único cujo formato muda; `--json` desse comando é novo o suficiente para não ter consumidor externo conhecido |
| "conformar" um script vira refactor grande | M | M | Conjunto do AC-5 é pequeno e fechado no plan; adaptação é embrulhar a saída, não reescrever |
| `simulate` mudar exit 1→2 para "discard" confunde CI que trata !=0 igual | B | B | CI trata `!= 0` como falha de qualquer jeito; a distinção 1 vs 2 só importa para quem lê o código, e o ADR documenta |
| Exit code 2 colide com convenção de shell (misuse) | B | B | 2 é livre para o app; documentado; `llm:run` já usa |

## 8. Métricas de sucesso

30 dias, baseline antes:

- Todo comando `json: true` passa no teste de conformidade (0 exceções).
- Adoção: automação/agentes consumindo `--json` desses comandos aparece em `forja-runs.jsonl`
  (flag `--json` nas linhas de auditoria).
- Zero incidentes de "quebrou meu parse" reportados após a mudança do `token:economy`.

## Evidências e estado real

**Implementado em 2026-09-08** na branch `feat/contrato-saida-cli` (sobre `feat/forja-status`).
Bateria: `tsc --noEmit` limpo; `node --test test/*.test.js` **503/503** (+7: `test/cli-output.test.js`,
`test/cli-output-contract.test.js`); `forja spec:check` e `forja project:check` (100%) verdes.

| AC | Onde | Verificado |
|---|---|---|
| AC-1 | `memory/90-decisions/0082-contrato-saida-cli.md` | `adr-refs` do doctor verde (78 ADRs) |
| AC-2 | `docs/contrato-saida-cli.md`, `DOC-MAP.md` | `docs-links`/`docs-commands` verdes |
| AC-3 | `lib/cli-output.ts` (`emitOk`/`emitError`/`emitRejected`) | `test/cli-output.test.js` — forma + exit + `detail` no stderr |
| AC-4 | `bin/forja.ts` — comentário da tabela; arg obrigatório + `--json` → `{status:'error'}` | teste no `cli-output-contract` |
| AC-5 | `lib/core/registry.ts` `json:true` | `status`, `next`, `engineer`, `simulate`, `cost:economy`, `token:economy` |
| AC-6 | `test/cli-output-contract.test.js` | itera `json:true` do registry; forma + exit por `status` |
| AC-7 | `scripts/{token-economy,cost-economy,simulate,engineer,forja-status}.ts` | `token:economy --json`→objeto; `cost:economy --json` sem poluição; `simulate` discard→exit 2; saída default inalterada (testes existentes verdes) |
| AC-8 | `lib/core/registry.ts` | `--json` no `usage`/`examples` dos 6 |
| AC-9 | — | bateria acima verde |

- **Desvio vs. o plan (D7, descoberto na implementação)**: `spec:check` e `tools:doctor`
  **saíram** do conjunto. São roteados como capability MCP por `bin/forja.ts` — o `--json` é
  consumido pelo dispatcher e a saída sai no envelope `{ status: 'succeeded'|'failed', output }`.
  Conformar o script seria código morto atrás do envelope; alinhar o **envelope** é W6.
- **Quebras de contrato deliberadas** (ADR-0082 + CHANGELOG): `token:economy --json` (array →
  `{status, rows}`); `simulate` discard (exit 0 → 2, `status:'rejected'` no `--json`). O texto
  original da spec dizia "1 → 2" — na verdade discard não sinalizava exit code algum; agora
  sinaliza 2. Teste `test/simulate-cli.test.js` atualizado.
- **Também corrigido**: `cost:economy --json` escrevia avisos de texto no stdout, quebrando o
  `JSON.parse`; agora vão para o stderr.
- **Hipótese, não medição**: os ganhos de §8 dependem de agregação da flag `--json` do
  `forja-runs.jsonl`, que ninguém faz ainda.
- **Pendências**: revisão de Governança; handoff `review` registrado; depende do merge de #62/#61.
