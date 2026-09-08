# ADR-0082: Contrato de saída da CLI — `--json` e exit codes

- **Status**: accepted
- **Data**: 2026-09-08
- **Autor(es)**: Allan Pablo / Claude
- **Tags**: cli, contract, llm, automation

## Contexto

Um agente LLM (ou qualquer automação) que dirige o Forja precisa decidir o próximo passo lendo
a saída de um comando. Hoje não há contrato: `grep -rl "\-\-json" scripts/` encontra 10 scripts
em ~4 formatos. `simulate` e `engineer` emitem um `report` sem nenhuma chave de estado;
`token:economy --json` emite um **array cru**; `cost:economy --json` emite um objeto de forma
diferente e ainda escreve avisos no stdout, quebrando o `JSON.parse`. Os exit codes também
variam: `process.exitCode = 1` para erro de argumento, `1` também para `simulate` recomendar
`discard`, `2` para `llm:run` reprovar validação (documentado em `llm-fit-loop.md`), `127` para
binário externo ausente (em `bin/forja.ts`). Não existe tabela.

A SPEC-043 já adicionou o campo opcional `json` ao registry; a SPEC-044 já fez `forja status` e
`forja next` nascerem no formato-alvo. Falta fixar a regra e conformar os demais.

## Decisão

**Definir um contrato de saída, aditivo e incremental.** Ele rege apenas os comandos que optam
por `json: true` no registry — não obriga todo comando a suportar `--json`.

Com `--json`, o stdout carrega **exatamente um** valor JSON, um **objeto**, com uma string
`status`:

- `"ok"` — sucesso → exit **0**
- `"error"` — falha operacional (argumentos inválidos, arquivo ausente, subsistema fora) → exit
  **1**, com `error: { message, code? }`
- `"rejected"` — uma validação ou gate que o próprio comando roda deu negativo → exit **2**, com
  o payload ainda presente. É o caso de `llm:run` (validação reprovou) e de `simulate` quando a
  recomendação é `discard`.

Exit codes, em qualquer modo (não só `--json`):

| code | significado |
|---|---|
| 0 | sucesso |
| 1 | erro operacional |
| 2 | validação/gate do comando deu negativo |
| 127 | binário externo obrigatório ausente (só alvos `bin:` do registry; `bin/forja.ts` já cuida) |

Regras adicionais de `--json`: os campos específicos do comando ficam **ao lado** de `status`
(flat, não sob um `data`); diagnóstico verboso vai para o **stderr**; sem ANSI; sem prompt
interativo (falha em vez de perguntar).

Um helper compartilhado `lib/cli-output.ts` (`emitOk`, `emitError`, `emitRejected`) implementa o
formato e o exit code. Um teste de conformidade (`test/cli-output-contract.test.js`) itera o
registry e verifica todo comando `json: true`.

Conjunto conformado nesta rodada: `status`, `next`, `engineer`, `simulate`, `cost:economy`,
`token:economy`. `spec:check` e `tools:doctor` **já** emitem JSON, mas pelo **envelope da
capability** (`apps/cli/src/index.ts` os roteia como MCP), cujo `status` é `succeeded`/`failed` —
alinhar esse envelope ao contrato é trabalho da cobertura MCP (W6), não desta spec. `risk:assess`
fica para depois (orientado a arquivo).

## Alternativas consideradas

- **Envelope aninhado `{ status, data, meta }`** — rejeitado: mais profundidade para o agente
  navegar e quebraria o formato flat que `llm:run` (`executionStatus`/`validationStatus`) e
  `status`/`next` já usam.
- **Manter o array cru de `token:economy` e pôr o estado num campo lateral** — impossível sem
  violar "stdout = um objeto".
- **Helper que devolve `{ json, code }` para o script imprimir** — rejeitado: cada script erra
  de um jeito diferente na hora de imprimir e sair; foi assim que os 4 formatos surgiram. O
  helper termina o processo.
- **Deixar `simulate` discard em exit 1** — rejeitado: apaga a distinção entre "não promova"
  (decisão do gate) e "o comando falhou" (erro operacional), que é o motivo do contrato existir.

## Consequências

**Positivas**:
- Automação e agentes LLM ramificam por `status` + exit code, sem parsear prosa.
- Autor de script novo tem um doc e um teste que falha no desvio — a conformidade não depende de
  memória.
- `cost:economy --json` deixa de ser inutilizável (avisos saíam no stdout).

**Negativas / Trade-offs**:
- **Quebra de contrato JSON** em dois comandos, registrada aqui e no CHANGELOG:
  - `token:economy --json` passa de array `[...]` para `{ "status": "ok", "rows": [...] }`.
  - `simulate` com recomendação `discard` passa de exit `1` para exit `2`.
  Ambos os `--json` são recentes e sem consumidor externo conhecido; CI que trata `!= 0` como
  falha não muda de comportamento.
- O contrato é incremental: comandos sem `json: true` continuam sem garantia — a cobertura
  cresce spec a spec.

## Rastreamento

- Implementação: `lib/cli-output.ts`, `scripts/{forja-status,engineer,simulate,cost-economy,token-economy}.ts`, `lib/core/registry.ts`, `bin/forja.ts`
- Testes: `test/cli-output.test.js`, `test/cli-output-contract.test.js`
- [Spec](../../specs/contrato-saida-cli/spec.md) · [Doc](../../docs/contrato-saida-cli.md)
- ADRs relacionadas: ADR-0020 (core/registry), SPEC-043 (campo `json`), SPEC-044 (`status`/`next`)
