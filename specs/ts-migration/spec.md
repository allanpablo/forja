# Spec: ts-migration

- **ID**: SPEC-012
- **Status**: done
- **Owner**: apk
- **Criado em**: 2026-07-18
- **Sprint alvo**: S?
- **ADRs relacionadas**: [ADR-0024](../../memory/90-decisions/0024-gate-do-tarball.md) (gate do tarball), [ADR-0023](../../memory/90-decisions/0023-doctor-como-gate-do-nucleo.md) (gate do núcleo), [ADR-0021](../../memory/90-decisions/0021-guardrails-de-harness.md) (guardrails), [ADR-0020](../../memory/90-decisions/0020-forja-core-cli-unica.md) (registry)

## 1. Problema

O framework tem ~8.500 LOC em 38 arquivos, e **os contratos que o sustentam são convenção, não
código**. A forma de um check (`{ id, severity, probe, fix }`), o handoff de 7 campos (ADR-0005), o
`Env` injetável, as entradas do registry — nada disso é verificado até rodar. Nesta sessão, três
frentes seguidas (ADR-0023/0024/0025) fizeram o mesmo movimento: converter conhecimento que vivia em
prosa num invariante executável. **A migração para TypeScript é esse movimento aplicado aos
contratos do próprio código** — drift de contrato deixa de ser surpresa em runtime e vira erro de
compilação.

Já há 9 arquivos com `@typedef` de JSDoc: a tipagem manual já começou, só não é verificada. E o repo
está a meio caminho de `.js → .mjs` (21 vs 16), então já se mexe na camada de módulos.

