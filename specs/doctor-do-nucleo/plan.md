# Plan: doctor-do-nucleo

- **Spec**: ./spec.md
- **Status**: done
- **Criado em**: 2026-07-13

> Como vamos construir o que a spec define. Sem código aqui — só estrutura e decisões.

## 1. Abordagem técnica

**Extend, não rewrite.** O `tools-doctor.mjs` já tem a forma certa — uma lista declarativa
(`TOOLS[]`) percorrida por um runner burro. Erramos no *conteúdo* da lista, não na estrutura.

Extraímos os checks para `lib/core/health.mjs` como **dados** (`CHECKS[]`), com um runner que os
executa e devolve resultados estruturados. O `tools-doctor` vira uma das três superfícies de
apresentação; `SessionStart` vira outra. Nenhuma superfície tem heurística própria — é justamente
isso que permitiu, hoje, uma delas prescrever a correção errada sozinha.

A mudança central de comportamento é **parar de colapsar causas distintas num booleano**. Hoje
`hook-session-start.mjs:38-45` faz `catch { return null }`, engolindo *sem `node_modules`*,
*ABI incompatível* e *banco ausente* no mesmo `null` — e a linha 91 prescreve a correção de apenas
uma das três. Cada probe passa a **classificar a causa** e devolver a correção dela.

## 2. Módulos afetados

| Caminho | Mudança | Risco |
|---|---|---|
| `lib/core/health.mjs` | **criar** — `CHECKS[]` + runner. Fonte única de verdade | M |
| `scripts/tools-doctor.mjs` | editar — consome a lib; ganha seção Núcleo + exit code | M |
| `scripts/hook-session-start.mjs` | editar — remove heurística própria (`resolveDbPath`, `staleIndex`) e a prescrição errada | A |
| `lib/core/registry.mjs` | editar — `desc` do `tools:doctor` reflete o novo papel | B |
| `scripts/spec-cli.mjs` | editar — `spec:new` mantém a allow-list do `.gitignore` (AC-11) | B |
| `test/health.test.js` | **criar** — cada check nos dois estados | B |
| `memory/90-decisions/0023-doctor-como-gate-do-nucleo.md` | **criar** — ADR | B |
| `CLAUDE.md`, `docs/` | editar — `tools:doctor` deixa de ser "raio-x de ferramentas" | B |

Risco alto no hook: ele roda em **toda** sessão e o ADR-0021 já o marcou como "nunca pode derrubar
a sessão". Qualquer regressão ali é sentida imediatamente e em todo lugar.

## 3. Diagrama de fluxo

```
  tools:doctor ────┐
  SessionStart ────┼──►  lib/core/health.mjs :: runChecks({ scope })
  release-auditor ─┘                    │
                                        ▼
          ┌──────────────── CHECKS[] (declarativo) ────────────────┐
          │ id             severity  scope    dependsOn            │
          │ native-abi     critical  runtime  —                    │
          │ memory-db      critical  runtime  native-abi           │
          │ memory-fresh   warn      runtime  memory-db            │
          │ workspace      warn      runtime  —                    │
          │ node-engines   warn      runtime  —                    │
          │ runtime-deps   critical  repo     —                    │
          │ mcp-json       critical  repo     —                    │
          └────────────────────────────────────────────────────────┘
                                        │
                     Result[] { id, status, detail, fix, severity }
                                        │
                    ┌───────────────────┴───────────────────┐
                    ▼                                       ▼
        doctor: 2 seções + exit(1) se           hook: só scope=runtime,
        algum critical falhou                   sempre exit(0), warn no contexto
```

**Cascata (`dependsOn`)** é o que evita o pior modo de falha de um diagnóstico: com o ABI quebrado,
`memory-db` e `memory-fresh` também falhariam, e o operador veria **três** erros sem saber qual é a
raiz. Um check cujo `dependsOn` falhou é reportado como `skipped`, não como `fail`. Uma causa, uma
linha vermelha, uma correção.

## 4. Contratos (API/CLI/Schema)

```js
// lib/core/health.mjs

/** @typedef {'critical'|'warn'} Severity */
/** @typedef {'runtime'|'repo'} Scope */
/** @typedef {'ok'|'warn'|'fail'|'skipped'} Status */
/** @typedef {{ id, title, severity: Severity, scope: Scope, dependsOn?: string, probe }} Check */
/** @typedef {{ id, title, severity, status: Status, detail: string, fix: string|null }} Result */

export const CHECKS;

/** Executa os checks. `scope: 'runtime'` roda só os baratos e portáveis (hook). */
export async function runChecks(opts);   // { scope = 'all', env } -> Promise<Result[]>

/** 'fail' se algum critical falhou; senão 'warn' se houver warn; senão 'ok'. */
export function worstStatus(results);    // -> 'ok' | 'warn' | 'fail'
```

O `probe` recebe um **ambiente injetável** (`env = { root, importModule, fs, workspace }`) e devolve
`{ status, detail, fix }`. Nunca lança: o runner o envolve em try/catch e converte exceção
inesperada em `fail` — um check que estoura ao diagnosticar é pior que check nenhum (NFR).

