# Plan: cli-intuitiva-v1

- **Spec**: ./spec.md
- **Status**: approved
- **Criado em**: 2026-09-07

> Como vamos construir o que a spec define. Sem código aqui — só estrutura e decisões.

## 1. Abordagem técnica

**Extend, não rewrite.** O registry (`lib/core/registry.ts`) é a fonte única declarativa; todos
os campos novos são **opcionais e aditivos** — nenhum comando existente muda. `bin/forja.ts`
ganha (a) um branch `help <cmd>` / `help --all` antes do dispatch, (b) `printHelp()` filtrando
por `tier`, (c) `suggest()` reescrita, (d) pré-validação de `args required` antes do `spawnSync`.
A classificação em 3 blocos vai para `lib/core/health.ts` (módulo já compartilhado por
`tools:doctor` e pelo hook SessionStart). O `--fix` **sai do doctor** para um comando novo
`forja setup` (D2), preservando o contrato "diagnostica e prescreve; não conserta" que o
cabeçalho de `scripts/tools-doctor.ts` declara explicitamente. Sem estado novo, sem migração,
sem dependência externa.

## 2. Módulos afetados

| Caminho | Mudança | Risco |
|---|---|---|
| `lib/core/registry.ts` | editar — tipo do comando ganha campos opcionais (`usage`, `args`, `examples`, `next`, `readonly`, `json`, `tier`, `spec`); preencher nos ~14 comandos do núcleo; mover `(SPEC-0XX)` de `desc` para `spec` | B |
| `bin/forja.ts` | editar — `printHelp()` filtra `tier:'core'` + rodapé; novo `printCommandHelp(name)`; branch `help <cmd>` e `help --all`; `suggest()` (substring + Levenshtein ≤2 no nome completo); pré-validação de `args required` → imprime `usage`, exit 1, sem spawn; toda msg de erro termina com `forja help <palpite>` | M |
| `lib/core/health.ts` | editar — cada check declara `bucket: 'blocking' \| 'first-run' \| 'optional'`; `runChecks`/helpers preservam; expor para os dois renderizadores | B |
| `scripts/tools-doctor.ts` | editar — `printCore`/`printTools` passam a agrupar por `bucket` com os 3 rótulos fixos; nenhuma flag `--fix` aqui | B |
| `scripts/hook-session-start.ts` | editar — reusar os mesmos 3 buckets no bloco `<framework-status>` (hoje concatena avisos crus) | B |
| `scripts/forja-setup.ts` | **criar** — executa a allowlist fixa (`workspace:init`, `sync:universal`) em ordem; sem `--yes` pede confirmação; stdin não-TTY sem `--yes` → aborta sem efeito; audita cada passo | B |
| `lib/core/registry.ts` | + entrada `setup` (domínio `workspace`, `tier:'core'`, `readonly:false`) | B |
| `test/forja-core.test.js` | editar — AC-8 (a/b/c) + retrocompat (comando sem campos novos continua resolvendo) | B |
| `docs/quick-reference.md` + `docs/cli-first-operacao.md` | editar — `help <cmd>`, `help --all`, `forja setup`; manter `docs-commands`/`commands-documented` verdes | B |

## 3. Diagrama de fluxo

```
forja <argv>
  ├─ argv[0] ∈ {help,--help,-h}
  │    ├─ + <cmd>   → printCommandHelp(cmd)          [AC-2]  (cmd inválido → suggest, exit 1)
  │    ├─ + --all   → printHelp(all=true)            [AC-3]  (saída atual)
  │    └─ (só)      → printHelp(all=false)           [AC-3]  só tier:core + rodapé "--all para N"
  ├─ COMMANDS[argv[0]] ausente
  │    └─ suggest(argv[0])  → "Comando desconhecido… Você quis dizer X? forja help X"  [AC-4]
  └─ COMMANDS[argv[0]] presente
       ├─ runGates() (inalterado)
       ├─ validateRequiredArgs(cmd, rest)            [AC-5]
       │     falta arg required → stderr = cmd.usage; exit 1; NÃO spawna
       └─ spawnSync(...) (inalterado)

forja setup [--yes]                                  [AC-6]
  └─ para step in [workspace:init, sync:universal]:  (allowlist fixa, hard-coded)
       --yes ausente & TTY      → pergunta [s/N]
       --yes ausente & não-TTY  → aborta, exit 1, nada executado
       → executa step, audita, segue

tools:doctor                                         [AC-7]
  └─ runChecks() → group by bucket → render:
       "Bloqueia o fluxo"        (blocking; falha → exit 1, como hoje)
       "Rotina de primeiro uso"  (first-run; ex.: workspace, memory-db — dica: forja setup)
       "Opcional (ferramentas)"  (optional; ADR-0018, nunca trava)
```

