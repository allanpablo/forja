# Plan: ts-migration

- **Spec**: ./spec.md
- **Status**: approved
- **Criado em**: 2026-07-18

> Como vamos construir o que a spec define. Sem código aqui — só estrutura e decisões.

## 1. Abordagem técnica

O nó da migração não é renomear `.mjs → .ts` — é **como o core acha o script de um comando em dois
runtimes**. Hoje `bin/forja.mjs:118` faz `spawnSync('node', [path.join(root, cmd.node)])`, e o
registry guarda a extensão literal (`scripts/tools-doctor.mjs`). Em dev o alvo é `.ts`; no pacote
publicado é `dist/scripts/tools-doctor.js`. O mesmo registry não pode cravar as duas.

A saída é **desacoplar o registry da extensão**: a entrada passa a ser `scripts/tools-doctor` (sem
extensão), e o core resolve o arquivo real tentando `.ts → .js → .mjs` conforme o que existe. Em dev
acha o `.ts`; no publicado acha o `.js` sob `dist/`. Isso resolve o runtime duplo com uma mudança
pequena e contida, e ainda limpa o registry.

Tudo o mais é disciplina: `checkJs` primeiro para achar os erros de tipo com os arquivos ainda
rodando como `.mjs`, depois renomear **leaf-first** com a suíte verde a cada passo. A rede de
segurança é que a migração não muda semântica — se os 109 testes passam sem edição de lógica, a
renomeação não quebrou nada.

## 2. Módulos afetados

| Caminho | Mudança | Risco |
|---|---|---|
| `tsconfig.json` | **criar** — `checkJs` on-ramp, depois `outDir: dist`, `.d.ts` | M |
| `lib/core/registry.mjs` → `.ts` | `node:` sem extensão; tipos `Command`/`Domain` | **A** |
| `bin/forja.mjs` → `.ts` | resolver extension-agnostic (`.ts→.js→.mjs`) no dispatch | **A** |
| `lib/core/checks.mjs` → `.ts` | `Check`/`Probe`/`Result`/`Env` viram tipos reais | M |
| `lib/core/{health,release,doc-graph,workspace}.mjs` → `.ts` | tipam contra `checks.ts` | M |
| `lib/core/release` | `build-fresh` novo; `smoke-commands` usa o `bin` do package.json, não path fixo | M |
| `scripts/*.{mjs,js}` → `.ts` | ~20 arquivos, leaf-first; hooks incluídos | M |
| `lib/generators/*.js` → `.ts` | tipa a assinatura; o **conteúdo** (template string) fica string | B |
| `package.json` | `main`/`types`/`exports`/`bin` → `dist/`; `build`; `files[]` dist; `prepublishOnly` | **A** |
| `.claude/settings.json` | hooks → `.ts` (dev roda nativo) | B |
| `.github/workflows/ci.yml` | steps `types:check` e `build` | B |
| `memory/90-decisions/0026-*.md` | **criar** — ADR | B |

Os três `A` são o registry, o dispatch e o `package.json` — a tríade que decide se o comando roda
nos dois runtimes. Tudo passa por eles.

## 3. Diagrama de fluxo

```
  DEV (Node 26, sem build)            PUBLICADO (Node >=20, dist/)
  ──────────────────────             ────────────────────────────
  node bin/forja.ts                   forja → dist/bin/forja.js
        │                                   │
        │ registry: 'scripts/tools-doctor'  │ (mesma entrada, sem extensão)
        ▼                                   ▼
  resolve('<root>/scripts/tools-doctor')
     tenta .ts → .js → .mjs
        │  dev: acha .ts                    │  publicado: root=dist/, acha dist/scripts/tools-doctor.js
        ▼                                   ▼
  spawn node <arquivo resolvido>      spawn node <arquivo resolvido>

  build (só p/ publicar):  tsc  rootDir=.  outDir=dist   →   dist/ espelha a árvore
  build-fresh (release:check):  recompila e compara com dist/ commitado → reprova se difere
```

## 4. Contratos (API/CLI/Schema)

```ts
// lib/core/registry.ts
export interface Command {
  domain: string;
  desc: string;
  node?: string;   // caminho SEM extensão, relativo à raiz (dev) / a dist/ (publicado)
  bin?: string;
  args?: string[];
}
export const COMMANDS: Record<string, Command>;

// lib/core/checks.ts — os contratos que hoje são @typedef viram tipos verificados
export type Severity = 'critical' | 'warn';
export type Status = 'ok' | 'warn' | 'fail' | 'skipped';
export interface Probe { status: Status; detail: string; fix?: string | null; }
export interface Check { id: string; title: string; severity: Severity; scope?: string;
  dependsOn?: string; probe: (env: Env) => Probe | Promise<Probe>; }
```

**Resolução de script (o coração)** — `bin/forja.ts` calcula `root = dirname(selfPath)/..`
(dev: repo; publicado: `dist/`) e resolve `cmd.node` tentando as extensões na ordem `.ts, .js,
.mjs`. A primeira que existe vence. Sem extensão no registry, sem `if (isDev)`.

**`package.json`**:

| Campo | Valor |
|---|---|
| `bin.forja` | `dist/bin/forja.js` |
| `main` / `types` | `dist/lib/index.js` / `.d.ts` |
| `files[]` | troca `bin/ lib/ scripts/` por `dist/` (o resto — memory/, docs/, boilerplates/ — fica) |
| `scripts.build` | `tsc` |
| `scripts.prepublishOnly` | `npm run build && node bin/forja.ts release:check -- --publish` |

