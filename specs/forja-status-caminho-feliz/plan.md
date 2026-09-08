# Plan: forja-status-caminho-feliz

- **Spec**: ./spec.md
- **Status**: approved
- **Criado em**: 2026-09-07

> Como vamos construir o que a spec define. Sem código aqui — só estrutura e decisões.

## 1. Abordagem técnica

**Compor, não coletar de novo.** Um módulo puro `lib/status-model.ts` monta um `StatusModel`
(workspace, sprint, orchestrate, specs, recentRuns, handoffs) chamando helpers que já existem ou
que extraímos de onde já vivem — nada de re-parsear. `scripts/forja-status.ts` é o único script
novo e serve os dois comandos (`args: ['status']` / `args: ['next']`): `status` renderiza o
model (texto ou `--json`); `next` roda `recommendNext(model)` — a escada de prioridade da AC-4,
uma função pura. Cada coletor é `try/catch` → `{ available: false, reason }`; o comando nunca
lança. Somente leitura, sem gate bloqueante.

## 2. Módulos afetados

| Caminho | Mudança | Risco |
|---|---|---|
| `scripts/forja-status.ts` | **criar** — dispatch `status`/`next`; flags `--json`; render de texto; sai 0 sempre que o model montou | B |
| `lib/status-model.ts` | **criar** — `collectStatus(root, opts): StatusModel` + `recommendNext(model): { action, command, reason }` (puro) | M |
| `lib/specs-index.ts` | **criar** — `listSpecs(root): {slug,status}[]`, movido de `scripts/hook-session-start.ts` | B |
| `lib/sprint-index.ts` | **criar** — `readSprint(root): {active, title, items} \| null`, lendo `memory/40-delivery/current-sprint.md` (espelha `showStatus` de `sprint-manager.ts`, sem reusá-lo: aquele só imprime) | B |
| `lib/handoffs-index.ts` | **criar** — `openHandoffs(): Row[]`, movido de `scripts/hook-session-start.ts` (query SQLite readonly, `try/catch`→`[]`) | B |
| `lib/orchestrate.ts` | editar — `export function listRuns(root, env?): string[]` (glob `.context/orchestrate-*.json` → slugs); `loadState` já é exportado | B |
| `scripts/hook-session-start.ts` | editar — importar `listSpecs`/`openHandoffs` dos novos `lib/` em vez das cópias locais | B |
| `lib/core/registry.ts` | editar — entradas `status` e `next` (`tier:'core'`, `readonly:true`, `usage`/`examples`/`next`, `json:true`); mover os 3 `orchestrate*` para o topo do bloco `gsd` (ordem do objeto = ordem no `forja help`) | B |
| `README.md` | editar — uma linha: `orchestrate` como caminho padrão | B |
| `test/forja-status.test.js` | **criar** — AC-8 | B |
| `test/hook-session-start*.test.js` | editar se existir — garantir que a extração não regrediu | B |

## 3. Diagrama de fluxo

```
forja status [--json]                       forja next [--json]
   │                                            │
   └── collectStatus(root)                      └── collectStatus(root)
         ├─ workspace  ← getWorkspaceInfo()           │
         ├─ sprint     ← lib/sprint-index             └── recommendNext(model)  (função pura, AC-4)
         ├─ orchestrate← lib/orchestrate: listRuns→loadState        1 workspace ausente      → forja setup
         ├─ specs      ← lib/specs-index                            2 memória crua           → forja sync:universal
         ├─ recentRuns ← tail(.context/forja-runs.jsonl)            3 corrida gate vermelho  → (parecer) + orchestrate:advance
         └─ handoffs   ← lib/handoffs-index (SQLite ro)             4 corrida etapa pronta   → forja orchestrate:advance
   │                                                                5 spec approved s/ plan  → forja spec:plan <slug>
   ├─ --json → { status:"ok", workspace, sprint, ... }                plan approved s/ tasks → forja spec:tasks <slug>
   │           subsistema em erro → { available:false, reason }     6 spec implementing      → forja spec:check <slug>
   └─ texto → seções rotuladas; seção em erro → "indisponível: …"   7 nada pendente          → orchestrate "<obj>" --slug / spec:new
```

`collectStatus` é chamado uma vez por invocação; `status` e `next` compartilham o mesmo model.

## 4. Contratos (API/CLI/Schema)

```ts
// lib/status-model.ts
interface Sub<T> { available: true; value: T }  // ou { available: false; reason: string }
interface StatusModel {
  workspace: { root: string; source: string; exists: boolean };
  sprint: Sub<{ active: boolean; title: string | null; items: number }>;
  orchestrate: Sub<{ runs: { slug: string; goal: string; openStage: string | null;
                             lastVerdict: string | null; concluded: boolean }[] }>;
  specs: Sub<{ slug: string; status: string }[]>;
  recentRuns: Sub<{ cmd: string; exitCode: number; ts: string }[]>;   // até 5
  handoffs: Sub<{ id: number; from: string; to: string; intent: string; slug: string }[]>;
}
interface NextAction { action: string; command: string; reason: string }

export function collectStatus(root: string, opts?: { runsLimit?: number }): StatusModel;
export function recommendNext(model: StatusModel): NextAction;
```

