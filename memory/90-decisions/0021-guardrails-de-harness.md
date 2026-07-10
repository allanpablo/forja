# ADR-0021: Guardrails de harness e dependência de runtime explícita

- **Status**: accepted
- **Data**: 2026-07-09
- **Autor(es)**: Allan Pablo
- **Tags**: harness, hooks, npm, memory, governance

## Contexto

Três falhas silenciosas foram encontradas com o framework já publicado como `forjajs` no npm.
As três compartilham a mesma natureza: **erram sem avisar**. Nenhuma quebrava um teste,
nenhuma aparecia no `git status`, e todas produziam trabalho errado com aparência de trabalho certo.

1. **`.mcp.json` com path absoluto obsoleto.** O codegraph era iniciado com
   `-p /home/apk/.../2-Projeto-Agents/projects/forja`, uma cópia parada no commit `282c265`
   (anterior ao ADR-0020). Consequência: `bin/forja.mjs` e `lib/core/` — o core inteiro que o
   `CLAUDE.md` manda todo agente usar — eram invisíveis ao índice. Qualquer `codegraph_explore`
   respondia sobre código morto, com confiança. O path também era versionado, quebrando para
   qualquer outro contribuidor.

2. **`better-sqlite3` como `devDependency`.** Dez scripts sob `files[]` a importam
   estaticamente, e o pacote declarava zero `dependencies`. Numa instalação limpa
   (`npm i -g forjajs`), `query:universal`, `sync:universal`, `context:smart`, `agent:route`,
   `memory:compress` e `project:dashboard` estouravam com `ERR_MODULE_NOT_FOUND`. O `forja`
   sem argumentos funcionava — o help não carrega os scripts — o que mascarava a quebra.

3. **Regras de repositório existiam só como prosa.** `projects/` é declarado off-limits no
   `CLAUDE.md`, e a invariante do ADR-0020 ("comando novo = entrada no registry") era validada
   apenas no pre-commit via lefthook, que é opt-in. Ambas dependiam de a IA lembrar. Uma regra
   que depende de memória não é uma regra; é uma sugestão.

4. **Índice FTS5 cruzado com o conteúdo errado.** `sync-universal-memory.js` obtinha o id do nó
   recém-gravado via `result.lastInsertRowid || SELECT id ...`. Num `INSERT ... ON CONFLICT DO
   UPDATE` que *atualiza*, o SQLite não redefine `lastInsertRowid` — mantém o id do último INSERT
   da conexão. Sendo truthy, o fallback nunca disparava. Toda execução com um insert seguido de
   updates gravava o conteúdo de um documento sob o `node_id` de outro. Efeito medido: o ADR-0021
   indexado com o corpo de "Harnesses: Hermes e GSD"; `query:universal "registry"` não encontrava
   o ADR-0020; 135 linhas órfãs acumuladas. Como `query:universal` é o **primeiro passo** da
   economia de tokens do ADR-0009, o framework vinha alimentando os agentes com o documento
   errado — sem erro, sem log, sem sintoma.

## Decisão

Mover a aplicação das regras do texto para o harness, e a verificação da publicação da leitura
para a execução.

- **`.mcp.json` sem `-p`.** Em modo MCP o codegraph resolve o projeto pelo `rootUri` do cliente.
  Remover o path elimina a classe inteira de erro em vez de corrigir uma instância.
- **`better-sqlite3` em `dependencies`.** É dependência de runtime; era só declaração errada.
- **`PreToolUse` → `scripts/hook-guard-paths.mjs`.** Bloqueia escrita em `projects/` e
  `docs/archive/` com exit 2, devolvendo o motivo e a alternativa. Falha aberta.
- **`PostToolUse` → `scripts/hook-post-edit.mjs`.** Ao editar `lib/core/registry.mjs` ou
  `package.json`, roda `test/forja-core.test.js` na hora. A quebra chega junto da edição que
  a causou, não commits depois.
