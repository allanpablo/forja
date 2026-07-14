# Tasks: release-gate

- **Spec**: ./spec.md
- **Plan**: ./plan.md
- **Status**: approved
- **Criado em**: 2026-07-14

> Decomposição executável. Cada task tem dono claro, critério de done e referência a arquivos.

Ordem do plano §7: refactor puro primeiro (nada muda de comportamento), depois o catálogo, depois
as superfícies. O `prepublishOnly` vai **por último** — é a única peça que, com falso positivo,
impede publicar qualquer coisa.

---

## T1 — Extrair o runner para `lib/core/checks.mjs`
- **Owner**: Worker
- **Estimativa**: P
- **Depende de**: —
- **Paths**: `lib/core/checks.mjs`, `lib/core/health.mjs`, `test/health.test.js`
- **Escopo**: refactor puro. Nenhum comportamento muda; a suíte existente é o teste.
- **Done quando**:
  - [ ] `runChecks` e `worstStatus` saem de `health.mjs` para `checks.mjs`, sem alteração de lógica
  - [ ] `health.mjs` **re-exporta** ambos — `tools-doctor` e `hook-session-start` não mudam uma linha
  - [ ] Os 36 testes de `test/health.test.js` passam **sem edição** (se precisarem mudar, não foi
        refactor puro — foi mudança de comportamento disfarçada)
  - [ ] Suíte completa verde

## T2 — `withCleanInstall`: empacotar e instalar isolado
- **Owner**: Worker
- **Estimativa**: M
- **Depende de**: T1
- **Paths**: `lib/core/release.mjs`, `test/release.test.js`
- **Escopo**: a fundação do gate. Sem instalação real, nada aqui prova nada (D2).
- **Done quando**:
  - [ ] `npm pack` → diretório temporário fora do repo; `npm init -y` + `npm i <tgz>`
  - [ ] **Isolamento**: sem herdar `NODE_PATH` nem o `node_modules` do repo. Um gate que enxerga o
        repo mente verde (NFR)
  - [ ] Limpa o temporário **sempre**, inclusive em erro (`finally`)
  - [ ] Teste: o diretório temporário some depois da execução, mesmo quando o callback lança

## T3 — Checks do tarball: `registry-scripts`, `imports-resolve`
- **Owner**: Worker
- **Estimativa**: M
- **Depende de**: T2
- **Paths**: `lib/core/release.mjs`, `test/release.test.js`
- **Done quando**:
  - [ ] `registry-scripts` (critical): todo comando do registry tem seu `node:` presente no tarball.
        Hoje são 41/41 — o gate torna permanente o que hoje é verdade acidental (AC-5)
  - [ ] `imports-resolve` (critical): todo import **relativo** de script publicado resolve dentro do
        tarball (AC-6)
  - [ ] **Template literals apagados antes do parse** (D3): os geradores contêm código NestJS que
        eles *escrevem*, não que executam. Sem isso o check acusa `./app.module` como quebrado —
        já observado em campo
  - [ ] Fixture: tarball com arquivo fora do `files[]` **reprova** (bug real da v1.1.3)

## T4 — Checks de dependência: `deps-declared`, `deps-unused`
- **Owner**: Worker
- **Estimativa**: M
- **Depende de**: T2
- **Paths**: `lib/core/release.mjs`, `test/release.test.js`
- **Done quando**:
  - [ ] `deps-declared` (critical): todo pacote importado por código sob `files[]` está em
        `dependencies` (AC-6)
  - [ ] `deps-unused` (**warn**, D7): `dependency` que ninguém importa é peso morto no tarball de
        todo usuário — incomoda, não quebra
  - [ ] Template literals apagados antes do parse, aqui também. Sem isso, `@nestjs/core` aparece
        como dependência não declarada
  - [ ] Fixture: `better-sqlite3` movido para `devDependencies` **reprova** (bug real do ADR-0021)

## T5 — `smoke-commands`: executar, não listar
- **Owner**: Worker
- **Estimativa**: M
- **Depende de**: T2
- **Paths**: `lib/core/release.mjs`, `test/release.test.js`
- **Escopo**: o check mais importante e o mais fácil de errar. O `forja` sem argumentos passa mesmo
  com tudo quebrado — o help não carrega os scripts. Foi assim que a quebra do ADR-0021 se escondeu.
- **Done quando**:
  - [ ] Executa comandos sem efeito colateral na instalação limpa: help, `tools:doctor`,
        `code:status`, `query:universal` (AC-4)
  - [ ] **Reprova por assinatura no stderr, nunca por exit code** (D8): `ERR_MODULE_NOT_FOUND`,
        `ERR_DLOPEN_FAILED`, `Cannot find module`. Numa instalação limpa não há workspace nem
        `universal.db`, então exit ≠ 0 é o pacote **funcionando** — reprovar ali seria repetir a
        armadilha do `memory-db` na SPEC-009
  - [ ] Teste: comando que sai ≠ 0 por falta de workspace **passa**; comando com
        `ERR_MODULE_NOT_FOUND` **reprova**

