# Plan: cli-first-operacao

- **Spec**: ./spec.md
- **Status**: approved
- **Criado em**: 2026-06-02

## 1. Abordagem tecnica
Manter o dashboard existente como opcional e mover a operacao principal para comandos. Corrigir o gerenciador de sprint para funcionar no repositorio raiz, aceitar backlog RICE e expor encerramento de sprint no `package.json`. Ajustar GSD para nao exigir design em fluxo sem UI.

## 2. Modulos afetados
| Caminho | Mudanca | Risco |
|---|---|---|
| `scripts/sprint-manager.js` | default para raiz e suporte a tabela RICE | M |
| `scripts/agent-harness.mjs` | `gsd:check` aceita CLI-only sem brief visual | B |
| `scripts/dev.mjs` | saida textual mais limpa | B |
| `scripts/check-standards.js` | `project:check` valida root sem argumento | B |
| `package.json` | novos aliases de operacao | B |
| `README.md`, `AGENTS.md`, `docs/*` | documentar CLI-first | B |

## 3. Fluxo
```
sprint:start/status
  -> context:build
  -> gsd:plan
  -> gsd:handoff spec/plan/implement/review
  -> gsd:check
  -> project:check
```

## 4. Contratos
- `npm run sprint:start [projeto]`
- `npm run sprint:status [projeto]`
- `npm run sprint:complete [projeto]`
- `npm run gsd:check -- <slug> [brief.md]`

Sem `brief.md`, o check considera design como nao aplicavel.

## 5. Decisoes
**D1**: Nao remover o dashboard agora. Ele fica legado/opcional para evitar quebra de scripts e preservar historico.

**D2**: Backlog RICE nao e modificado ao iniciar sprint. A sprint recebe uma selecao operacional dos P0/P1.

## 6. Dependencias
- Sem novos pacotes.
- Sem migracao de banco.

## 7. Rollout
- Documentacao atualizada no README, AGENTS e guia CLI-first.
- Testes de CLI executados localmente.

## 8. Sinais de fracasso
- Operador ainda precisar abrir web para acompanhar sprint.
- `gsd:check` bloquear tarefa CLI-only por ausencia de brief visual.
