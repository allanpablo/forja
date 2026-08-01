# Sprint 10 — Indexação incremental de workspace/Git

## Objetivo

Transformar os extractors do GraphLoop em uma operação utilizável: listar
arquivos rastreáveis do workspace, gerar mutations determinísticas e expor o
processo como capability `graph.sync`.

## Fluxo

```text
GitWorkspaceSource
       ↓
GraphIndexer
       ↓
extractDeterministicRelations
       ↓
GraphLoop.apply (checksum)
       ↓
SqliteGraphStore
```

## Escopo

- `git ls-files --cached --others --exclude-standard -z` como fonte local;
- arquivos TypeScript/JavaScript/JSON/Markdown/YAML;
- exclusão de `.git`, `node_modules`, `dist`, `coverage`, binários e arquivos
  maiores que 1 MB;
- indexação incremental por locator/checksum;
- capability `graph.sync` com `ExecutionResult` e evidência;
- composição da capability no server oficial.

## Critérios de aceite

1. Arquivos ignorados e não indexáveis não entram na fonte.
2. Uma sincronização repetida retorna `skipped` sem duplicar arestas.
3. Falha do Git é retornada como erro, não como sucesso vazio.
4. A capability valida input antes do handler e exige permissão de escrita.
5. O server registra `graph.sync` sobre o GraphLoop SQLite.
6. A operação continua offline e não usa LLM.

## Limites

- arquivos removidos não são podados automaticamente nesta sprint;
- commits e diffs não são entidades extraídas ainda;
- `git ls-files` exige um repositório válido para a fonte oficial.

## Evidências

- `packages/graph/src/index.ts`;
- `packages/adapter-git/src/index.ts`;
- `apps/cli/src/index.ts`;
- `apps/server/src/main.ts`;
- testes de GraphIndexer, adapter Git e capability.
