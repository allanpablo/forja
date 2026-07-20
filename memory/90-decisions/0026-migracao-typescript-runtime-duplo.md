# ADR-0026: Migração TypeScript com runtime duplo (fonte `.ts`, publicado `dist/`)

- **Status**: accepted
- **Data**: 2026-07-19
- **Autor(es)**: apk
- **Tags**: typescript, build, runtime, sdd

## Contexto

A SPEC-012 migrou o framework de `.mjs`/checkJs para TypeScript de verdade. Dois requisitos em
tensão organizaram todas as decisões:

- **NFR inegociável**: o dev roda `sem build`. `node bin/forja.ts <cmd>` tem que funcionar direto,
  ou o loop de desenvolvimento morre.
- **`engines.node >= 20`**: o pacote publicado precisa rodar em Node 20/21, que **não** executam
  `.ts` (strip-types nativo só existe a partir do Node 22.6).

Essas duas verdades não cabem no mesmo artefato: no instante em que a fonte vira `.ts`, um pacote
publicado sem compilar quebra para quem está em Node 20.

## Decisão

**Runtime duplo, resolvido por um único ponto.**

1. **D1 — Layout plano, `dist/` espelha a árvore.** `tsc rootDir=. outDir=dist` → `dist/bin`,
   `dist/lib`, `dist/scripts`. Não movemos a fonte para `src/`: trocaria todo import, path de
   registry e hook — blast radius enorme, contra o "verde contínuo".
2. **D2 — Registry + `resolveScript` (o coração).** O registry nomeia os scripts; o `resolveScript`
   tenta as extensões na ordem `['.ts', '.js', '.mjs']`, fazendo strip da extensão declarada. Em dev
   acha o `.ts`; no publicado acha o `dist/*.js`. Um resolver, dois mundos — sem dois registries
   (a divergência que a SPEC-009 matou).
3. **D3 — Dual runtime.** Dev roda `.ts` nativo (Node ≥22.6, exigência de contribuir); o publicado
   embarca `dist/*.js` (Node ≥20). O acoplamento de Node-floor vive só na fronteira do publicado.
4. **D4 (revisado) — o gate constrói o `dist/`.** O `release:check` roda `npm run build` **antes de
   empacotar** (quando `files[]` inclui `dist/`). Como `npm publish` empacota o disco e o gate
   empacota o mesmo disco recém-buildado, o tarball provado é o publicado — sem `dist/` no git, sem
   step de build no `ci.yml`, sem janela de staleness. O gate é self-contained.
5. **D9 — publicar `dist/` desde sempre desacopla o risco.** Enquanto a fonte ainda era `.mjs`, o
   build era uma cópia; quando virou `.ts`, virou compilação. Em ambos os casos o publicado é JS
   runnable, então o `.ts`-não-roda-em-Node-20 nunca morde o usuário final.

## Alternativas consideradas

- **Guardar `.js` compilado no git e exigir build em dev** — rejeitada: mata o NFR "roda sem build".
- **Publicar a fonte `.ts` crua** — rejeitada: quebra em Node 20/21; o `release:check` reprovaria.
- **Dois registries (dev/publicado)** — rejeitada: duas verdades que divergem (defeito da SPEC-009).
- **Mover a fonte para `src/`** — rejeitada: blast radius desproporcional para ganho estético.

## Consequências

**Positivas**:
- Dev roda `.ts` nativo, zero build; usuário final roda `dist/*.js`, Node ≥20. Cada um paga só o seu.
- Uma máquina (`resolveScript`) resolve os dois mundos; o gate prova o tarball real.
- `noImplicitAny` ligado ao fim: o ratchet força todo código futuro a ser tipado.

**Negativas / Trade-offs**:
- Contribuir passa a exigir Node ≥22.6; o job `test` do CI cai fora do Node 20 (o suporte a 20 do
  publicado é provado pelo `release-gate`, que instala o tarball `.js`).
- O `resolveScript` carrega três extensões por dívida histórica (`.mjs` legado) — barato, mas é
  estado que um dia se limpa.

## Rastreamento
- Spec: `specs/ts-migration/` (SPEC-012)
- Implementação: `lib/core/registry.ts` (resolveScript), `lib/core/release.ts` (gate builda),
  `tsconfig.json` / `tsconfig.build.json`, `.github/workflows/ci.yml`
- ADRs relacionadas: ADR-0021 (NFR "roda sem build"; classe "dist mente"), ADR-0024 (gate do tarball)
