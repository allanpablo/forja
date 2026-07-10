# dashboard/ — congelado

> **Esta pasta não é superfície pública do Forja.** Ver
> [ADR-0022](../memory/90-decisions/0022-congelar-dashboard-web.md).

Painel web local para specs, handoffs, tokens e comandos. Implementado por inteiro em
2026-07-06 (15 rotas Fastify, 12 telas React, 68 testes verdes, bundle de 190KB gzip) e
**congelado em 2026-07-09** sem nunca ter tido um usuário.

## Por que está congelado

- Nasceu no commit de release público e não recebeu uma única iteração depois.
- Mantinha uma `COMMAND_ALLOWLIST` própria, hard-coded, paralela ao registry do core
  (`lib/core/registry.mjs`). As duas já haviam divergido: o registry tem 41 comandos, a
  allowlist expõe 11, e `context:build` existia só na allowlist — executando por fora dos
  gates e da trilha de auditoria do ADR-0020.
- Nunca foi distribuído no pacote npm (não está no `files[]`), apesar de a documentação e
  o script `npm run dashboard` prometerem o contrário. Isso foi corrigido.

## Como subir mesmo assim

Os scripts `dashboard*` foram removidos do `package.json` do root (o `package.json` é
publicado inteiro no npm; não há como ter script só local). Para rodar:

```bash
cd dashboard
npm install
npm start                     # http://127.0.0.1:7777 — bind em 127.0.0.1, nunca 0.0.0.0

# frontend, se quiser a SPA em vez do JSON:
cd web && npm install && npm run build
```

Testes: `cd dashboard && npm test` (68 testes, todos verdes).

## Antes de descongelar

O ADR-0022 lista as condições, resumidas aqui:

1. Ter um usuário real e um caso de uso que o CLI não atenda.
2. Derivar a allowlist do registry, em vez de mantê-la à mão.
3. Auditar as rotas mutáveis — `/api/commands`, `/api/workflow/:project/run/:role` e
   `/api/stacks`. Só a primeira estava no escopo da auditoria original.
4. Incluir `dashboard/` no `files[]` **antes** de voltar a documentá-lo publicamente.

⚠️ Este servidor expõe rotas que executam processos (`/api/commands`,
`/api/workflow/:project/run/:role`). Ele nunca passou por auditoria de segurança. Não o
exponha em rede.
