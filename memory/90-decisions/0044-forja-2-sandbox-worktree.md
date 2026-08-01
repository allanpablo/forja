# ADR-0044 — Sandbox por worktree com promoção explícita

- **Status**: accepted
- **Data**: 2026-07-31
- **Contexto**: Execuções agênticas precisam de isolamento, diff auditável, validação independente e descarte seguro antes de afetar o workspace principal.
- **Decisão**: `packages/sandbox` implementa o ciclo de sessão por portas. A implementação inicial de backend é Git worktree em `packages/adapter-git`, usando `CommandRunner` e `PatchApplier` injetados.
- **Regras**:
  - uma sessão só executa após `prepare`;
  - `validate` deve retornar `accepted` para habilitar `diff` e `promote`;
  - `promote` exige diff com o mesmo `sessionId` e checksum não vazio;
  - rejeição e destruição são operações explícitas e auditáveis;
  - o domínio não importa Git, filesystem, subprocessos ou Docker;
  - comandos e aplicação de patch pertencem ao adapter e devem passar por policy na camada de aplicação.
- **Alternativas rejeitadas**:
  - executar diretamente no workspace: elimina isolamento e dificulta rollback;
  - promoção automática após comando bem-sucedido: sucesso do processo não é validação do resultado;
  - acoplar o domínio a `child_process`: inviabiliza backend substituível e testes determinísticos.
- **Consequências**: O adapter SQLite deverá persistir sessões, execuções e diffs; a camada de aplicação deverá autorizar operações críticas antes de chamar promoção ou destruição forçada.
- **Evidências**: `test/sandbox.test.js`, `test/adapter-git.test.js`, `npm run types:check`, `git diff --check`.