- **`SessionStart` resiliente e honesto.** Todo acesso a SQLite passa a ser lazy — o hook
  degradava para stack trace sem `node_modules`. Além disso, passa a avisar quando `memory/`
  mudou depois do último `sync:universal`: índice defasado é a versão local do problema (1).
- **`RETURNING id` no upsert de `memory_nodes`.** Devolve a linha realmente afetada, inserida ou
  atualizada, eliminando a dependência de `lastInsertRowid`. O sync passa a purgar linhas órfãs
  do `search_idx` ao final, e o `title` volta a ser atualizado no conflito.
- **Subagent `release-auditor`.** Audita o pacote instalando o tarball de verdade e exercitando
  comandos reais. Proibido aprovar por leitura de código.
- **Skills `new-adr` e `new-command`.** Os dois rituais do repo viram etapas executáveis.

## Alternativas consideradas

- **Path relativo (`-p .`) no `.mcp.json`** — rejeitada porque ainda depende do `cwd` do processo
  do servidor, que não é contratual. Omitir a flag delega ao protocolo, que é.
- **`better-sqlite3` como `optionalDependency` com degradação** — rejeitada porque a memória
  hierárquica com FTS5 é a proposta central do Forja, não um extra. Um `forjajs` sem memória
  não é uma instalação degradada; é uma instalação errada.
- **Manter as regras no `CLAUDE.md` e confiar na leitura do agente** — rejeitada por evidência:
  as regras já estavam escritas e ainda assim o índice ficou apontando para a árvore errada por
  mais de uma semana.
- **Rodar a suíte inteira no `PostToolUse`** — rejeitada por custo. O gate é `forja-core.test.js`,
  um arquivo, poucos segundos. Um hook lento é um hook que alguém desliga.
- **Reconstruir o `search_idx` do zero a cada sync** — rejeitada porque esconderia a causa. O
  índice ficaria correto sem que o upsert deixasse de devolver o id errado, e o próximo consumidor
  de `lastInsertRowid` reencontraria o mesmo bug.

## Consequências

**Positivas**:
- O pacote publicado passa a funcionar numa instalação limpa — verificado via `npm pack` + install.
- `query:universal` volta a devolver o documento que casou com a busca. Medido: 709 pares
  título↔conteúdo alinhados, 0 cruzados, 0 órfãos (antes: 3 cruzados, 135 órfãos).
- Violações de `projects/` e do registry tornam-se impossíveis, não improváveis.
- O índice de memória defasado passa a se anunciar em vez de responder errado calado.
- Contribuidores externos clonam e o codegraph indexa o repo certo, sem editar nada.

**Negativas / Trade-offs**:
- `npm i forjajs` agora compila/baixa um módulo nativo (`better-sqlite3`): instalação mais lenta
  e sujeita a prebuilds por plataforma. É o preço de o produto funcionar.
- O hook `PostToolUse` acrescenta poucos segundos a cada edição de `registry.mjs` ou `package.json`.
- Guardrails têm escape hatch (`FORJA_GUARD=0`, `FORJA_HOOK_TEST=0`). Um guard sem escape vira
  um guard contornado por caminhos piores.
- `.claude/skills/` entra em `files[]`, aumentando o tarball.

## Rastreamento
- Implementação: `.mcp.json`, `package.json`, `.claude/settings.json`,
  `scripts/sync-universal-memory.js`, `scripts/hook-guard-paths.mjs`, `scripts/hook-post-edit.mjs`,
  `scripts/hook-session-start.mjs`, `.claude/agents/release-auditor.md`,
  `.claude/skills/new-adr/`, `.claude/skills/new-command/`
- Testes: `test/hooks.test.js`, `test/memory-index.test.js`
- ADRs relacionadas: ADR-0009 (economia de tokens — a corrupção do FTS a invalidava na prática),
  ADR-0017 (codegraph no harness), ADR-0018 (ferramentas de processo),
  ADR-0019 (workspace separado), ADR-0020 (forja core CLI única)