## 4. Contratos (API/CLI/Schema)

**Registry — campos opcionais adicionados ao tipo do comando** (todos `?`):

```ts
type CommandArg = { name: string; required: boolean; desc: string };
interface Command {
  domain: string; desc: string;                    // inalterados
  node?: string; bin?: string; capability?: string; args?: string[]; gates?: string[];  // inalterados
  usage?: string;            // ex.: "forja spec:new <slug>"
  cliArgs?: CommandArg[];     // args POSICIONAIS documentados (nome distinto de `args`, que é prefixo fixo do spawn)
  examples?: string[];       // cada um começa com "forja "
  next?: string[];           // comandos que costumam vir depois (nomes do registry)
  spec?: string;             // "SPEC-021" — antes embutido em `desc`
  readonly?: boolean;
  json?: boolean;            // reservado p/ W5; nesta spec só declarado, não validado
  tier?: 'core' | 'advanced';  // ausente ⇒ 'advanced'
}
```

> Nota: o campo de args posicionais chama-se **`cliArgs`** para não colidir com `args` (hoje =
> prefixo fixo repassado ao script, ex.: `['new']`). AC-1/AC-5 da spec falam em `args` — registrar
> essa renomeação na spec (§Evidências).

**`forja help <cmd>`** — texto legível, exit 0; `<cmd>` inexistente → mesma saída de "comando
desconhecido", exit 1. Sem `--json` nesta spec.

**`forja setup [--yes]`** — exit 0 se todos os steps ok; 1 se abortado ou um step falhou. Ordem
fixa, allowlist fixa no código (não configurável).

**`suggest(input: string): string[]`** — até 5 nomes, ordenados por (substring exato > distância
de edição). Determinística.

## 5. Decisões e alternativas

**D1 — Campos no registry declarativo, não um arquivo de help à parte.**
Rejeitado: `docs/commands/*.md` por comando (duplica a fonte, drift garantido); gerar help de
JSDoc dos scripts (frágil, cada script é um processo separado). O registry já é a fonte única e
já tem teste de integridade (`forja-core.test.js`).

