# Plan: contrato-saida-cli

- **Spec**: ./spec.md
- **Status**: approved
- **Criado em**: 2026-09-08

> Como vamos construir o que a spec define. Sem código aqui — só estrutura e decisões.

## 1. Abordagem técnica

**Um contrato escrito, um helper que o torna mecânico, um teste que o guarda.** ADR-0082 e
`docs/contrato-saida-cli.md` fixam a regra. `lib/cli-output.ts` (novo) dá três funções —
`emitOk`, `emitError`, `emitRejected` — que escrevem o JSON no formato certo e devolvem o exit
code certo; conformar um script é trocar `console.log(JSON.stringify(x))` + `process.exitCode` por
uma dessas. `test/cli-output-contract.test.js` roda cada comando `json: true` com `--json` e
afirma forma + exit code. `bin/forja.ts` só ganha um comentário com a tabela — o exit code do
filho já passa direto.

## 2. Módulos afetados

| Caminho | Mudança | Risco |
|---|---|---|
| `memory/90-decisions/0082-contrato-saida-cli.md` | **criar** — o contrato (status accepted; Allan aprovou incluindo as quebras) | B |
| `docs/contrato-saida-cli.md` | **criar** — para autores e consumidores, com exemplos | B |
| `DOC-MAP.md` | editar — uma linha para o doc novo | B |
| `lib/cli-output.ts` | **criar** — `emitOk(fields)`, `emitError(message, code?)`, `emitRejected(fields)`; cada uma faz `console.log(JSON.stringify(...))` no stdout e `process.exit(0\|1\|2)` | B |
| `scripts/forja-status.ts` | editar — trocar os `console.log(JSON.stringify(...))` por `emitOk` (já é conformante na forma; passa a usar o helper) | B |
| `scripts/engineer.ts` | editar — `--json` passa por `emitOk({ ...report })`; erro de arg → `emitError` | M |
| `scripts/simulate.ts` | editar — `emitOk` no caminho normal; **recommendation `discard` → `emitRejected` (exit 2)**; erro de arg → `emitError` | M |
| `scripts/cost-economy.ts` | editar — os `console.log` de aviso vão para **stderr**; `--json` → `emitOk({ status, ...rows })` | M |
| `scripts/token-economy.ts` | editar — `--json` **deixa de emitir array cru**; passa a `emitOk({ status, rows: [...] })` | M |
| `scripts/spec-cli.ts` | editar — **adicionar** `--json` ao subcomando `check`: `emitOk({ status, features: [{slug, spec, plan, tasks}] })` | M |
| `scripts/tools-doctor.ts` | editar — **adicionar** `--json`: `emitOk`/`emitError({ status, core: [...], tools: [...] })` a partir do que `runChecks` já devolve; texto atual quando sem `--json` | M |
| `lib/core/registry.ts` | editar — `json: true` no conjunto conformado; `--json` no `usage`/`examples` de cada um | B |
| `bin/forja.ts` | editar — bloco de comentário com a tabela de exit codes junto ao dispatch; sem mudança de comportamento | B |
| `test/cli-output-contract.test.js` | **criar** — AC-6 | B |
| `CHANGELOG.md` | editar — `[Unreleased]`: Adicionado (contrato, `--json` em `spec:check`/`tools:doctor`); **Alterado/Breaking** (`token:economy --json`, `simulate` discard exit) | B |

## 3. Diagrama de fluxo

```
qualquer script com --json
   │
   ├─ sucesso            → emitOk({ status:'ok', ...campos })          → stdout: 1 objeto JSON, exit 0
   ├─ erro operacional   → emitError('mensagem', 'CODE?')             → stdout: {status:'error', error:{message,code?}}, exit 1
   │                                                                     (diagnóstico verboso → stderr)
   └─ validação/gate neg → emitRejected({ status:'rejected', ...payload }) → stdout: 1 objeto JSON, exit 2

binário externo obrigatório ausente → bin/forja.ts → exit 127   (já existe)

sem --json  → comportamento atual, inalterado
```

## 4. Contratos (API/CLI/Schema)

```ts
// lib/cli-output.ts
type Json = Record<string, unknown>;

/** stdout = {status:'ok', ...fields}; process.exit(0). */
export function emitOk(fields?: Json): never;

/** stdout = {status:'error', error:{message, code?}}; process.exit(1). `detail` opcional vai para stderr. */
export function emitError(message: string, opts?: { code?: string; detail?: string }): never;

/** stdout = {status:'rejected', ...fields}; process.exit(2). Para quando um gate/validação do próprio comando deu negativo. */
export function emitRejected(fields?: Json): never;
```

**Tabela de exit codes (todos os modos, não só `--json`)**:

| code | significado |
|---|---|
| 0 | sucesso (`status:'ok'`) |
| 1 | erro operacional: args inválidos, arquivo ausente, subsistema fora (`status:'error'`) |
| 2 | validação/gate do comando deu negativo (`status:'rejected'`) — ex.: `llm:run`, `simulate` discard |
| 127 | binário externo obrigatório ausente (só `bin:` no registry; `bin/forja.ts` já cuida) |

