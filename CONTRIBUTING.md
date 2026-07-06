# Contribuindo com a Forja

A Forja usa o próprio processo que ela prega. Contribuições seguem o mesmo pipeline:

## Regras do jogo

1. **Feature não-trivial começa por spec** — `npm run spec:new -- <slug>` e preencha `specs/<slug>/spec.md` antes de escrever código.
2. **Decisão estrutural vira ADR** — `memory/90-decisions/NNNN-titulo.md` (template em `_template.md`).
3. **Comando novo entra no registry** — `lib/core/registry.mjs` (o teste `test/forja-core.test.js` valida a integridade). Nada de script npm apontando direto para um script solto.
4. **pt-BR** em docs, mensagens e saída de CLI.
5. **Testes verdes** — `npm test` (Node ≥ 20).

## Setup

```bash
npm ci
npm test
node bin/forja.mjs   # help do core
```

## Antes de abrir o PR

```bash
npm test
npm run project:check
npm run spec:check -- <slug-da-sua-feature>
```

## O que não entra neste repo

- Dados de produto/cliente — vivem no workspace externo (`~/forja-workspace`, ADR-0019).
- Specs de produto — `specs/` do repo é allowlist (só specs do próprio framework, ver `.gitignore`).
