# Plan: llm-contexto-e-sessoes

- **Spec**: ./spec.md
- **Status**: approved
- **Criado em**: 2026-09-08

> Como vamos construir o que a spec define. Sem código aqui — só estrutura e decisões.

## 1. Abordagem técnica

Dois acréscimos ao `scripts/llm-fit.ts`, sem tocar o motor. **`--engineer "<objetivo>"`**: no
`run()`, antes de montar o prompt, roda `forja engineer "<obj>" --json` num subprocesso, faz
`JSON.parse` do relatório e o **prepende ao prompt** como um bloco rotulado — daí em diante o
fluxo é idêntico (hash cobre o prompt final, `contextRefs` ganha `engineer:<obj>`). **`sessions`**:
subcomando novo (`list` | `show <id>`) que lê `llm_session` por `SqliteJsonRepository.list/get`,
via dois métodos de leitura pura em `LlmSessionStore`. Read-only, sem provedor.

## 2. Módulos afetados

| Caminho | Mudança | Risco |
|---|---|---|
| `scripts/llm-fit.ts` | editar — `run()`: aceitar `--engineer` na allowlist de flags; se presente, `buildEngineerBlock(obj)` e prepender ao prompt; `refs` ganha `engineer:<obj>`; `errorCode: 'ENGINEER_FAILED'` se o façade falhar (antes de `runLlm`). Novo `cmdSessions()` + branch `command === 'sessions'` no `main()` | M |
| `lib/llm/context.ts` | editar — `buildEngineerBlock(objective, { cwd, run? }): { text: string; ref: string }` — spawna `forja engineer "<obj>" --json`, parseia, formata o bloco; `run` injetável para teste | M |
| `lib/llm/session.ts` | editar — `LlmSessionStore.all(): LlmSession[]` (desc por `updatedAt`) e `find(id): LlmSession \| undefined` (sem `assertBinding`) | B |
| `lib/core/registry.ts` | editar — `llm:run.desc` cita `--engineer`; entrada `llm:sessions` (`domain: 'llm'`, `node: 'scripts/llm-fit.ts'`, `args: ['sessions']`, `gates: ['workspace']`, `readonly: true`, `json: true`, `usage`, `examples`) | B |
| `docs/llm-fit-loop.md` | editar — seções de `--engineer` e `llm:sessions` | B |
| `test/llm-fit.test.js` (ou novo `test/llm-sessions.test.js`) | criar/estender — `buildEngineerBlock` com `run` fake; `LlmSessionStore.all/find`; `sessions list|show` via CLI num workspace com `llm_session` semeado | M |

## 3. Diagrama de fluxo

```
forja llm:run --profile p --engineer "<obj>" [--prompt "<t>"] [--context f] [--output-schema s]
   │
   ├─ engineerBlock = buildEngineerBlock("<obj>")
   │     spawn: forja engineer "<obj>" --json
   │       exit ≠ 0 → imprime { errorCode:'ENGINEER_FAILED', stderr:<1ª linha> } · process.exit(1)   ← antes do provedor
   │       exit 0   → { text: "=== Contexto do engineer ===\n<JSON>", ref: "engineer:<obj>" }
   ├─ prompt' = engineerBlock.text + "\n\n" + (prompt | task)
   ├─ context = buildContextPrompt(prompt', --context files)      (mecanismo atual, inalterado)
   ├─ fullPrompt = context.prompt [+ instrução de schema]
   ├─ inputHash = sha256(fullPrompt)                               (cobre o bloco engineer — AC-2)
   ├─ refs = [...context.refs, "engineer:<obj>", schemaPath?, manifestPath?]   (referência, nunca conteúdo)
   └─ runLlm(...) → observação + validação + (Codex) llm_session  (tudo como hoje)

forja llm:sessions list [--json]        → LlmSessionStore.all()  → tabela / array
forja llm:sessions show <id> [--json]   → find(id) + observação vinculada + llm_validation  → objeto
      id desconhecido → stderr + exit 1
```

## 4. Contratos (API/CLI/Schema)

```ts
// lib/llm/context.ts
export function buildEngineerBlock(
  objective: string,
  opts?: { cwd?: string; run?: (argv: string[]) => { code: number; stdout: string; stderr: string } },
): { text: string; ref: string };   // lança/propaga o exit≠0 via um erro com .code === 'ENGINEER_FAILED'

// lib/llm/session.ts  (métodos novos em LlmSessionStore)
all(): readonly LlmSession[];              // desc por updatedAt
find(id: string): LlmSession | undefined;  // leitura pura, sem assertBinding
```

**CLI**:
- `llm:run --engineer "<objetivo>"` — combina com `--prompt`/`--task` e `--context`. Sem
  `--prompt`/`--task`, o `<objetivo>` também vira o prompt.
- `llm:sessions list [--json]` — `[{ id, cwd, updatedAt, observationId }]`.
- `llm:sessions show <id> [--json]` — `{ session, observation?: { model, outcome, validationStatus,
  durationMs }, validation?: { status, checks: string[] } }`.