**A tensão que a migração precisa respeitar.** Um princípio carrega o framework desde o ADR-0021: o
`tools:doctor` e o hook `SessionStart` rodam **sem build e sem `node_modules`**. Foi isso que tornou
a morte da memória (ABI) sobrevivível e o hook resiliente. Uma migração ingênua ("compila pra
`dist/`, roda `dist/`") fritaria esse princípio — e pior, reintroduziria a classe que passamos a
sessão matando: **um `dist/` que mente sobre o `src/`.**

## 2. Proposta de valor

TypeScript de verdade — tipos exportáveis para quem consome o `forjajs` — **sem** perder o "roda sem
build" que faz o Forja resiliente, e **sem** deixar o artefato compilado divergir da fonte.

## 3. User stories

- **Como** quem mantém o framework, **quero** que um `probe` que devolve a forma errada seja **erro
  de compilação**, não bug silencioso, **para que** o contrato dos checks pare de ser convenção.
- **Como** quem instala `forjajs`, **quero** tipos (`.d.ts`) no pacote, **para que** meu editor
  saiba a forma da API.
- **Como** agente rodando o hook `SessionStart`, **quero** que ele funcione **sem build e sem
  `node_modules`**, **para que** o diagnóstico sobreviva ao ambiente quebrado (ADR-0021).
- **Como** quem publica, **quero** que `dist/` desatualizado **reprove** o `release:check`, **para
  que** o pacote publicado nunca minta sobre a fonte.

## 4. Critérios de aceite (Definition of Done)

- [ ] AC-1: **Runtime duplo.** Em dev e nos hooks, o Forja roda a fonte `.ts` via type-stripping do
      Node (confirmado: Node 26 executa `.ts` nativo). **Zero build em dev.** O pacote publicado
      embarca `dist/` compilado por `tsc`, para o piso `engines.node >= 20`.
- [ ] AC-2: **`build-fresh` no catálogo `RELEASE_CHECKS`** (ADR-0024): recompila e compara com o
      `dist/` versionado; se `src/` mudou e `dist/` não, **reprova** com `fix: "npm run build"`. O
      artefato compilado não pode ser publicado defasado.
- [ ] AC-3: **On-ramp por `checkJs` antes de renomear.** `tsconfig` com `checkJs: true, strict: true,
      noEmit` roda sobre os `.mjs` atuais; os erros de tipo são corrigidos **antes** de qualquer
      renomeação. `types:check` vira **npm script** (como `test`) e step do CI — **fora do registry
      publicado**, porque precisa do devDep `typescript` e seria comando quebrado numa instalação
      `forjajs` (a classe da v1.1.3). *(Correção de rota da Fase 0.)*
- [ ] AC-4: **Contratos tipados.** `Check`, `Probe`, `Result`, `Env`, `Command` (registry) e o
      handoff de 7 campos (ADR-0005) viram tipos reais, não `@typedef` de convenção.
- [ ] AC-5: `tsc` emite `.d.ts` no `dist/`; o `package.json` aponta `types`/`exports` para eles.
- [ ] AC-6: **`release:check` cobre o build.** O gate compila antes de empacotar; `prepublishOnly`
      roda build → gate (ordem correta, sem recursão — o gate não dispara `prepack`, ADR-0024).
- [ ] AC-7: Suíte verde em cada passo da renomeação (leaf-first). O `node --test` roda sobre `.ts`.
      **É a rede de segurança da migração**: se todos os testes passam sem edição de semântica, a
      renomeação não mudou nada.
- [ ] AC-8: `tools:doctor`, `release:check` e `spec:check` verdes ao final; instalação limpa do
      tarball funciona (o próprio `release:check` prova).
- [ ] AC-9: ADR-0026 registrando a decisão (runtime duplo, `build-fresh`, `tsc`).

## 5. Escopo

**Dentro**:
- `tsconfig.json` + `checkJs` on-ramp; migração `.mjs/.js → .ts` leaf-first.
- `tsc` como toolchain (build → `dist/`, emite `.d.ts`).
- `build-fresh` em `lib/core/release`; `types:check` no registry; steps no CI.
- `package.json`: `main`/`types`/`exports`/`bin` → `dist/`; `build`; `prepublishOnly` build→gate.
- ADR-0026 + ajustes de teste.

**Fora** (explícito):
- **Bumpar o piso de Node.** Fica em `>= 20`; por isso publicamos `dist/` compilado. Dev usa Node
  novo (strip nativo), mas o usuário final não é obrigado.
- **Geradores como template string.** A fragilidade real (o `@nestjs` falso-positivo, o
  `stripTemplateLiterals`) é separável e ganha spec própria — misturá-la aqui explode o escopo.
- **Reescrever lógica.** É migração de tipos, não refator de comportamento. Todo teste existente
  passa sem mudança de semântica.
- **Consolidar o scanner duplicado** (`IMPORT_RE` em `health` e `release`). Vale, mas é refactor —
  e misturá-lo à migração polui o sinal "todos os testes passam sem mudança de semântica", que é a
  rede de segurança da migração inteira (AC-7). Vira fast-follow, spec própria.
- **esbuild/swc.** `tsc` basta — é framework, não hot path; e precisamos do type-check de qualquer
  forma.

## 6. NFRs / restrições

- **"Roda sem build" preservado (inegociável).** O `SessionStart` e o `tools:doctor` nunca podem
  depender de `dist/` nem de `node_modules` para funcionar em dev. É o NFR que mata ou aprova o
  design (AC-1).
- **`dist/` nunca mente.** Coberto pelo `build-fresh` (AC-2). Sem esse check, a migração reintroduz
  a classe do ADR-0021 — e aí não vale a pena.
- **Verde contínuo.** Renomeação leaf-first, suíte verde a cada arquivo. Nada de big-bang.
- **Zero dependência de runtime nova.** `typescript` é `devDependency` (só o build a usa); o pacote
  publicado continua com uma dependência de runtime (`better-sqlite3`).

## 7. Riscos e mitigação

| Risco | Prob | Impacto | Mitigação |
|---|---|---|---|
| `dist/` publicado defasado da fonte | M | **A** | `build-fresh` no `release:check` (AC-2) — a classe do ADR-0021, fechada |
| Hook passa a exigir build/`dist` em dev | M | A | Runtime duplo: dev roda `.ts` nativo; `dist/` só no tarball (AC-1). NFR de bloqueio |
| `bin` aponta pra `dist/` e dev roda sem build | M | M | Dev usa `node bin/forja.ts` / script; `bin` do published → `dist/` |
| Migração big-bang quebra tudo de uma vez | M | A | `checkJs` primeiro, renomeia leaf-first, verde a cada passo (AC-3, AC-8) |
| `node --test` não roda `.ts` | B | A | Confirmar cedo; Node novo roda `.ts` de teste nativo (mesmo strip) |
| `strict` acusa centenas de erros de uma vez | M | M | On-ramp `checkJs` isola os erros antes da renomeação; corrige incremental |

## 8. Métricas de sucesso

- Um `probe` com a forma errada **não compila** — o contrato dos checks deixou de ser convenção.
- `dist/` publicado é sempre igual ao `src/` compilado, provado pelo `build-fresh` a cada release.
- O `tools:doctor` e o `SessionStart` seguem rodando **sem build** em dev — o NFR inegociável, medido.
- Consumidores do `forjajs` recebem `.d.ts` — a API deixa de ser adivinhação.
