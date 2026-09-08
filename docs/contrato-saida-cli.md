# Contrato de saída da CLI

Como um comando do Forja se comunica com automação — `--json` e exit codes. Decisão em
[ADR-0082](../memory/90-decisions/0082-contrato-saida-cli.md).

O contrato **rege apenas os comandos marcados `json: true`** no registry (`lib/core/registry.ts`).
Não é obrigação universal: a cobertura cresce spec a spec. `forja help <comando>` mostra `--json`
no uso ou num exemplo quando o comando o suporta.

## Para quem consome

Com `--json`, o **stdout carrega exatamente um valor JSON**, sempre um **objeto**, com uma string
`status`:

| `status` | significado | exit code | forma |
|---|---|---|---|
| `ok` | sucesso | `0` | `{ "status": "ok", ...campos do comando }` |
| `error` | falha operacional (args inválidos, arquivo ausente, subsistema fora) | `1` | `{ "status": "error", "error": { "message": "...", "code"?: "..." } }` |
| `rejected` | uma validação/gate que o **próprio comando** roda deu negativo | `2` | `{ "status": "rejected", ...payload }` |

Além disso:

- `127` — binário externo obrigatório ausente (só alvos `bin:` do registry; `bin/forja.ts` já
  devolve esse código e a mensagem).
- O **diagnóstico verboso vai para o stderr** — o stdout nunca tem nada além do objeto JSON.
- Os campos do comando ficam **ao lado** de `status` (flat), nunca sob um `data`.
- `--json` desliga ANSI e qualquer prompt: o comando falha (`error`) em vez de perguntar.

Exemplo de decisão de automação:

```bash
out=$(forja simulate HEAD --json); code=$?
case "$(jq -r .status <<<"$out")" in
  ok)       echo "promovível" ;;
  rejected) echo "não promova: $(jq -r .recommendation <<<"$out")" ;;   # exit 2
  error)    echo "falhou: $(jq -r .error.message <<<"$out")" >&2 ;;      # exit 1
esac
```

`llm:run` é o caso de referência do `rejected`: formato válido mas checks independentes
reprovaram → `validationStatus: "rejected"`, exit 2, `executionStatus` do modelo preservado
(ver [llm-fit-loop.md](llm-fit-loop.md)).

## Para quem escreve um script

Use `lib/cli-output.ts` — ele impõe o formato e o exit code:

```ts
import { emitOk, emitError, emitRejected } from '../lib/cli-output.ts';

if (!ref) emitError('Uso: forja simulate <ref> [--json]');        // stdout {status:error}, exit 1
const report = await run(ref);
if (report.recommendation === 'discard') emitRejected(report);     // stdout {status:rejected,...}, exit 2
emitOk(report);                                                    // stdout {status:ok,...}, exit 0
```

Cada função termina o processo. `emitError(msg, { code, detail })` põe `detail` no stderr. Sem
`--json`, mantenha a saída de texto atual — o helper é só para o ramo `--json`.

Marque o comando com `json: true` no registry e cite `--json` no `usage` ou num `example`. O
teste `test/cli-output-contract.test.js` itera o registry e reprova qualquer `json: true` que
não cumpra o contrato.

## Comandos cobertos

`status` · `next` · `engineer` · `simulate` · `cost:economy` · `token:economy`.

`spec:check` e `tools:doctor` também respondem `--json`, mas pelo **envelope da capability**
(`{ status: "succeeded" | "failed", output: { payload: … } }`) — são comandos MCP. Alinhar esse
envelope a este contrato é parte da cobertura MCP (W6). `risk:assess` e o restante entram
incrementalmente.