**D2 — `--fix` vira `forja setup`, o doctor continua só diagnóstico.**
`scripts/tools-doctor.ts` declara no cabeçalho que **não conserta** por desenho ("rodar coisas
sem consentimento é a classe de risco oposta à que este comando existe para fechar"). Em vez de
violar isso, um comando dedicado `forja setup` roda a rotina de primeiro uso, e o bloco "Rotina
de primeiro uso" do doctor **aponta** para ele. Alternativa rejeitada: `tools:doctor --fix` com
confirmação — funcionaria, mas ergue a exceção "às vezes o doctor executa" que o cabeçalho pede
para nunca existir. **Impacto na spec**: AC-6 muda de `tools:doctor --fix` para `forja setup`;
AC-7 (blocos rotulados) fica; registrar em §Evidências da spec.

**D3 — Levenshtein pequeno inline, sem dependência.**
~15 linhas de DP. Rejeitado: pacote `fastest-levenshtein` (dependência nova p/ 15 linhas);
`didyoumean2`. Limite de distância ≤ 2 e teto de 5 sugestões evitam ruído (risco da spec §7).

**D4 — "Núcleo" = 14 comandos (proposta da spec §5), fechada aqui.**
Mantidos os 14. Revisão: incluir `orchestrate:advance` (fluxo) — sim; `project:new` fica
(entrada de quem gera projeto); `engineer` fica (façade recomendada). `tier` é 1 linha por
comando — ajustável a qualquer momento, sem migração.

Nenhuma decisão é estrutural/irreversível → **sem ADR** (consistente com a spec).

## 6. Dependências

- **Outras specs**: nenhuma bloqueia. `W5` (contrato `--json`) e `W6` (cobertura MCP) vão
  **reusar** `cliArgs`/`usage`/`json` — este plan os deixa prontos, não os consome.
- **Pacotes npm**: nenhum novo.
- **Migrações de dado/memory**: nenhuma.

## 7. Rollout

- [ ] Feature flag: não. Mudanças aditivas; `forja help --all` preserva a saída atual.
- [ ] Migração de dados: não.
- [ ] Doc/persona impactada: `docs/quick-reference.md`, `docs/cli-first-operacao.md`,
      `DOC-MAP.md` (linha para `forja setup`). Personas developer/executive só ganham atalho.
- [ ] `CHANGELOG.md`: entrada em "Adicionado" (`forja help <cmd>`, `forja setup`, help em camadas)
      e "Alterado" (saída de `tools:doctor` em 3 blocos — aditivo).

## 8. Sinais de fracasso (kill criteria)

- Manter `usage`/`examples` dos 14 do núcleo já gera drift entre texto e comportamento real na
  primeira semana (AC-8b não segura) → repensar: gerar `usage` a partir de `cliArgs` em vez de
  string livre.
- `suggest()` fuzzy produz sugestão pior que o prefixo atual em casos reais de typo → reverter só
  o algoritmo, manter o resto.
- Reclassificar os checks em 3 buckets exige tocar a lógica de `runChecks`/exit-code e arrisca o
  gate de `tools:doctor` (que é `exit 1` real) → congelar AC-7, entregar AC-1..AC-6 e AC-8.

## Evidências e estado real

| AC | Task (a decompor em `spec:tasks`) | Verificação |
|---|---|---|
| AC-1 | Campos opcionais no tipo + retrocompat | `tsc --noEmit`; teste "comando sem campos novos resolve" |
| AC-2 | `printCommandHelp` + branch `help <cmd>` | `forja help spec:new` mostra usage+exemplo; `forja help xpto` → exit 1 |
| AC-3 | `printHelp(all?)` + `tier` nos 14 | `forja help` só núcleo + rodapé; `forja help --all` == saída atual (snapshot) |
| AC-4 | `suggest()` + mensagens de erro | teste `suggest('plan')` ∋ `spec:plan`; `forja plan` → stderr com `forja help spec:plan` |
| AC-5 | `validateRequiredArgs` antes do spawn | `forja spec:new` (sem slug) → usage, exit 1, sem stack trace |
| AC-6 | `scripts/forja-setup.ts` + entrada no registry | `forja setup --yes` em clone limpo cria workspace + indexa; sem TTY e sem `--yes` → aborta |
| AC-7 | `bucket` em `health.ts` + render nos 2 consumidores | `tools:doctor` mostra os 3 rótulos; `hook-session-start` idem |
| AC-8 | Testes em `forja-core.test.js` | `node --test test/forja-core.test.js` verde |
| AC-9 | — | `node --test test/*.test.js`, `tsc --noEmit`, `forja spec:check` verdes |

- **Mudança de contrato vs. spec** (registrar na spec ao passar para `implementing`): (1) AC-6
  `tools:doctor --fix` → `forja setup` (D2); (2) o campo de args posicionais chama-se `cliArgs`,
  não `args` (D1/§4).
- **Hipótese, não medição**: os ganhos de §8 da spec dependem de instrumentação inexistente;
  baseline sobre `forja-runs.jsonl` antes de qualquer número.
- **Bug lateral** (herdado da spec, não resolvido aqui): alocação de ID do `spec:new` — fora de escopo.