- `forja status` / `forja next`: exit **0** sempre que o model montou (subsistema em erro não é
  falha do comando). Exit 1 só se o próprio processo não conseguir escrever a saída.
- `forja status --json`: objeto com as 6 chaves + `status: "ok"`.
- `forja next --json`: `{ action, command, reason }`.
- Sem `--json`: texto legível; nunca stack trace.

## 5. Decisões e alternativas

**D1 — Um script, dois comandos, model compartilhado.** `scripts/forja-status.ts` cobre `status`
e `next` via `args`. Rejeitado: dois scripts (duplica bootstrap + coleta); pôr a lógica no
`bin/forja.ts` (o core não deve crescer com lógica de domínio).

**D2 — Extrair `listSpecs`/`openHandoffs` do hook para `lib/`, o hook reimporta.** É o reuso que
a AC-7 exige e remove a cópia que já existia solta no hook. Rejeitado: `forja status` spawnar o
hook (o hook devolve JSON de `hookSpecificOutput`, não um model) ou duplicar a leitura.

**D3 — Estado da corrida via `loadState` + novo `listRuns`, não `orchestrate:status --json`.**
`lib/orchestrate.ts` já exporta `loadState(root, slug)`. Falta só descobrir os slugs — `listRuns`
faz glob de `.context/orchestrate-*.json`. Rejeitado: adicionar `--json` a `orchestrate` (mais
superfície pública para manter; fora do escopo da spec).

**D4 — `sprint-index` novo, não reusar `sprint-manager.ts`.** `showStatus` daquele script só
imprime; extrair exigiria refatorá-lo. `readSprint` lê o mesmo arquivo
(`memory/40-delivery/current-sprint.md`) e devolve dado. Se `sprint-manager` for tocado depois,
consolidar então.

**D5 — `--json` destes 2 comandos segue as convenções que W5 vai formalizar** (`status: "ok"`,
sem exit code novo). Não bloqueia em W5; quando W5 entrar, `json: true` no registry já está posto.

Nenhuma decisão é estrutural/irreversível → **sem ADR** (consistente com a spec).

## 6. Dependências

- **Spec `cli-intuitiva-v1` (SPEC-043, PR #61)** — branch empilhada. Usa `forja setup` (AC-4
  passo 1) e os campos `tier`/`next`/`readonly`/`json` do registry. Se #61 renomear algo, ajustar.
- **Pacotes npm**: nenhum novo. SQLite via `better-sqlite3` já presente.
- **Migrações**: nenhuma.

## 7. Rollout

- [ ] Feature flag: não. Comandos novos, aditivos.
- [ ] Migração de dados: não.
- [ ] Doc/persona: `README.md` (linha do caminho padrão), `docs/cli-first-operacao.md` (bloco
      "Descoberta pela própria CLI" ganha `forja status`/`forja next`), `docs/quick-reference.md`.
- [ ] `CHANGELOG.md`: `[Unreleased]` → Adicionado (`forja status`, `forja next`); Alterado
      (`orchestrate` no topo do bloco GSD do help).

## 8. Sinais de fracasso (kill criteria)

- A escada da AC-4 não converge para uma recomendação clara em estados reais do dogfooding (dois
  passos empatam, ou o passo 7 dispara com trabalho pendente) → simplificar para 3 níveis
  (bootstrap / corrida / specs) e aceitar "veja `forja status`" como fallback.
- Extrair `listSpecs`/`openHandoffs` do hook faz o SessionStart regredir (ordem de import,
  ciclo entre `lib/` e `scripts/`) → manter as cópias no hook e só **reusá-las** a partir de
  `lib/` no comando novo (duplicação tolerada, teste cobre as duas).
- `listRuns` por glob de `.context/` traz lixo (runs de projetos gerados misturados) → restringir
  ao `contextDir` do workspace resolvido e ignorar o resto.

## Evidências e estado real

| AC | Task | Verificação |
|---|---|---|
| AC-1 | T4 | `forja status` num workspace real mostra as 6 seções rotuladas |
| AC-2 | T4, T7 | `forja status --json` num WS vazio → 6 chaves + `status:"ok"`, subs `available:false` |
| AC-3 | T5 | `forja next` imprime 1 linha `→ forja …`; `--json` → `{action,command,reason}` |
| AC-4 | T3, T7 | testes de `recommendNext` cobrindo os 7 ramos |
| AC-5 | T6 | registry: `readonly:true`, sem gate `workspace`; `forja next` não altera estado |
| AC-6 | T6 | `forja help` mostra `status`/`next` no núcleo; `orchestrate` no topo do bloco GSD |
| AC-7 | T1, T2 | `hook-session-start` importa de `lib/specs-index` e `lib/handoffs-index`; teste do hook verde |
| AC-8 | T7 | `node --test test/forja-status.test.js` |
| AC-9 | T8 | bateria completa verde |

- **Hipótese, não medição**: os ganhos de §8 da spec dependem de instrumentação inexistente.
- **Contrato**: nenhuma mudança em comando existente. Se a lista/ordem do núcleo mudar entre plan
  e implementação, registrar aqui.