## 5. Decisões e alternativas

**D1: Layout plano, `dist/` espelha a árvore.** `tsc rootDir=. outDir=dist` → `dist/bin`,
`dist/lib`, `dist/scripts`. Alternativa rejeitada: mover a fonte para `src/`. Isso trocaria todo
import, todo path do registry, os hooks do `settings.json`, o `files[]` e as smoke-commands do
release — blast radius enorme, contra o "verde contínuo". O layout plano mantém a migração mecânica.

**D2: Registry sem extensão + resolver (o coração).** `node: 'scripts/tools-doctor'`; o core tenta
`.ts→.js→.mjs`. Desacopla o registry do runtime e limpa a entrada. Alternativa rejeitada: guardar
`.js` e exigir build em dev — mata o "roda sem build" (o NFR inegociável). Alternativa rejeitada:
dois registries — é como se chega a duas verdades divergentes, o defeito que a SPEC-009 matou.

**D3: Runtime duplo.** Dev roda `.ts` nativo (confirmado: Node 26 executa `.ts` e `node --test`
roda `.ts`); publicado roda `dist/.js`. `engines.node` fica `>=20` — por isso publicamos compilado.
O usuário final não é obrigado a Node novo; o dev sim.

**D4: `build-fresh` no `RELEASE_CHECKS`.** Sem ele, a migração reintroduz a classe do ADR-0021: um
`dist/` que mente sobre o `src/`. O gate recompila num temp e faz diff com o `dist/` commitado;
diferente → reprova com `npm run build`. É o `memory-fresh`, um nível abaixo.

**D5: `checkJs` antes de renomear; leaf-first depois.** Ordem por dependência:
`workspace → checks → registry → doc-graph → health/release → scripts → hooks → bin → generators`.
Verde a cada arquivo. Alternativa rejeitada: renomear tudo e consertar no fim — big-bang, sinal sujo.

**D6: `tsc` com `rewriteRelativeImportExtensions` (TS 5.7+).** A fonte importa `./x.ts`; o `tsc`
reescreve para `./x.js` no emit. É o mecanismo oficial para fonte-`.ts`-roda-nativo + build. Sem
ele, os imports estáticos não resolveriam nos dois mundos.

**D7: `smoke-commands` do release usa o `bin` do package.json.** Hoje ele monta
`path.join(pkgDir, 'bin', 'forja.mjs')` — quebraria com `dist/bin/forja.js`. Passa a ler o campo
`bin`. Correção de robustez que a migração torna obrigatória.

D2, D3 e D4 são estruturais → **ADR-0026**, referenciando ADR-0021 (o NFR "roda sem build" e a
classe "dist mente") e ADR-0024 (o gate que ganha o `build-fresh`).

## 6. Dependências

- **Specs**: SPEC-011 (o catálogo de doc-graph já na main — migra junto). Já `done`.
- **Pacotes npm**: `typescript` como **devDependency** (≥ 5.7, por D6). Zero dependência de runtime
  nova — o publicado segue só com `better-sqlite3`.
- **Migrações de dado**: nenhuma.

## 7. Rollout

- [ ] **Fase 0 — on-ramp.** `tsconfig` com `checkJs, strict, noEmit`; `types:check` no registry e
      no CI. Corrigir os erros com os arquivos ainda `.mjs`. Nada renomeado ainda.
- [ ] **Fase 1 — resolver.** Trocar o registry para paths sem extensão e o dispatch para o resolver
      `.ts/.js/.mjs`, **ainda em `.mjs`**. Suíte verde. É a mudança de comportamento de menor risco,
      isolada e testável antes de qualquer renomeação.
- [ ] **Fase 2 — renomear leaf-first.** Um módulo por vez (D5), `npm test` verde a cada um.
- [ ] **Fase 3 — build + publish.** `tsc` emitindo `dist/`; `build-fresh`; `package.json` apontando
      para `dist/`; `prepublishOnly` build→gate. Validar com `release:check --publish` e
      `npm publish --dry-run`.
- [x] Doc/persona: governança ganha o `build-fresh`; `docs/` e `CONTRIBUTING` ganham o "dev roda
      `.ts`, publicado roda `dist`".
- [ ] **Prova final**: `release:check` aprova o tarball com `dist/` fresco; reintroduzir um `dist/`
      defasado e confirmar que o `build-fresh` reprova.

## 8. Sinais de fracasso (kill criteria)

- **O hook passa a exigir build em dev.** Se em algum ponto o `SessionStart` não rodar sem `dist/`,
  o design falhou o NFR inegociável — pausa e reavalia o runtime duplo antes de seguir.
- **O resolver de extensão fica ambíguo** (um `.ts` e um `.js` do mesmo nome convivendo em dev).
  Mitigação: `.gitignore` do `dist/` em dev + o `build-fresh` garante que dist não anda solto.
- **`strict` vira um poço sem fundo.** Se a Fase 0 não estabilizar em tempo razoável, afrouxa para
  `strict` incremental (por arquivo via `// @ts-expect-error` pontual), nunca desligando o gate.
- **A migração começa a mudar comportamento pra agradar o compilador.** Se um teste precisar mudar
  de semântica, parou de ser migração — isola aquela mudança numa spec própria e segue.
