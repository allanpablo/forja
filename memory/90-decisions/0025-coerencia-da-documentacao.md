# ADR-0025: Coerência da documentação como gate

- **Status**: accepted
- **Data**: 2026-07-18
- **Autor(es)**: Allan Pablo
- **Tags**: governance, docs, harness, diagnostics, registry

## Contexto

Os ADRs 0023 e 0024 fecharam a classe "erra sem avisar" (ADR-0021) no **núcleo** e no **tarball**.
Faltava a fronteira mais barata de corromper e a mais cara de perceber: a **palavra escrita**.

O Forja é operado por agentes que leem a documentação e executam o que ela manda. Quando a doc e o
código divergem, o agente não erra por burrice — erra por **obediência**. Uma auditoria manual em
2026-07-14 encontrou, entre outras coisas:

- `docs/token-optimization.md` — o documento que ensina a economia de tokens (ADR-0009) — mandava
  rodar **quatro comandos que não existem** (`context:build`, `memory:db:reindex`, …) e linkava um
  `docs/DEPLOYMENT.md` que nunca existiu.
- O Governance descrevia `tools:doctor` pela definição anterior ao ADR-0023.
- Comandos do registry sem menção em lugar nenhum — capacidade obscura é capacidade morta.

Nada disso quebrava um teste nem aparecia no `git status`. A correção manual apagou os sintomas do
dia; nada impedia a reincidência. Toda vez que um comando é renomeado ou um gate muda de contrato, a
doc pode silenciosamente passar a mentir.

## Decisão

Três checks novos no catálogo de `health.mjs` (`scope: repo`), sobre um scanner puro
`lib/core/doc-graph.mjs` que lê os `.md` de instrução como dado:

- **`docs-commands`** (critical): todo `forja <cmd>` / `npm run <cmd>` citado numa superfície de
  instrução existe no registry. Comando fantasma faz o agente agir errado — trava.
- **`commands-documented`** (warn): todo comando do registry é mencionado em ao menos um `.md`.
- **`docs-links`** (warn): todo link markdown relativo entre arquivos versionados resolve.
- **`adr-refs`** (warn, adicionado depois): toda citação `ADR-NNNN` em doc/spec/ADR aponta para um
  ADR que existe. Fecha o último invariante que vivia por disciplina ("toda decisão vira ADR") pelo
  lado verificável: referência a decisão inexistente é trilha que apodrece. Pegou o `ADR-0026`
  pendurado (citado pela SPEC-012, nunca escrito) na primeira execução.

Princípios:

- **Scanner puro, checks finos.** `doc-graph.mjs` lê e devolve dados (`scanCommands`, `scanLinks`,
  `projectCommands`); os checks julgam. Testar o parsing — a parte difícil — não exige montar o
  ambiente do doctor.
- **Allowlist derivada, jamais literal.** Os comandos do projeto *gerado* (`start:dev`, `test:e2e`,
  `memory:db:*`) não são do Forja e não podem reprovar. A allowlist deriva de **duas** fontes: os
  blocos `"scripts"` inline dos geradores **e** os `package.json` dos boilerplates. Foi `test:e2e`
  — que vive no boilerplate, não no gerador — que provou que uma fonte só produz falso positivo. Uma
  lista manual mente no primeiro comando novo do boilerplate (a lição do `.gitignore`, SPEC-009).
- **Escopo = instrução, não histórico.** Escaneia `docs/` (menos `archive/`), `prompts/`,
  `.claude/agents/` e os `.md` de raiz. **Fora**: `boilerplates/` (conteúdo do projeto gerado),
  `specs/` e `memory/90-*` (registro histórico — uma spec ou ADR pode legitimamente citar um comando
  proposto ou já removido). O gate protege o que instrui o agente *agora*.
- **`:` como discriminador de comando.** Cobre 42/42 do registry e nenhuma prosa (`"forja does X"`)
  casa por acidente. Inventar parser de gramática para um comando-sem-`:` inexistente seria criar o
  problema que não temos.
- **Severidade honesta.** Só `docs-commands` é crítico. Comando não-documentado e link quebrado
  atrapalham, não impedem — `warn`. Um gate que reprova o que não trava é um gate que se aprende a
  ignorar.

## Alternativas consideradas

- **Manter a auditoria manual** — rejeitada: ela apaga sintomas, não fecha a classe. Reincide na
  próxima renomeação.
- **Lista literal de comandos do projeto gerado** — rejeitada: é a armadilha do `.gitignore` da
  SPEC-009. Uma lista que não acompanha o gerador vira mentira.
- **Parsear markdown com um lexer de CommonMark** — rejeitada: peso morto. Precisamos de citações e
  links, não de um AST. Regex + o discriminador `:` bastam.
- **Gerar a doc a partir do registry** — rejeitada: doc gerada por máquina descreve o *quê*, nunca o
  *porquê*, e o porquê é o que importa. O gate cobra que a explicação exista; não escreve por você.
- **Escanear `specs/` e `memory/` também** — rejeitada: são registro histórico. Reprovar um ADR por
  citar um comando já removido puniria a memória por lembrar.

## Consequências

**Positivas**:
- Renomear um comando vira **ato detectável**: a doc que ficou para trás reprova o CI (o
  `tools:doctor` já é step, ADR-0024) — não espera a próxima auditoria manual.
- Os quatro comandos-fantasma e os 22 links quebrados da auditoria manual viram zero, verificado a
  cada CI. `memory:extract` (o único órfão) passou a ser documentado.
- O gate pegou o **próprio autor**: ao corrigir os links, um erro de profundidade relativa
  (`../../` vs `../../../`) foi detectado na hora, antes do commit. É a prova de que ele mede o que
  deve.

**Negativas / Trade-offs**:
- Análise estática conservadora: o `:` como discriminador deixaria escapar um futuro comando sem
  `:`. Aceito — nenhum existe, e falso negativo raro é melhor que falso positivo crítico.
- Os checks leem todos os `.md` de instrução a cada `tools:doctor`. Barato hoje (< 1s); se crescer,
  vira lazy por mtime. São `scope: repo`, fora do `SessionStart`.

## Rastreamento

- Implementação: `lib/core/doc-graph.mjs`, `lib/core/health.mjs` (checks `docs-commands`,
  `commands-documented`, `docs-links`), `test/doc-graph.test.js`, `test/health.test.js`
- Spec: `specs/coerencia-do-sistema/` (SPEC-011)
- ADRs relacionadas: ADR-0023 (gate do núcleo) e ADR-0024 (gate do tarball) — a mesma família, agora
  na terceira fronteira: a instrução. ADR-0021 (a classe "erra sem avisar"). ADR-0020 (registry como
  fonte da verdade dos comandos).
