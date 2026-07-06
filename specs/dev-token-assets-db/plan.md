# Plan: dev-token-assets-db

- **Spec**: ./spec.md
- **Status**: approved
- **Criado em**: 2026-06-02

## 1. Abordagem tecnica
Adicionar comandos CLI pequenos e aditivos. `context-ops.mjs` gera artefatos compactos e mede token budget. `memory-schema.mjs` cria tabelas auxiliares no SQLite sem alterar contratos existentes. O catalogo de boilerplates/design e derivado dos arquivos atuais, evitando manutencao manual inicial.

## 2. Modulos afetados
| Caminho | Mudanca | Risco |
|---|---|---|
| `scripts/context-ops.mjs` | novo CLI para budget, sprint pack, brief e catalogo | M |
| `scripts/memory-schema.mjs` | novo schema auxiliar SQLite | M |
| `package.json` | expor scripts operacionais | B |
| `docs/manual-operacional-cli-sdd-gsd.md` | orientar nova rotina | B |
| `.context/` | novos artefatos gerados | B |

## 3. Fluxo
```text
context:sprint
  -> le sprint, specs, handoffs, ADRs
  -> gera .context/sprint-pack.md
  -> registra context_run no SQLite

agent:brief <role> <slug>
  -> le spec/plan/tasks/runbook/handoffs
  -> gera .context/agent-brief-<role>-<slug>.md

context:budget <slug|arquivo>
  -> estima tokens
  -> compara com limite
  -> falha se exceder

catalog:assets
  -> varre boilerplates/design-md
  -> gera .context/asset-catalog.md
  -> popula asset_catalog
```

## 4. Contratos
```bash
npm run memory:schema
npm run context:budget -- <slug|arquivo> [limite]
npm run context:sprint
npm run agent:brief -- <role> <slug>
npm run catalog:assets
npm run token:benchmark
```

## 5. Decisoes
**D1**: Usar SQLite relacional auxiliar em vez de embeddings nesta fase. Motivo: menor complexidade e sem dependencia externa.

**D2**: Catalogo gerado, nao escrito manualmente. Motivo: reduz drift.

**D3**: Budget por estimativa simples `chars / 4`. Motivo: suficiente para gate operacional e sem dependencia de tokenizer.

## 6. Dependencias
- `better-sqlite3`, ja existente.
- Sem rede e sem pacotes novos.

## 7. Rollout
- Criar schema auxiliar.
- Gerar sprint pack e asset catalog.
- Rodar budget nos novos artefatos.
- Atualizar manual.

## 8. Sinais de fracasso
- Context pack ultrapassar 8k tokens sem motivo.
- Agent brief repetir spec inteira.
- Catalogo exigir manutencao manual constante.
