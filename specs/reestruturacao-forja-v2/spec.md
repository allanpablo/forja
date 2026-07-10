# Spec: reestruturacao-forja-v2

- **ID**: SPEC-028
- **Status**: done
- **Owner**: apk
- **Criado em**: 2026-07-01
- **Sprint alvo**: <S?>
- **ADRs relacionadas**: ADR-0019 (workspace separado), ADR-0020 (core CLI única)

## 1. Problema
O Forja hoje mistura o **framework** (motor) com os **produtos gerados** dentro do mesmo repositório. A pasta `projects/` é gitignored, a memória universal dos produtos (`memory/30-projects/`, `.memory/sqlite/universal.db`) fica no repo do framework e não há um "canto fixo" claro onde os projetos vão parar. Isso causa:
- Poluição do worktree do framework com dados de produto.
- Dificuldade de versionar/backupear produtos separadamente.
- Ambiguidade sobre onde `init-project` cria o projeto.
- Risco de apagar memória/specs de produto ao manipular o repo do framework.

## 2. Proposta de valor
Separar o framework Forja do workspace de produção em um diretório fixo (`~/forja-workspace`), tornando o Forja um motor reutilizável que orquestra projetos em um "canto fixo" isolado, com memória, specs e handoffs próprios.

## 3. User stories
- **Como** operador do Forja, **quero** que novos projetos sejam criados em `~/forja-workspace/projects/<nome>`, **para que** o repo do framework permaneça limpo.
- **Como** desenvolvedor, **quero** que a memória universal dos projetos fique no workspace, **para que** eu possa versionar o framework sem expor dados de produto.
- **Como** arquiteto, **quero** um comando `forja workspace:init` e `forja project:new`, **para que** o harness GSD seja operado de forma unificada.

## 4. Critérios de aceite (Definition of Done)

> Verificados em 2026-07-09. A spec estava `approved` com o trabalho já concluído — os checkboxes
> nunca foram marcados. Auditoria confirmou os 10 critérios contra o código.

- [x] AC-1: Workspace padrão `~/forja-workspace` é criado e configurado automaticamente na primeira operação.
- [x] AC-2: `init-project` cria projetos obrigatoriamente dentro de `~/forja-workspace/projects/<nome>` (não mais dentro do repo do framework).
- [x] AC-3: Memória universal (SQLite) e `memory/30-projects/` dos produtos são movidos/criados no workspace, não no repo do framework.
- [x] AC-4: Scripts `sync:universal`, `query:universal`, `context:smart` e `build-smart-context` passam a operar sobre o workspace. — `query-universal-memory.js` não referencia o workspace diretamente; delega a `getDbPath()` de `memory-schema.mjs`, que resolve para `~/forja-workspace/memory/sqlite/universal.db`.
- [x] AC-5: Novo módulo `lib/workspace.mjs` centraliza a descoberta do workspace (env `FORJA_WORKSPACE` > `.forjarc.json` > default `~/forja-workspace`).
- [x] AC-6: ~~`npm run dev -- workspace:init`~~ → **interface mudou** para `node bin/forja.mjs workspace:init` (ADR-0020, core CLI única). Comando presente no registry.
- [x] AC-7: ~~`npm run dev -- project:new <nome>`~~ → **interface mudou** para `node bin/forja.mjs project:new`. Presente no registry, junto de `project:list` e `workspace:project:check`.
- [x] AC-8: AGENTS.md, README.md, .gitignore, docs/ e ADRs são atualizados para refletir a separação framework/workspace. — ADR-0019 documenta a decisão.
- [x] AC-9: `project:check` continua passando no framework e passa a aceitar projeto alvo pelo path absoluto/relativo ao workspace.
- [x] AC-10: Teste de fumaça: criar um projeto de exemplo no workspace e rodar `project:check` sobre ele. — `~/forja-workspace/projects/forja-smoke-test`.

## 5. Escopo
**Dentro**:
- Definição do workspace `~/forja-workspace` como canto fixo.
- Refatoração de `init-project.js`, `create-memory-nest-kit.js` e scripts de memória para usar workspace.
- Criação de `lib/workspace.mjs` (resolução de caminhos).
- Novos comandos no harness: `workspace:init`, `project:new`, `project:list`.
- Atualização de documentação (README, AGENTS.md, docs/structure.md, docs/init-project.md).
- Criação de ADR-0019 (workspace separado).
- Ajuste de `.gitignore` para ignorar definitivamente `projects/` local e garantir que o workspace não entre no repo.

**Fora** (explícito, evita scope creep):
- Não reescrever o dashboard web agora (apenas ajustar rotas se necessário).
- Não migrar specs de produto antigas (apenas definir a nova convenção).
- Não alterar a pipeline SDD/GSD em si (apenas onde os artefatos ficam).
- Não reinstalar dependências do dashboard/backend.

## 6. NFRs / restrições
- Compatibilidade: não quebrar `npm run project:check` no framework.
- Segurança: dados de produto nunca devem ser commitados acidentalmente no repo do framework.
- Portabilidade: workspace configurável via `FORJA_WORKSPACE` ou `.forjarc.json` no home.
- CLI-first: toda operação deve ser possível por comando.

## 7. Riscos e mitigação
| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Perda de dados de projetos antigos em `projects/` | M | A | Não apagar `projects/` existente; adicionar mensagem de migração manual. |
| Scripts quebrarem por path hardcoded | A | M | Criar `lib/workspace.mjs` e auditar todos os paths. |
| Usuário confundir repo do framework com workspace | M | M | Documentar claramente; commandos mostram o workspace ativo. |
| universal.db existente no repo ter dados úteis | B | A | Backup opcional; novo DB é criado no workspace. |

## 8. Métricas de sucesso
- 100% dos novos projetos criados no workspace em 30 dias.
- Zero commits acidentais de `projects/` ou `.memory/` no repo do framework.
- `project:check` passando tanto no framework quanto em projeto do workspace.
