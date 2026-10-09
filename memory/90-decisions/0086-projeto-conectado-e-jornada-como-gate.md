# ADR-0086: Projeto conectado à IA, raízes únicas e a jornada do usuário como gate

- **Status**: accepted
- **Data**: 2026-10-09
- **Autor(es)**: Allan Pablo / Claude
- **Tags**: core, generation, release, llm, governance

## Contexto

A v4.1.2 passava em 543 testes e no `release:check`, mas a jornada real do usuário estava quebrada.
Instalando o tarball e usando o Forja como um usuário faria, apareceram problemas em série:

- **Raiz errada no pacote instalado.** Vinte scripts calculavam a raiz com `path.resolve(__dirname, '..')`,
  que no pacote publicado aponta para `dist/`. O `project:new` gerava projetos sem instruções de IA,
  sem design-md e sem `.mcp.json`, e mesmo assim terminava com "Tudo pronto!" e exit 0. O `forja setup`
  caía com `Cannot find module`. No checkout, o `project:new` nem rodava, porque `init-project.js`
  estava cravado com `.js`. O `project:smoke` contornava esse ponto, então nenhum teste o exercitava.
  A mesma classe de bug já tinha sido corrigida uma vez (v1.6.1, `spec-cli`), mas só no arquivo afetado.
- **Projeto desconectado da IA.** As instruções iam para `.ia-instructions/`, pasta que nenhuma IA lê.
  Além disso, eram cópia do texto do *framework*: mandavam usar `npm run query:universal` e
  `scripts/agent-harness.ts`, que não existem no projeto. Não havia `CLAUDE.md`, hooks, sub-agents nem
  MCP do Forja. O `package.json` gerado apontava para `scripts/code-intel.mjs` e
  `scripts/tools-doctor.mjs`, que nunca eram copiados, e o do backend para três `memory-db-*.mjs` que
  nunca existiram.
- **Inteligência sem ligação.** O `context:smart` prometia os 3 modos da ADR-0003, mas chamava um
  script que ignorava `--mode`. O modo task, no `ContextBuilder`, nunca funcionou: `MATCH` dentro de
  `OR` lança erro no SQLite, e o erro era engolido por um `console.warn`. No modo embedded, o
  `sync:universal` indexava as specs do framework na memória do produto. Handoffs de produto entravam
  como handoffs do framework (o router rodava com `cwd` no pacote), e o `code:impact` dentro de um
  projeto analisava o código do Forja.

Os checks de consumidor do release nasceram um por bug e testavam peças isoladas. Nenhum deles cobria
o que o usuário de fato faz: criar um projeto e trabalhar nele com uma IA.

## Decisão

**1. Duas raízes, resolvidas num lugar só (`lib/paths.ts`).** `codeRoot` é onde está o código
executável: o repo em dev, `dist/` no pacote. `pkgRoot` é onde estão os assets versionados: a raiz do
pacote nos dois layouts. Scripts são executados com `script()`/`resolveScript()`, que não depende de
extensão. Nenhum outro módulo calcula raiz a partir de `__dirname`, e `test/paths.test.js` vigia a
classe inteira (raiz via `__dirname` e extensão cravada em spawn), não um arquivo.

**2. Todo projeto nasce conectado (`lib/project-wiring.ts`).** O mesmo módulo escreve e verifica:

- `AGENTS.md` com um bloco gerenciado (`<!-- forja:begin/end -->`), lido por Codex, Copilot agent e
  Gemini (via import); `CLAUDE.md`/`GEMINI.md` importam `@AGENTS.md`; o Copilot recebe o bloco em
  `.github/copilot-instructions.md`. O conteúdo vem de `templates/project/` e usa só `forja <comando>`.
- Claude Code: hooks `SessionStart` → `forja hook:session-start` e `UserPromptSubmit` →
  `forja hook:user-prompt`, protegidos por `command -v forja`; seis sub-agents por papel; permissão
  `Bash(forja *)`.
- `.mcp.json` com o servidor `forja mcp:start`. O codegraph entra só se o binário existir.
- `.forja/models.json` com a cadeia de fallback entre IAs, substituindo `.ia-instructions/models.json`.
- Scripts `code:*`/`tools:doctor` que chamam o `forja`. Scripts mortos de versões antigas são migrados.
- `memory/sqlite/` e `.context/` no `.gitignore`.

O conteúdo do usuário é preservado: o wire reescreve só o bloco gerenciado e só os sub-agents que
ainda têm a marca `forja:managed`. A verificação (`forja project:wire --check`) também confere que
todo `forja <cmd>` citado ao usuário existe no registry e que todo `node <arquivo>` dos `package.json`
aponta para um arquivo real.

**3. Superfícies.** `project:new` usa o wire e falha alto (exit 1 e resumo de pendências) quando algo
essencial não sai. `project:wire` conecta e verifica. `project:upgrade` religa projetos pré-v5 e só
traz backend para quem já tem um. `tools:doctor` mostra a conexão quando roda num projeto.
`hook:session-start` e `hook:user-prompt` entram no registry. Handoffs passam a ser carimbados com o
projeto de origem, e o briefing e o `next` filtram por ele.

**4. A jornada do usuário vira gate (`lib/core/journey.ts`).** Num HOME descartável, a jornada cria o
workspace e o projeto e percorre, dentro do projeto, wire, status, specs, memória, `context:smart`,
gates, hooks, MCP e handoff. Cada passo é conferido pelo efeito, não só pelo exit code. Ao final, a
jornada prova que nenhum arquivo do pacote mudou. Ela roda no `npm test` (contra o fonte) e no
`release:check` (check `consumer-journey`, contra o pacote instalado). Rodada contra a `main` da 4.1.2,
reprova no segundo passo.

## Alternativas consideradas

- **Corrigir só os scripts quebrados, um por um.** Rejeitada: foi o que se fez na v1.6.1 e na v1.7.0, e
  a classe de bug voltou. Sem um resolvedor único e um teste que vigie a classe, o próximo script novo
  repete o erro.
- **Manter `.ia-instructions/` e só corrigir o texto.** Rejeitada: nenhuma IA lê essa pasta sozinha.
  Instrução que depende de a IA "ser avisada" de onde está não conecta nada.
- **Hooks e MCP chamando scripts copiados para o projeto.** Rejeitada: cópias envelhecem e divergem
  (foi assim que `code-intel.mjs` e `tools-doctor.mjs` ficaram para trás). Chamar o `forja` mantém uma
  fonte só, e o `project:upgrade` religa projetos antigos.
- **Checar a jornada só no CI.** Rejeitada: a jornada leva cerca de 4s. No `npm test` ela pega a
  regressão no mesmo ciclo da edição; no `release:check` ela pega o que só quebra no tarball.

## Consequências

- **Breaking:** projetos novos não recebem `.ia-instructions/`; o backend gerado não tem mais
  `memory:db:init` (`memory:db:sync`/`query` chamam o `forja`); `init:project` e os aliases `ops:*`
  saem; `engines` passa a `node >=22`. Migração: `forja project:upgrade --apply`.
- Hooks e MCP de um projeto exigem `forja` no PATH (`npm i -g forjajs`). Sem ele, a sessão abre
  normalmente e o `project:wire --check` avisa.
- Comando novo que opere no projeto precisa passar na jornada. Comando que escreva no pacote quando
  executado num projeto reprova em "pacote intocado".
