# ADR-0087: Remover o dashboard web legado (`dashboard/`)

- **Status**: accepted
- **Data**: 2026-10-09
- **Autor(es)**: Allan Pablo / Claude
- **Tags**: dashboard, cleanup, release

## Contexto

A ADR-0022 congelou o `dashboard/` (Fastify + Vite, SPEC-002): o código ficou versionado, mas fora do
pacote, à espera de alguém que o retomasse. Desde então, o dashboard ativo passou a ser o
`apps/dashboard` (Next.js), que consome a API do `apps/server`. O `dashboard/` continuou no repo sem
ser publicado nem usado. Só aparecia em um teste do servidor legado, no roteiro de demo (que mandava
subir esse servidor) e em `docs/dashboard.md`. Na prática, eram dois dashboards, e a documentação
apontava para o que não é distribuído.

## Decisão

Remover `dashboard/`, `docs/dashboard.md`, os PNGs de captura na raiz e o teste do servidor legado.
O dashboard opcional é o `apps/dashboard`: `npm run dashboard:api` (API do `apps/server`, compilada) e
`npm run dashboard:dev` (app na porta 3001). O roteiro de demo passa a usar a CLI e esse app.
A ADR-0022 fica `superseded`. A spec `agent-dashboard` permanece como histórico (`abandoned`).

## Alternativas consideradas

- **Manter congelado.** Rejeitada: código sem dono e sem uso confunde quem chega (dois dashboards,
  docs que apontam para o errado) e custa manutenção nos checks.
- **Migrar telas do legado para o `apps/dashboard`.** Fora de escopo da limpeza. Se for preciso, a
  história no git preserva o código.

## Consequências

- Quem subia o dashboard legado (`npm --prefix dashboard start`) passa a usar `dashboard:api` e
  `dashboard:dev`.
- Menos superfície no repo: 71 arquivos e um teste a menos.