**CLI** — `tools:doctor` mantém nome e entrada no registry (ADR-0020). Muda o contrato de saída:

| Situação | Antes | Depois |
|---|---|---|
| Tudo são | `exit 0` | `exit 0` |
| Ferramenta opcional ausente | `exit 0` | `exit 0` *(ADR-0018 preservado)* |
| Índice defasado / workspace ausente | — | `exit 0` + aviso |
| **Núcleo quebrado** | `exit 0` | **`exit 1`** + correção |

## 5. Decisões e alternativas

**D1: Checks como dados, não como funções que imprimem.** Permite três superfícies com uma lógica
só. Alternativa rejeitada: cada superfície chama helpers e formata do seu jeito — é literalmente o
que temos hoje, e é a causa da divergência entre o que o doctor diz e o que o hook diz.

**D2: Probes classificam a causa; o runner nunca colapsa em booleano.** `ERR_DLOPEN_FAILED` →
`npm rebuild better-sqlite3`. `ERR_MODULE_NOT_FOUND` → `npm install`. Banco ausente →
`npm run sync:universal`. Alternativa rejeitada: manter `catch → null` e só melhorar o texto da
mensagem — daria uma prescrição *genérica*, e o problema de hoje foi precisamente uma prescrição
genérica aplicada a um caso específico.

**D3: `scope: repo | runtime`.** `runtime-deps` e `mcp-json` são checks de **regressão do
repositório** — não fazem sentido numa instalação `npm i -g forjajs`, onde não há `devDependencies`
instaladas nem `.mcp.json` versionado. Rodá-los fora do repo produziria falso positivo crítico no
ambiente do usuário final. Detecção: presença de `.git` + `package.json` com `name: forjajs`.

**D4: Só `critical` trava.** `workspace` ausente e `node-engines` abaixo do declarado entram como
`warn`, não `fail` — o framework funciona sem workspace (só `project:new` não). Um gate que reprova
o que não impede trabalho é um gate que se aprende a ignorar (risco nº 1 da spec).

**D5: Injeção de dependência no probe (`env`).** Testar ABI quebrada exigiria mockar o loader de
módulos do Node. Com `env.importModule` injetável, o teste passa uma função que lança
`ERR_DLOPEN_FAILED` e verifica a prescrição — sem mock de módulo, sem corromper `node_modules`.

**D6: Doctor diagnostica, não conserta.** Sem `--fix`. Rodar `npm rebuild` sem consentimento é a
classe de risco oposta à que estamos consertando (spec §5, fora de escopo).

D1, D3 e a mudança de contrato de exit code são estruturais → **ADR-0023**
(`memory/90-decisions/0023-doctor-como-gate-do-nucleo.md`), referenciando ADR-0018 (que ele estende)
e ADR-0021 (a classe de falha que ele fecha).

## 6. Dependências

- **Specs**: nenhuma. Fecha a classe do ADR-0021; não depende de spec aberta.
- **Pacotes npm**: **nenhum novo.** Tudo com `node:fs`, `node:path` e o `better-sqlite3` que já é
  `dependency`. Adicionar dependência a um módulo cujo propósito é funcionar quando as dependências
  quebram seria autodestrutivo.
- **Migrações**: nenhuma. Nada de schema, nada de dado.

## 7. Rollout

- [ ] Feature flag necessária? **Não.** A mudança é aditiva, exceto pelo exit code — que só passa a
      falhar em ambiente que **já está** quebrado.
- [ ] Migração de dados existentes? **Não.**
- [x] Doc/persona impactada? `CLAUDE.md` (tabela de comandos) e `docs/` onde `tools:doctor` é
      descrito como "raio-x de ferramentas". Persona **qa/governança** ganha gate novo.
- [ ] **Ordem de merge**: `lib/core/health.mjs` + testes primeiro (nada consome ainda), depois as
      superfícies. O hook por último — é o de maior risco e o único que roda sempre.
- [ ] Validar com `npm run tools:doctor` num Node de major diferente (o cenário de hoje) **antes**
      de fechar. Um doctor de ABI que nunca viu um ABI quebrado não está testado, está escrito.

## 8. Sinais de fracasso (kill criteria)

- **O hook fica lento ou instável.** Ele roda em toda sessão e não pode derrubá-la (ADR-0021). Se
  `runChecks({ scope: 'runtime' })` não couber com folga no timeout de 5s, o hook volta a ter
  caminho próprio (mínimo, ainda consumindo a lib) em vez de arrastarmos o custo para toda sessão.
- **`runtime-deps` vira ruído.** Se o parser estático de imports gerar falso positivo crítico mais
  de uma vez, ele é rebaixado a `warn` — a spec já prevê isso no risco, e um crítico que mente é
  pior que um warning honesto.
- **O operador passa a rodar `tools:doctor` já sabendo o resultado.** Se o gate vira ritual, erramos
  a calibragem de severidade e voltamos a D4.
