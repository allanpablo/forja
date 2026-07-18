# Tasks: ts-migration

- **Spec**: ./spec.md
- **Plan**: ./plan.md
- **Status**: approved
- **Criado em**: 2026-07-18

> Decomposição executável. Cada task tem dono claro, critério de done e referência a arquivos.

Ordem das fases do plano §7. As Fases 0 e 1 (T1-T2) são o destravador de menor risco: provam a
arquitetura **sem** renomear nada. A renomeação (T3) só começa com elas verdes.

---

## T1 — Fase 0: on-ramp `checkJs`
- **Owner**: Worker
- **Estimativa**: M
- **Depende de**: —
- **Paths**: `tsconfig.json`, `lib/core/registry.mjs`, `package.json`, `.github/workflows/ci.yml`
- **Escopo**: liga o type-check sobre os `.mjs` atuais. **Nada é renomeado.** Mede o tamanho real
  do problema de tipos antes de comprometer a migração.
- **Done quando**:
  - [ ] `tsconfig.json`: `allowJs, checkJs, strict, noEmit, module/moduleResolution` nodenext
  - [ ] `typescript` em `devDependencies` (≥ 5.7, por D6)
  - [ ] `types:check` no registry (`tsc --noEmit`) e como step do CI
  - [ ] Os erros de tipo apontados são **corrigidos com os arquivos ainda `.mjs`** (ou anotados com
        `@ts-expect-error` pontual se `strict` for poço sem fundo — kill criteria §8)
  - [ ] `npm test` verde, `types:check` verde

## T2 — Fase 1: resolver extension-agnostic
- **Owner**: Worker
- **Estimativa**: M
- **Depende de**: T1
- **Paths**: `lib/core/registry.mjs`, `bin/forja.mjs`, `lib/core/release.mjs`, `test/forja-core.test.js`
- **Escopo**: a **única** mudança de comportamento da migração, isolada e **ainda em `.mjs`**. Se
  algo quebrar aqui, é o resolver — não a renomeação.
- **Done quando**:
  - [ ] Registry: `node:` sem extensão (`scripts/tools-doctor`, não `.mjs`) — D2
  - [ ] Dispatch (`bin/forja.mjs`): resolve `cmd.node` tentando `.ts → .js → .mjs`, a 1ª que existe
  - [ ] `registry-scripts` (release.mjs) resolve extension-agnostic também — hoje casa a extensão
  - [ ] `smoke-commands` (release.mjs) usa o campo `bin` do package.json, não path fixo — D7
  - [ ] Teste: um comando roda com o registry sem extensão; `test/forja-core.test.js` verde
  - [ ] `npm test` + `tools:doctor` + `release:check` verdes

## T3 — Fase 2: renomear leaf-first
- **Owner**: Worker
- **Estimativa**: G
- **Depende de**: T2
- **Paths**: `lib/`, `scripts/`, `bin/`, `.claude/settings.json`
- **Escopo**: renomear `.mjs/.js → .ts` na ordem de dependência, **verde a cada arquivo**. Migração
  de tipos, não de lógica: nenhum teste muda de semântica (a rede de segurança, AC-7).
- **Ordem** (D5): `workspace → checks → registry → doc-graph → health → release → scripts/* → hooks
  → bin/forja → generators`.
- **Done quando**:
  - [ ] Cada módulo renomeado com imports `./x.ts` (D6); `npm test` verde após cada um
  - [ ] `Check`/`Probe`/`Result`/`Env`/`Command` e o handoff de 7 campos viram tipos reais (AC-4)
  - [ ] Hooks do `.claude/settings.json` apontam para `.ts` (dev roda nativo)
  - [ ] Geradores: assinatura tipada; o conteúdo template-string permanece string
  - [ ] Ao final: `npm test`, `tools:doctor`, `spec:check` verdes; nenhum `.mjs`/`.js` de código
        remanescente em `lib`/`scripts`/`bin`

## T4 — Fase 3: build + dist + build-fresh
- **Owner**: Worker
- **Estimativa**: M
- **Depende de**: T3
- **Paths**: `tsconfig.json`, `package.json`, `lib/core/release.ts`, `.gitignore`, CI
- **Done quando**:
  - [ ] `tsconfig`: `outDir: dist`, `rootDir: .`, `declaration: true`, `rewriteRelativeImportExtensions`
  - [ ] `scripts.build` = `tsc`; `dist/` espelha a árvore (`dist/bin`, `dist/lib`, `dist/scripts`)
  - [ ] `package.json`: `bin`/`main`/`types`/`exports` → `dist/`; `files[]` troca código por `dist/`
  - [ ] **`build-fresh`** no `RELEASE_CHECKS` (D4): recompila num temp, faz diff com `dist/` commitado,
        reprova defasado com `fix: npm run build`
  - [ ] `prepublishOnly` = `npm run build && release:check -- --publish` (ordem, sem recursão — D7/ADR-0024)
  - [ ] Decidir e registrar: `dist/` versionado (commitado) vs gerado no publish. Se versionado, o
        `build-fresh` o guarda; se gerado, o `prepublishOnly` o produz. **Um ou outro, não os dois**
  - [ ] `release:check --publish` aprova; `npm publish --dry-run` monta o tarball com `dist/`

## T5 — ADR-0026 e docs
- **Owner**: SDD Architect + Worker
- **Estimativa**: P
- **Depende de**: T2, T4
- **Paths**: `memory/90-decisions/0026-*.md`, `docs/`, `CONTRIBUTING.md`, `CLAUDE.md`
- **Done quando**:
  - [ ] ADR-0026 registra D2 (registry sem extensão), D3 (runtime duplo) e D4 (`build-fresh`);
        referencia ADR-0021 (NFR "roda sem build" + classe "dist mente") e ADR-0024
  - [ ] `CONTRIBUTING`/`docs`: "dev roda `.ts` nativo (Node novo); publicado roda `dist/`"
  - [ ] `CLAUDE.md`: comando de dev atualizado se mudou (`node bin/forja.ts`)

## T6 — Prova final (Governance)
- **Owner**: Governance
- **Estimativa**: P
- **Depende de**: T4, T5
- **Done quando**:
  - [ ] `release:check --publish` aprova o tarball com `dist/` fresco
  - [ ] **Reintroduzir um `dist/` defasado** (editar `src`, não rebuildar) e confirmar que o
        `build-fresh` **reprova** — o gate que nunca viu a falha que promete pegar não está testado
  - [ ] O hook `SessionStart` roda **sem `dist/` e sem build** em dev (o NFR inegociável, medido)
  - [ ] `npm test`, `project:check`, `tools:doctor`, `gitleaks` verdes; spec → `done`

---

## Nota de sequência
As Fases 0-1 (T1-T2) podem ir num PR próprio — provam a arquitetura (checkJs + resolver) sem tocar
em extensão de arquivo, e são revertíveis com baixo custo. A renomeação (T3) é o commit grande; vale
PR separado. T4 (build/publish) é o de maior risco de release — vai por último, com o `build-fresh`
como rede.

## Handoffs entre agentes
Worker (T1-T4), SDD Architect (T5), Governance (T6). Handoff a cada fronteira via `forja agent:route`
— 7 campos (ADR-0005).