**Saída do `llm:run`**: inalterada, exceto o ramo de erro novo
`{ profile, errorCode: 'ENGINEER_FAILED', stderr }` com exit 1.

## 5. Decisões e alternativas

**D1 — `--engineer` por subprocesso (`forja engineer --json`), não in-process.** `scripts/engineer.ts`
carrega grafo + sqlite + vários pacotes; importar `buildReport` exige mover todo esse setup para
`lib/`. Rejeitado nesta rodada — o subprocesso reusa o façade como está, ao custo de ~1–2 s de
bootstrap, desprezível vs. a chamada ao modelo. (Extrair para `lib/` fica como backlog se
`--engineer` virar caminho quente.)

**D2 — Prepender o bloco ao prompt, sem tocar `buildContextPrompt`.** `prompt' = block + prompt`,
depois `buildContextPrompt(prompt', files)` como hoje. Ordem final: engineer → prompt → contextos
→ schema. Rejeitado: adicionar um parâmetro a `buildContextPrompt` (mais superfície, o mesmo
efeito).

**D3 — `contextRefs` ganha `engineer:<objetivo>`, o conteúdo nunca é persistido.** Igual ao
tratamento de `--context` (path, não conteúdo). O relatório vai só para o prompt transmitido e o
hash — a fronteira de privacidade do `docs/llm-fit-loop.md` é preservada.

**D4 — `ENGINEER_FAILED` falha antes do provedor.** Pedir `--engineer` e mandar um prompt sem o
contexto seria pior que falhar. Aditivo ao `errorCode` (que já distingue timeout/protocolo/etc.).

**D5 — `sessions` não usa `flags()`.** `flags()` é estrito com `--`; `list`/`show`/`<id>` são
posicionais. `cmdSessions()` parseia `argv` próprio, aceitando `--json` em qualquer posição.

**D6 — `show` lê a observação por `store.list().find(id)` e a `llm_validation` por
`repository.get('llm_validation', observationId)`, com fallback "indisponível".** Não acopla a
schema interno além do que a saída do `llm:run` já expõe.

Sem ADR — nenhuma decisão estrutural; a fronteira de privacidade e o read-only default (ADR-0081)
seguem intactos.

## 6. Dependências

- `forja engineer` (SPEC-035) e `llm_session` (ADR-0081) — ambos em `main`.
- **Pacotes npm**: nenhum.
- **Migrações**: nenhuma (`llm_session` já existe na tabela genérica `forja_records`).

## 7. Rollout

- [ ] Feature flag: não. `--engineer` e `llm:sessions` são aditivos.
- [ ] Migração de dados: não.
- [ ] Doc/persona: `docs/llm-fit-loop.md` (`--engineer`, `llm:sessions`); `docs/llm-evolution.md`
      pode citar que C2/C5 fecharam.
- [ ] `CHANGELOG.md` `[Unreleased]`: Adicionado (`llm:run --engineer`, `llm:sessions`).

## 8. Sinais de fracasso (kill criteria)

- O bloco do `engineer` é grande e sem `--ref` fica genérico demais para valer — então `--engineer`
  passa a aceitar `--engineer-ref`/`--engineer-role` (sai do "fora de escopo") ou vira só um
  atalho documentado para `--context <(forja engineer --json)`.
- `sessions show` depende de campos internos que mudam a cada release — reduzir `show` a só a
  `LlmSession` + um ponteiro para `forja llm:eval`/`evidence:show`.
- `flags()`/`main()` do `llm-fit.ts` resistem ao subcomando novo sem refator — nesse caso
  `llm:sessions` vira um script próprio (`scripts/llm-sessions.ts`) reusando `lib/llm/session.ts`.

## Evidências e estado real

| AC | Task | Verificação |
|---|---|---|
| AC-1 | T2, T3 | `llm:run --engineer` embute o bloco; combina com `--prompt`/`--context` |
| AC-2 | T3 | `inputHash` cobre o bloco; `contextRefs` tem `engineer:<obj>`, sem conteúdo |
| AC-3 | T3 | `engineer` exit≠0 → `ENGINEER_FAILED`, exit 1, sem `runLlm` |
| AC-4 | T4, T5 | `llm:sessions list` (texto + `--json`) |
| AC-5 | T4, T5 | `llm:sessions show <id>`; id desconhecido → exit 1 |
| AC-6 | T4 | registry `readonly:true`; nenhuma escrita |
| AC-7 | T6 | registry + `docs/llm-fit-loop.md` |
| AC-8 | T1, T2 | `LlmSessionStore.all/find`; `buildEngineerBlock` testável |
| AC-9 | T7 | bateria completa; testes de `llm:run`/sessão intactos |

- **Sem mudança de contrato** na saída do `llm:run` (só um `errorCode` novo, aditivo).
- **Hipótese, não medição**: adoção depende de uso real; a flag `--engineer` já é auditada.