## T6 — `tree-clean` e os dois modos
- **Owner**: Worker
- **Estimativa**: P
- **Depende de**: T2
- **Paths**: `lib/core/release.mjs`, `test/release.test.js`
- **Done quando**:
  - [ ] `git status --short` com qualquer saída: `fail` sob `--publish`, `warn` sem ele (D4)
  - [ ] Roda **antes** de empacotar: auditar um tarball que não é o que será publicado é auditar
        ficção
  - [ ] **Reconferido ao final** (D5): a aprovação é perecível. Um `npm install` entre o check e o
        publish invalida tudo — foi exatamente a causa da v1.1.1
  - [ ] Fixture: árvore suja + `--publish` **reprova** (bug real da v1.1.1)

## T7 — `release:check` (CLI + registry)
- **Owner**: Worker
- **Estimativa**: P
- **Depende de**: T3, T4, T5, T6
- **Paths**: `scripts/release-check.mjs`, `lib/core/registry.mjs`, `package.json`
- **Done quando**:
  - [ ] Saída com o mesmo vocabulário do `tools:doctor` (OK/AVISO/FALHA + correção ao lado)
  - [ ] `exit 1` se e somente se algum `critical` falhar (AC-1)
  - [ ] Entrada no registry (ADR-0020); `test/forja-core.test.js` verde
  - [ ] Flag `--publish` documentada no help

## T8 — Endurecer `runtime-deps` (dívida do ADR-0023)
- **Owner**: Worker
- **Estimativa**: P
- **Depende de**: T1
- **Paths**: `lib/core/health.mjs`, `test/health.test.js`
- **Contexto**: o check que entregamos na SPEC-009 passa **por sorte**. Os geradores contêm
  `import { Module } from '@nestjs/common'` em template string; hoje não quebra porque `@nestjs/*`
  não está nas devDeps. No dia em que estiver, ele trava o gate com falso positivo crítico.
- **Done quando**:
  - [ ] Template literals apagados antes do parse, como em T3/T4 (AC-11)
  - [ ] Teste com um gerador contendo `import` de devDependency **dentro de crases**: não reprova
  - [ ] Teste com import real de devDependency fora de crases: continua reprovando

## T9 — CI: `tools:doctor` e `release:check` como steps
- **Owner**: Worker
- **Estimativa**: P
- **Depende de**: T7
- **Paths**: `.github/workflows/ci.yml`
- **Done quando**:
  - [ ] `tools:doctor` vira step (AC-9) — o gate do ADR-0023 existe e hoje **nada o executa**
  - [ ] `release:check` vira step. Roda uma vez (não na matriz inteira): o custo é o `npm i`
        compilando o `better-sqlite3` do zero, e três vezes não prova mais que uma
  - [ ] O CI verde vira a **evidência** do release, no log, em vez de na memória de quem publicou

## T10 — ADR-0024 e documentação
- **Owner**: SDD Architect
- **Estimativa**: P
- **Depende de**: T7
- **Paths**: `memory/90-decisions/0024-*.md`, `docs/publishing.md`, `CLAUDE.md`
- **Done quando**:
  - [ ] ADR-0024 registra D1 (runner extraído), D8 (stderr, não exit code) e D9 (`prepublishOnly`,
        nunca `prepack`), referenciando ADR-0023 e ADR-0021
  - [ ] Os três bugs históricos citados como evidência — são o argumento da decisão
  - [ ] `docs/publishing.md` passa a mandar rodar o gate, não a confiar no ritual

## T11 — `release-auditor` consome o gate
- **Owner**: Worker
- **Estimativa**: P
- **Depende de**: T7
- **Paths**: `.claude/agents/release-auditor.md`
- **Done quando**:
  - [ ] O agente **roda `release:check`** e interpreta o resultado, em vez de reimplementar o
        procedimento em prosa (AC-10)
  - [ ] Some o passo-a-passo manual de `npm pack`/`grep`: virou código, e código não esquece
  - [ ] Permanece o que só um agente faz: julgar o que o gate não sabe julgar, e recomendar

## T12 — `prepublishOnly` (por último)
- **Owner**: Governance
- **Estimativa**: P
- **Depende de**: T9 verde por um ciclo
- **Paths**: `package.json`
- **Escopo**: a peça de risco alto. Com falso positivo aqui, **ninguém publica nada**.
- **Done quando**:
  - [ ] `"prepublishOnly": "npm run release:check -- --publish"` (AC-8)
  - [ ] Comentário no `package.json`: **nunca** amarrar ao `prepack` — o gate roda `npm pack`, e
        isso seria recursão infinita (D9)
  - [ ] Validado com `npm publish --dry-run`
  - [ ] Só entra **depois** de o gate rodar verde no CI por um ciclo (plano §7)

---

## Validação final (Governance)
- [ ] Os **três bugs históricos**, reintroduzidos um a um, reprovam o gate: `better-sqlite3` em
      devDeps (ADR-0021), arquivo fora do `files[]` (v1.1.3), árvore suja no publish (v1.1.1).
      Um gate que nunca viu a falha que promete pegar não está testado — está escrito.
- [ ] `npm test`, `project:check`, `tools:doctor` e `gitleaks` verdes
- [ ] Suíte completa verde; spec → `done`

## Handoffs entre agentes

Worker (T1-T9, T11), SDD Architect (T10), Governance (T12 + validação). Handoff a cada fronteira
via `npm run agent:route` — 7 campos (ADR-0005).
