# Tasks: doctor-do-nucleo

- **Spec**: ./spec.md
- **Plan**: ./plan.md
- **Status**: done
- **Criado em**: 2026-07-13

> Decomposição executável. Cada task tem dono claro, critério de done e referência a arquivos.

Convenção de IDs: `T1`, `T2`, … A sequência reflete a **ordem de merge do plano §7**: a lib e os
testes primeiro (nada a consome ainda), depois as superfícies, e o hook por último — é o de maior
risco e o único que roda em toda sessão.

---

## T1 — Runner e contrato de `lib/core/health.mjs`
- **Owner**: Worker
- **Estimativa**: M
- **Depende de**: —
- **Paths**: `lib/core/health.mjs`, `test/health.test.js`
- **Escopo**: o esqueleto sem nenhum probe real — `CHECKS[]` vazio ou com um probe de fixture.
- **Done quando**:
  - [x] `runChecks({ scope, env })` e `worstStatus(results)` exportados conforme plano §4 (AC-1)
  - [x] Cascata: check com `dependsOn` que falhou é reportado `skipped`, nunca `fail`
  - [x] Runner blinda o probe: probe que **lança** vira `fail` com o erro no `detail`, e o runner
        continua os demais — nunca propaga exceção (NFR de resiliência)
  - [x] `worstStatus` só devolve `fail` para `critical`; `warn` nunca escala
  - [x] `env` injetável (`{ root, importModule, fs, workspace }`) com default real (D5)
  - [x] `test/health.test.js` cobre cascata, blindagem e `worstStatus` com probes de fixture
  - [x] Zero dependências novas (plano §6)

## T2 — Probes de memória: `native-abi`, `memory-db`, `memory-fresh`
- **Owner**: Worker
- **Estimativa**: M
- **Depende de**: T1
- **Paths**: `lib/core/health.mjs`, `test/health.test.js`
- **Escopo**: os três checks que teriam pego a quebra de hoje. É o núcleo do núcleo.
- **Done quando**:
  - [x] `native-abi` (critical) classifica por `err.code`, **não** por string de mensagem (risco da
        spec): `ERR_DLOPEN_FAILED` → `npm rebuild better-sqlite3`; `ERR_MODULE_NOT_FOUND` →
        `npm install` (AC-3)
  - [x] `memory-db` (critical, `dependsOn: native-abi`) distingue **ausente** de **inacessível**,
        cada um com sua correção (AC-4)
  - [x] `memory-fresh` (**warn**, `dependsOn: memory-db`): `memory/` alterado depois do último sync
        → `npm run sync:universal`. Reaproveita a lógica de `newestMemoryMtime` que hoje vive no
        hook (AC-4)
  - [x] Teste do ABI quebrado injeta `env.importModule` que lança `ERR_DLOPEN_FAILED` — sem mock de
        módulo, sem corromper `node_modules` (D5)
  - [x] Cada probe testado nos dois estados: são e quebrado (AC-9)

## T3 — Probes de ambiente: `workspace`, `node-engines`
- **Owner**: Worker
- **Estimativa**: P
- **Depende de**: T1
- **Paths**: `lib/core/health.mjs`, `test/health.test.js`
- **Done quando**:
  - [x] `workspace` (**warn**, D4) usa `getWorkspaceInfo()` de `lib/workspace.mjs`; se não resolve
        para diretório existente → `npm run workspace:init`. Reporta também a **origem** da
        resolução (`FORJA_WORKSPACE` / `~/.forjarc.json` / default), que é metade do diagnóstico
        quando o workspace certo existe mas não é o que está sendo usado (AC-5)
  - [x] `node-engines` (**warn**) compara `process.versions.node` com `engines.node` do
        `package.json`
  - [x] Ambos testados nos dois estados via `env.fs` / `env.workspace` injetados

## T4 — Probes de regressão do repo: `runtime-deps`, `mcp-json`
- **Owner**: Worker
- **Estimativa**: M
- **Depende de**: T1
- **Paths**: `lib/core/health.mjs`, `test/health.test.js`
- **Escopo**: converte em gate executável os dois invariantes que o ADR-0021 corrigiu à mão e que
  hoje podem reincidir sem que nada perceba.
- **Done quando**:
  - [x] Ambos com `scope: 'repo'` — **não** rodam fora do repo do framework, onde produziriam falso
        positivo crítico na máquina do usuário final (D3). Detecção: `.git` + `package.json` com
        `name: forjajs`
  - [x] `runtime-deps` (critical): todo módulo importado **estaticamente** por script sob `files[]`
        está em `dependencies`, não em `devDependencies` (AC-6). Parser **conservador**: import
        dinâmico ou não resolvido → `warn`, nunca `fail` (risco da spec)
  - [x] `mcp-json` (critical): nenhum path absoluto versionado em `.mcp.json` (AC-7)
  - [x] Teste com fixture de `package.json`/`.mcp.json` quebrados, via `env.fs` e `env.root`
  - [x] Teste garantindo que ambos são `skipped` quando `scope: 'runtime'`