**Conjunto `json: true` fechado** (AC-5, ajustado do spec): `status`, `next` (já conformes),
`spec:check`, `tools:doctor`, `engineer`, `simulate`, `cost:economy`, `token:economy`.
`risk:assess` fica de fora desta rodada (orientado a arquivo; `--json` lá é backlog).

## 5. Decisões e alternativas

**D1 — `status` flat, não um envelope `{status, data, meta}`.** Os campos do comando ficam ao
lado de `status`. Alinha com `llm:run`, que já expõe `executionStatus`/`validationStatus` no
topo. Rejeitado: envelope aninhado (mais profundidade para o agente navegar, e quebraria o
formato que `llm:run`/`status`/`next` já usam).

**D2 — Helper `lib/cli-output.ts` com `process.exit`, não um objeto de retorno.** As três funções
terminam o processo. Conformar vira substituição direta. Rejeitado: devolver `{json, code}` para
o script imprimir (cada script erra de um jeito diferente — foi como chegamos aqui).

**D3 — `spec:check` e `tools:doctor` ganham `--json` nesta spec.** São os dois que um agente mais
quer estruturados e ambos já têm o dado pronto por dentro (`runChecks(): Result[]`; os triples de
status das specs). Rejeitado adiar: sem eles o contrato nasce sem os comandos mais consumidos.

**D4 — `token:economy --json`: array → `{status, rows}`. Breaking, aceito.** É o único cujo
formato JSON muda. `--json` desse comando é recente e sem consumidor externo conhecido. ADR-0082
e CHANGELOG registram. Alternativa (manter o array e pôr `status` num header): rejeitada — viola
"stdout = um objeto".

**D5 — `simulate`: recommendation `discard` passa de exit 1 para exit 2 (`rejected`).** Hoje usa
`1`, que colide com "erro operacional". `discard` é o gate do simulate dizendo "não promova" — é
`rejected`. Alternativa (deixar 1): rejeitada — apaga a distinção que o contrato existe para criar.

**D6 — ADR-0082 `accepted`, não `proposed`.** Allan aprovou a spec incluindo D4 e D5.

## 6. Dependências

- **Spec `cli-intuitiva-v1` (SPEC-043)** — o campo `json` do registry já existe.
- **Spec `forja-status-caminho-feliz` (SPEC-044)** — `status`/`next` são o formato de referência;
  branch empilhada sobre `feat/forja-status`.
- **Pacotes npm**: nenhum.
- **Migrações**: nenhuma.

## 7. Rollout

- [ ] Feature flag: não.
- [ ] Migração de dados: não.
- [ ] Doc/persona: `docs/contrato-saida-cli.md` novo + `DOC-MAP.md`; `docs/llm-fit-loop.md` já
      descreve o contrato de `llm:run` — adicionar um "ver contrato-saida-cli.md".
- [ ] `CHANGELOG.md` `[Unreleased]`: **Adicionado** (contrato + `--json` em `spec:check` e
      `tools:doctor`); **Alterado (breaking, `--json` só)**: `token:economy` array→objeto;
      `simulate` discard exit 1→2.

## 8. Sinais de fracasso (kill criteria)

- Conformar `cost:economy`/`token:economy` esbarra em lógica de negócio entrelaçada com o
  `console.log` → congelar esses dois em "backlog de conformidade" e entregar o contrato + o
  helper + `status`/`next`/`spec:check`/`tools:doctor`/`engineer`/`simulate`.
- `tools:doctor --json` exige refatorar `printCore`/`printTools` a ponto de arriscar o exit-code
  do gate → entregar `spec:check --json` só, e deixar `tools:doctor --json` para uma spec própria.
- O teste de conformidade fica flaky por depender de estado do workspace → rodar cada comando num
  `FORJA_WORKSPACE` temporário fixo, com fixtures mínimas.

## Evidências e estado real

| AC | Task | Verificação |
|---|---|---|
| AC-1 | T1 | ADR-0082 existe, `adr-refs` do doctor verde |
| AC-2 | T2 | `docs/contrato-saida-cli.md` + `DOC-MAP.md`; `docs-links`/`commands-documented` verdes |
| AC-3 | T3 | `lib/cli-output.ts` + testes unitários das 3 funções (forma + exit) |
| AC-4 | T8 | comentário da tabela em `bin/forja.ts`; `forja-core` test verde |
| AC-5 | T4, T5, T6 | registry `json:true` no conjunto; `forja help <cmd>` cita `--json` |
| AC-6 | T7 | `node --test test/cli-output-contract.test.js` verde |
| AC-7 | T5, T6 | `token:economy --json` → objeto; `simulate` discard → exit 2; saída default inalterada (snapshot) |
| AC-8 | T4 | `usage`/`examples` dos `json:true` mencionam `--json` |
| AC-9 | T9 | bateria completa verde |

- **Mudança de contrato**: `token:economy --json` (array → `{status,rows}`), `simulate` discard
  (exit 1 → 2). No ADR-0082 e no CHANGELOG.
- **Hipótese, não medição**: métricas de §8 dependem de agregação da flag `--json` do
  `forja-runs.jsonl`, que ninguém faz ainda.
