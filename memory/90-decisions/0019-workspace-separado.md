# ADR-0019: Workspace separado para projetos de produto

- **Status**: accepted
- **Data**: 2026-07-01
- **Autor(es)**: apk
- **Tags**: workspace, memory, orchestration, cli-first

## Contexto
O Forja nasceu como framework e, ao mesmo tempo, gerador de projetos. Os projetos gerados foram colocados em `projects/` dentro do mesmo repositório, gitignored. Com o tempo, isso gerou atrito:

- O worktree do framework ficava poluído com dados de produto (códigos, specs, memória).
- A memória universal (`memory/30-projects/`, `.memory/sqlite/universal.db`) convivia com a memória do framework, dificultando versionar um sem o outro.
- `init-project.js` tinha lógica ambígua: se o nome não contivesse `/`, colocava em `projects/<nome>`; caso contrário, usava o path fornecido.
- Não havia um "canto fixo" óbvio para novos projetos, aumentando a chance de perda ou commit acidental.

## Decisão
Separar o **framework Forja** do **workspace de produção**.

- O workspace padrão fica em `~/forja-workspace`.
- Todo projeto novo é criado obrigatoriamente em `~/forja-workspace/projects/<nome>`.
- A memória universal dos produtos fica em `~/forja-workspace/memory/` (incluindo `sqlite/universal.db` e `30-projects/`).
- O workspace é configurável via variável de ambiente `FORJA_WORKSPACE` ou arquivo `~/.forjarc.json`; o default é `~/forja-workspace`.
- A resolução de caminhos é centralizada em `lib/workspace.mjs`.

## Alternativas consideradas
- **Manter `projects/` dentro do repo do framework**: rejeitada porque mantém a poluição do worktree e dificulta versionar/backupear produtos separadamente.
- **Usar submódulos Git para cada projeto**: rejeitada porque adiciona complexidade de versionamento sem ganho operacional claro.
- **Workspace como subpasta irmã (`../forja-workspace`)**: rejeitada porque depende da localização do clone do framework; `~/forja-workspace` é previsível em qualquer máquina.

## Consequências
**Positivas**:
- Repo do framework fica limpo e versionável sem dados de produto.
- Projetos têm um "canto fixo" previsível.
- Backup e remoção de produtos ficam independentes do framework.
- É possível reinstalar ou mover o framework sem tocar nos produtos.

**Negativas / Trade-offs**:
- Usuários precisam saber que o workspace existe fora do repo (documentação e comandos devem deixar isso explícito).
- Projetos antigos em `projects/` do repo não são migrados automaticamente; migração é manual.
- Ferramentas que assumiam paths relativos ao repo do framework precisam ser atualizadas.

## Rastreamento
- Implementação: `lib/workspace.mjs`, `bin/init-project.js`, `scripts/*`, `package.json`, `README.md`, `AGENTS.md`, `docs/structure.md`, `docs/init-project.md`.
- Spec: `specs/reestruturacao-forja-v2/`
- ADRs relacionadas: ADR-0001, ADR-0003, ADR-0005, ADR-0008, ADR-0017, ADR-0018.