## T5 — `tools:doctor` consome a lib e vira gate
- **Owner**: Worker
- **Estimativa**: M
- **Depende de**: T2, T3, T4
- **Paths**: `scripts/tools-doctor.mjs`
- **Done quando**:
  - [x] Duas seções na saída: **Núcleo** e **Ferramentas** (AC-2)
  - [x] `exit 1` **se e somente se** algum check `critical` do núcleo falhar. Ferramenta opcional
        ausente segue `exit 0` — contrato do ADR-0018 preservado (AC-2, D4)
  - [x] `TOOLS[]` das cinco ferramentas opcionais permanece intocado (spec §5, fora de escopo)
  - [x] Cada falha imprime o comando de correção ao lado
  - [x] Roda em < 2s (NFR)
  - [x] Funciona **sem `node_modules`** — é justamente aí que ele mais importa (NFR)

## T6 — `SessionStart` consome a lib e perde a heurística própria
- **Owner**: Worker
- **Estimativa**: M
- **Depende de**: T2, T3
- **Paths**: `scripts/hook-session-start.mjs`
- **Escopo**: a task de maior risco. O hook roda em toda sessão e o ADR-0021 o marcou como "nunca
  pode derrubar a sessão".
- **Done quando**:
  - [x] `resolveDbPath()` e `staleIndex()` **deixam de existir** — o `catch { return null }` que
        colapsa três causas distintas é a raiz do problema (plano §1)
  - [x] A prescrição errada (`npm install` para ABI quebrado, linha 91) não existe mais no código
        (AC-8)
  - [x] Chama `runChecks({ scope: 'runtime' })` — zero heurística própria (AC-8)
  - [x] **Sempre `exit 0`**: o hook reporta, nunca trava a sessão (ADR-0021)
  - [x] Cabe com folga no timeout de 5s; se não couber, ver kill criteria do plano §8
  - [x] `test/hooks.test.js` estendido: sem `node_modules` o hook degrada, não estoura

## T7 — ADR-0023
- **Owner**: SDD Architect
- **Estimativa**: P
- **Depende de**: T5, T6
- **Paths**: `memory/90-decisions/0023-doctor-como-gate-do-nucleo.md`
- **Done quando**:
  - [x] Registra D1 (checks como dados), D3 (`scope` repo/runtime) e a mudança de contrato do exit
        code (AC-10)
  - [x] Referencia ADR-0018 (que estende) e ADR-0021 (a classe de falha que fecha)
  - [x] Segue `memory/90-decisions/_template.md`

## T8 — Registry e documentação
- **Owner**: Worker
- **Estimativa**: P
- **Depende de**: T5
- **Paths**: `lib/core/registry.mjs`, `CLAUDE.md`, `docs/`
- **Done quando**:
  - [x] `desc` do `tools:doctor` no registry reflete o novo papel (deixa de ser só "ferramentas de
        processo")
  - [x] `CLAUDE.md` e `docs/` onde o comando é descrito como "raio-x de ferramentas"
  - [x] `npm test` verde, incluindo `test/forja-core.test.js` (integridade do registry, ADR-0020)

## T9 — Validação no cenário real
- **Owner**: Governance
- **Estimativa**: P
- **Depende de**: T5, T6, T7, T8
- **Paths**: —
- **Done quando**:
  - [x] `tools:doctor` roda sob um Node de **major diferente** e reporta o ABI quebrado com a
        prescrição certa. Um doctor de ABI que nunca viu um ABI quebrado não está testado, está
        escrito (plano §7)
  - [x] `npm run project:check` e `npm test` verdes
  - [x] `gitleaks detect --no-banner` limpo
  - [x] Suíte completa verde (AC-9); spec → `done`

## T10 — `spec:new` mantém a allow-list do `.gitignore`
- **Owner**: Worker
- **Estimativa**: P
- **Depende de**: —  *(independente da lib; pode ir primeiro)*
- **Paths**: `scripts/spec-cli.mjs`, `test/spec-cli.test.js`
- **Contexto**: descoberto ao escrever o plano. O `.gitignore` ignora `/specs/*` e mantém uma
  allow-list manual; **toda spec nova do framework nasce invisível ao git**. Aconteceu com esta
  própria spec. Emenda de 2026-07-13 à spec (AC-11).
- **Done quando**:
  - [x] `spec:new <slug>` acrescenta `!/specs/<slug>` ao bloco de allow-list do `.gitignore`
  - [x] **Idempotente**: rodar duas vezes não duplica a linha
  - [x] Insere **dentro do bloco existente** (após a última `!/specs/…`), não no fim do arquivo —
        as regras seguintes do `.gitignore` dependem da ordem
  - [x] Se o bloco não existir (ou o `.gitignore` sumir), **não falha** a criação da spec: avisa e
        segue. Criar spec é o trabalho; manter o gitignore é o efeito colateral
  - [x] Teste: cria spec num `.gitignore` de fixture e verifica a linha, a idempotência e a posição
  - [x] `git status` mostra a spec recém-criada, sem passo manual (AC-11)

---

## Handoffs entre agentes

Este conjunto atravessa Worker (T1-T6, T8, T10), SDD Architect (T7) e Governance (T9). Registrar
handoff a cada fronteira via `npm run agent:route` — 7 campos obrigatórios (ADR-0005).
