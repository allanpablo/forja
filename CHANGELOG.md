# Changelog

Histórico consolidado das mudanças estruturais do framework. Para decisões arquiteturais com rationale, ver `memory/90-decisions/`.

---

## [1.7.3] — 2026-07-23 — Doctor: permissão/lock não é corrupção

O check `memory-db` (consumido por `tools:doctor` e pelo `SessionStart`) tratava **qualquer** falha
de abertura do `universal.db` como corrupção e prescrevia `sync:universal`. Num ambiente sem escrita
(sandbox, FS read-only, diretório protegido) o driver lança `SQLITE_CANTOPEN` — e a prescrição é
ativamente errada: `sync:universal` *escreve* no banco, reencenaria o mesmo erro sem curar nada, e
levaria o operador a "reindexar" um banco íntegro. Reportado a partir de uma sessão real em sandbox.

### Corrigido
- **`memory-db` classifica a falha de abertura por `err.code`** em vez de colapsar tudo em
  "corrompido" (ADR-0033):
  - `SQLITE_CANTOPEN` / `EACCES` → **permissão/sandbox**, não corrupção; o fix orienta garantir
    leitura no path e **desaconselha** `sync:universal`.
  - `SQLITE_BUSY` → `warn` (lock temporário de outro processo; não trava o gate); o fix é aguardar.
  - `SQLITE_CORRUPT` / `SQLITE_NOTADB` / resto → corrupção; fix `npm run sync:universal`.
  O `err.code` já vinha impresso no `detail`, mas não decidia nada — a informação existia, faltava
  ramificar. É a mesma classe do bug de ABI que motivou a SPEC-009, sobrevivendo dentro do arquivo
  escrito para fechá-la.

### Adicionado
- **ADR-0033** e quatro casos em `test/health.test.js` (CANTOPEN, EACCES, BUSY, NOTADB): a distinção
  vira invariante que roda.

---

## [1.7.2] — 2026-07-22 — Fechando a classe: superfícies do projeto usam `cwd`

A auditoria sistemática dos comandos consumer-facing (o passo estrutural após os fixes caso-a-caso
de `spec:new`/`project:check`) achou **mais três instâncias vivas** da mesma classe — todas escondidas
num `const root = __dirname/..` que misturava "recurso do framework" com "projeto do usuário". Agora a
regra é explícita e tem gate (ADR-0032).

### Corrigido
- **`gsd:plan`/`gsd:handoff`/`gsd:check`** (agent-harness) gravavam o runbook e liam `specs/` dentro
  do pacote no consumidor; o `gsd:check` ainda spawava o `spec:check` com `cwd` do pacote e caminho
  `.mjs` cravado (inexistente no dist). Agora operam em `process.cwd()` e resolvem o script via
  `resolveScript` (`.ts` no dev, `.js` no dist).
- **`context:budget`/`agent:brief`/`context:sprint`** (context-ops) resolviam `.context/`, `specs/`,
  `memory/` e o `.memoryrc.json` no pacote; o `cmdBudget` ainda validava travessia contra a raiz do
  pacote e rejeitava arquivos do projeto. Agora usam `projectRoot = process.cwd()`; `catalog:*`
  (recurso do framework) segue em `root`.
- **`design:check`** rejeitava o brief do consumidor ("caminho fora do projeto") por ancorar a
  travessia no pacote — agora ancora no projeto.

### Adicionado
- **Gate `consumer-project-surfaces`** no `release:check`: executa `gsd:plan` + `context:budget` no
  cwd de um consumidor instalado e prova que o runbook cai em `<cwd>/.context/` e que o budget o lê de
  lá. Testemunha cruzada, independente do banco — reprova a classe inteira antes do publish.
- **ADR-0032** e `test/consumer-project-surfaces.test.js`: a regra `projectRoot` (cwd) vs `root`
  (framework) como invariante que roda. `sprint-manager` foi auditado e está são (opera pelo workspace).

---

## [1.7.1] — 2026-07-22 — Correção: `project:check` em projetos consumidores

### Corrigido
- **`forja project:check` num projeto consumidor auditava `node_modules/forjajs/dist/`** em vez do
  projeto (raiz cravada em `__dirname/..`), reportando os arquivos obrigatórios como faltando (score
  0%) — o que travava o gate `implement` do `orchestrate`. Agora audita `process.cwd()` (propagado
  pelo dispatcher desde a 1.6.2). Mesma classe do `spec-cli` (v1.6.2); o `check-standards` ficou de
  fora. O `check:all` **não** é afetado (agrega health/smoke/release, não `project:check`).

### Adicionado
- **Gate `consumer-project-check`** no `release:check`: planta um arquivo só no cwd e prova que
  `project:check` audita o projeto do consumidor, não o pacote. Provado com dentes (reprova o bug).

---

## [1.7.0] — 2026-07-22 — O motor de orquestração: o namesake executando

O nome do framework sempre foi orquestração multiagente; até aqui, a topologia era coerente
(SPEC-019) mas o fluxo vivia por disciplina. Esta release o faz **rodar**.

### Adicionado
- **`orchestrate` / `orchestrate:status` / `orchestrate:advance`** (SPEC-021, ADR-0031): a cadeia
  SDD/GSD (spec→plan→tasks→implement→review) como **máquina de estados guardada por gates**. Cada
  etapa abre com um handoff ADR-0005 para o dono do papel; `advance` só fecha a etapa se o artefato
  SDD estiver aprovado **e** o gate da transição sair verde — pular etapa é bloqueado pela máquina,
  não pela memória. O framework orquestra e guarda; o agente (IA ou humano) executa. Estado em
  `<cwd>/.context/orchestrate-<slug>.json`; roda no framework e em projetos consumidores.
- `commands-documented` ganha fallback para comandos **sem dois-pontos** (grep literal de nome
  conhecido) — `orchestrate` é o primeiro do registry.

### Corrigido
- **Backend gerado compila em Node 26**: o template pinava `better-sqlite3 ^11` (sem prebuild para
  Node novo); alinhado ao do framework (`^12`). Fecha o caveat da v1.6.0 — `check:all --full` verde.
- **Roadmap defasado**: o `release-auditor` já consumia o gate (ADR-0024); refresh da tabela
  (+ `consumer-spec-new`) e checkboxes marcados nos READMEs.

---

## [1.6.2] — 2026-07-21 — Correção: `spec:new` em projetos consumidores

### Corrigido
- **`forja spec:new` num projeto consumidor escrevia a spec DENTRO de `node_modules/forjajs/dist`**
  e falhava com "template ausente". Duas causas: o dispatcher spawnava os filhos com `cwd` = raiz do
  pacote (agora usa o cwd de quem invocou — uma CLI opera onde é chamada), e o `spec-cli` resolvia
  templates e destino por uma raiz só (agora separa `pkgRoot`, de onde vêm os templates, de
  `targetRoot`, onde as specs nascem). Framework inalterado.
- Sem `.gitignore` ou sem bloco de allowlist: silêncio em vez de aviso — num consumidor esse é o
  estado saudável (specs versionadas normalmente).

### Adicionado
- **Gate `consumer-spec-new`** no `release:check`: roda `spec:new` na instalação limpa e reprova se a
  spec não nascer no projeto do consumidor ou vazar para dentro do pacote. O smoke pegava "não
  carrega"; este pega "opera no mundo errado".

---

## [1.6.1] — 2026-07-20 — Correção: `project:upgrade` no pacote publicado

### Corrigido
- **`project:upgrade` quebrava com `Cannot find module .../create-memory-nest-kit.ts`** no pacote
  instalado. O spawn do gerador cravava a extensão `.ts`; em dev funciona, mas o `dist/` publicado
  tem `.js`. Agora resolve dinamicamente via `resolveScript` (`.ts` em dev, `.js` no publicado). O
  `project:smoke` tinha o mesmo defeito, também corrigido. Teste de regressão guarda a classe.

---

## [1.6.0] — 2026-07-20 — A orquestração coerente e a governança num comando

A governança do framework ganha um ponto de entrada e o namesake — orquestração multiagente — deixa
de viver por prosa.

### Adicionado
- **`check:all`** (SPEC-020): roda a **bateria inteira de gates** e dá um veredito só. Tier barato:
  coerência (`tools:doctor`) + `project:smoke`; `--full`: + tarball (`release:check`) + build do
  gerado. Compõe os runners existentes — zero check reimplementado. "A casa está coerente?" num
  comando, não num checklist lembrado.
- **`agent-topology`** (check no `tools:doctor`, SPEC-019): a topologia de orquestração é descrita em
  três fontes (`VALID_AGENTS`, `.claude/agents/*.md`, `AGENTS.md`) e pode divergir em silêncio. O
  check as cruza e reprova quando não concordam. Pegou o `release-auditor` (sub-agent executável sem
  rota) na 1ª execução — agora first-class no router e documentado (AGENTS.md §7).

### Corrigido / interno
- **`generators.test` migrado para `node:test`**: o harness custom legado não contava suas falhas no
  tally do CI e vazava um `/tmp` por execução (588 diretórios acumulados). Agora é `node:test` com
  cleanup — falha derruba o CI de verdade.

---

## [1.5.0] — 2026-07-19 — A memória como sistema fechado: medir → entregar → proteger → propagar

A economia de token do Forja sempre foi a memória persistente (ADR-0009), mas era uma promessa. Esta
release a torna um ciclo completo e verificável — cada peça fecha um elo.

### Adicionado
- **`code:context <domínio>`** (SPEC-016): **entrega** o mapa da memória como pacote pronto para
  colar (o `context.md`), com `--code` para o código da fatia e o custo em token à mostra. É o −61%
  medido no `token:economy` virado ferramenta. Compõe com `code:impact` para o blast radius.
- **`memory:audit`** (SPEC-017): **protege** o mapa nas duas direções — reprova se um `context.md`
  cita código que não existe (mapa que mente é pior que mapa nenhum) e avisa sobre módulo de código
  sem mapa (economia perdida em silêncio). O `adr-refs` aplicado aos mapas de memória.
- **`token:economy --project <path>`**: mede o eixo memória nos **domínios reais do usuário** (mapa
  vs código, por domínio) — o número fica dele, não da fixture.
- **`project:upgrade`** (SPEC-018): a metade que faltava do scaffolder. Traz peças novas de scaffold
  para um projeto já gerado — **aditivo, nunca sobrescreve** (o código do usuário é intocável).
  Dry-run por padrão; `--apply` copia.
- **O projeto gerado herda o gate** (ADR-0030): o gerador emite `scripts/check-memory-maps.mjs`, um
  `memory:audit` self-contained (Node puro, zero dep), e o `project:smoke` prova a propagação. O
  invariante da coerência mapa↔código passa a viajar com cada projeto.

### Nota
- Comandos e gates novos do framework; nada muda para projetos já gerados até rodarem `project:upgrade`.

---

## [1.4.0] — 2026-07-19 — Governança que mede: gate do gerador, economia de token e integridade de ADR

Três fronteiras que viviam por disciplina viram harness — e cada uma provou seu valor pegando um
problema real na estreia.

### Adicionado
- **`project:smoke`** (SPEC-015, ADR-0029): o gate do projeto gerado. Gera um projeto num tmp isolado
  e prova que é coerente — zero placeholder `{{...}}` vazado, `package.json` válido, estrutura íntegra
  (reusa o `structure-validator`). Tier `--full` (opt-in): `npm install` + `npm run build` do backend
  gerado. É o `release:check` da saída do gerador, um nível acima do tarball.
- **`token:economy`** (fecha a dívida do ADR-0027; mede ADR-0009): mede a economia de token em dois
  eixos, com file-sets explícitos. **Eixo arquitetura** (clean vs flat, mesma feature): camadas
  custam **+56%** numa feature pequena — a versão ingênua de "Clean Architecture economiza tokens"
  não se sustenta. **Eixo memória** (frio vs quente): o `context.md` (mapa) faz o contexto mínimo
  custar **−61%** vs varrer a fatia no frio — e isso **compõe** a cada tarefa. A economia do Forja é
  da memória persistente, amortizada no tempo, não das camadas. Narrativa corrigida no
  `WHEN-CLEAN-WHEN-LEAN.md` e no ADR-0027.
- **`adr-refs`** (check no `tools:doctor`, ADR-0025): toda citação `ADR-NNNN` aponta para um ADR que
  existe. Na 1ª execução pegou o `ADR-0026` pendurado (citado pela SPEC-012, nunca escrito) — fechado
  escrevendo o **ADR-0026** (arquitetura da migração TS: resolver, runtime duplo, gate-builda-dist).

### Nota
- Nada muda para quem já tem projetos gerados; são comandos e gates novos do framework.

---

## [1.3.2] — 2026-07-19 — Migração TypeScript concluída (interno)

**Sem mudança para quem instala** — o `dist/*.js` publicado é idêntico ao da 1.3.1. Fecha a SPEC-012.

### Alterado (interno)
- **Fonte 100% TypeScript**: os 16 `.js` restantes (entries públicos `init-project`/
  `create-memory-nest-kit`, generators, validators, `context-builder`, scaffolding) viraram `.ts`.
- **`noImplicitAny: true`** — o ratchet está armado: daqui pra frente todo parâmetro novo precisa de
  tipo explícito. Os ~285 params existentes foram anotados (tipo real onde agrega, `any` explícito
  onde o valor é dinâmico). Os checks de `health`/`release` viram `Check[]` de verdade.
- Shim `lib/vendor.d.ts` para o `better-sqlite3` (sem tipos publicados); `lib/templates` fora do
  type-check (é conteúdo copiado, não código do framework).
- Correção pega pelo `release:check`: um sed havia corrompido o array de fallback do `resolveScript`
  (`['.ts','.js','.mjs']`→`['.ts','.ts','.ts']`), quebrando a resolução do `dist/*.js`.

---

## [1.3.1] — 2026-07-19 — Migração TypeScript dos módulos do framework (interno)

**Sem mudança para quem instala** — o `dist/*.js` publicado é idêntico ao da 1.3.0. A conversão é
interna: fecha a renomeação leaf-first da SPEC-012 Fase 2.

### Alterado (interno)
- **Todos os 21 módulos `.mjs` do framework** (`bin/forja`, `lib/{audit,governance-report,workspace}`,
  todos os `scripts/` incluindo os 4 hooks) convertidos para `.ts`, com ~130 anotações de tipo. Os
  typedefs JSDoc viraram `interface`; os casts-comentário `/** @type */ (x)` viraram `as`.
- Dev e CI rodam a fonte `.ts` (Node ≥22.6); o `ci.yml` invoca `bin/forja.ts`. O publicado segue
  `dist/*.js` (Node ≥20), provado pelo `release-gate`.
- **Fora desta fatia** (deliberado): os 16 `.js` (entries públicos + generators + scaffolding), que
  seguem no checkJs, e `noImplicitAny: true` (endurecimento final).

---

## [1.3.0] — 2026-07-19 — Governança visível e o núcleo em TypeScript

Duas frentes que amadurecem o framework: a governança sai do arquivo que ninguém abre para
**consultável e visível**, e o motor de invariantes (`lib/core/`) passa a ser **TypeScript de
verdade**, com o pacote publicando `dist/` compilado.

### Adicionado
- **Auditoria consultável + painel de governança** (SPEC-014, ADR-0028): `audit:sync` projeta o
  `.context/forja-runs.jsonl` na tabela `audit_runs` (idempotente por `line_hash` — o `.jsonl` segue
  sendo a fonte de verdade); `audit:query` filtra a trilha por `--failed`/`--cmd`/`--since`/`--gate`;
  `governance:dashboard` gera um HTML **estático e self-contained** (sem servidor — a lição do
  ADR-0022) com o estado de specs, ADRs, gates e métricas.
- **`lib/core/` em TypeScript** (SPEC-012 Fase 2, leaf-first): `checks`, `health`, `release`,
  `doc-graph` e `registry` viram `.ts` com `interface Check/Probe/Result` reais. Dev roda `.ts`
  nativo (Node ≥22.6); o publicado embarca `dist/*.js` (Node ≥20).

### Alterado
- **O pacote publica `dist/` compilado** (SPEC-012 Fase 3): `bin`/`files[]` apontam para `dist/`. O
  `release:check` **builda o `dist/` antes de empacotar**, então o tarball provado é exatamente o
  publicado — sem step de build no CI, sem `dist/` no git, sem janela de staleness.
- **CI**: o job `test` roda em Node 22.x/24.x (a fonte `.ts` exige strip-types ≥22.6). O suporte a
  Node 20 do pacote publicado (que é `dist/*.js`) segue provado pelo job `release-gate`.

---

## [1.2.0] — 2026-07-18 — Boilerplate Clean Architecture, coerência de doc e correções

Feature nova (um boilerplate), o terceiro gate de invariante (coerência da documentação), e
**correções de dois bugs vivos na 1.1.6** que o TypeScript achou. A migração TS avançou até o
pipeline de build provado — mas continua publicando a fonte `.mjs` (a troca para `dist/` é interna
e fica para uma release futura).

### Corrigido
- **`npm run dev` estava quebrado** na 1.1.6: `scripts/dev.mjs` chamava `spawn()` sem importar —
  `ReferenceError` em três caminhos (agent-harness, compress-memory, create-memory-nest-kit).
- **`context:budget` / `catalog:assets` estavam quebrados** na 1.1.6: `scripts/context-ops.mjs`
  importava `dbPath` (inexistente; só há `getDbPath`) e o usava em `new Database(dbPath)`.
- Typedefs `Check`/`Result` duplicados e divergentes em `health.mjs` (resíduo da extração do runner).
- 22 links relativos quebrados em docs legadas (personas, quick-reference, structure).

### Adicionado
- **Boilerplate `06-clean-arch`** (SPEC-013, ADR-0027): DDD por camadas onde se paga, caminho enxuto
  onde não. Fatia rica (Orders) com inversão de dependência e invariante testável sem subir o Nest;
  caminho enxuto (Products) lado a lado; `WHEN-CLEAN-WHEN-LEAN.md` com o critério; memória por
  bounded context. A economia de token é reportada com honestidade (argumentada, não provada — o
  benchmark é follow-up).
- **Gate de coerência da documentação** (SPEC-011, ADR-0025): `lib/core/doc-graph.mjs` + três checks
  no `health.mjs` — `docs-commands` (critical: todo `forja <cmd>` citado existe no registry),
  `commands-documented` e `docs-links` (warn). Rodam no `tools:doctor` e no CI.
- **Resolver de script agnóstico de extensão** (SPEC-012): `resolveScript` desacopla o registry da
  extensão (`.ts → .js → .mjs`), preparando a migração TS. Backward-compatible.

### Interno
- **TypeScript como gate** (SPEC-012, Fases 0-1): `checkJs` estrito sobre a fonte `.mjs`,
  `types:check` no CI, contratos do núcleo (`Check`/`Probe`/`Result`) tipados. Pipeline de build
  (`tsc → dist`) provado; a publicação de `dist/` e a renomeação `.mjs → .ts` ficam para depois.

### Nota
- O `docs-links` pegou o **próprio autor**: um erro de profundidade relativa (`../../` vs `../../../`)
  na correção dos links foi detectado pelo doctor antes do commit. E o `release:check` pegou o
  acoplamento do dist-publish (código em `dist/scripts`, não `scripts/`) antes de qualquer publish.

## [1.1.6] — 2026-07-14 — README em inglês

A vitrine do pacote passa a ter versão em inglês, para alcançar quem chega pelo npm.

### Adicionado
- `README.en.md` — adaptação fiel do README em português, no estilo canônico `forja <comando>`.
  Seletor de idioma no topo dos dois arquivos. Incluído no `files[]` do pacote.

### Nota
- A **documentação** (`docs/`) permanece em pt-BR — é parte da identidade do projeto. Só a capa
  ganhou inglês. O README inglês foi verificado contra o registry: zero comandos inexistentes,
  zero links quebrados.

## [1.1.5] — 2026-07-14 — O comando é forja

A documentação pública ainda falava a língua interna do repo: `npm run x -- args` onde o usuário
do pacote tem `forja x args`. Esta versão alinha o que o README promete com o que o binário faz.

### Corrigido

- **README inteiro migrado para `forja` como forma canônica** — os scripts npm continuam
  existindo como aliases do repo clonado, mas deixam de ser a vitrine.
- **Exemplos do "60 segundos" estavam quebrados**: `forja gsd:handoff -- plan …` passa o `--`
  cru para o script (o core não filtra separador) e o comando falha. O `--` só era necessário
  na forma `npm run`; removido dos exemplos diretos.
- **Comando errado na lista de essenciais**: validar projeto do workspace é
  `workspace:project:check <nome>`, não `project:check <nome>` (que é o standards check do framework).
- **Links mortos**: `projects/ai-engineering-from-scratch-main/` não existe no repo;
  `docs/capacidades-externas.md` agora aponta para as fontes upstream (ADR-0016) e a
  reinstalação segue a prescrição do `tools:doctor` (`npm i -g @codegraph/cli`) em vez do
  symlink manual antigo.
- **`package-lock.json` preso em 1.1.3** desde o bump da 1.1.4; sincronizado.

### Adicionado

- Seção "Comandos essenciais" do README ampliada com o que já existia no registry mas não
  aparecia: `gsd:plan`/`gsd:check`, `code:check`/`code:impact`, `memory:compress`,
  `tools:doctor`, `release:check --publish`.
- `allowScripts` no `package.json`: instalações com política allow-scripts ativa deixam de
  bloquear silenciosamente o prebuild do `better-sqlite3` — exatamente o modo de falha que
  matava a memória (ADR-0023).

---

## [1.1.4] — 2026-07-14 — Os gates

Duas fronteiras do framework funcionavam por disciplina, e a disciplina falhou nas duas. Esta versão
as fecha com gates executáveis — e, pela primeira vez, com **prova**: os bugs históricos foram
reintroduzidos um a um, e o gate reprovou cada um deles.

> "Uma regra que depende de memória não é uma regra; é uma sugestão." — ADR-0021

### O que muda para quem usa

- **`npm publish` está bloqueado** se a instalação limpa não funcionar (`prepublishOnly` → ADR-0024).
- **`tools:doctor` reprova** (exit 1) quando o núcleo está quebrado — antes ele auditava só
  ferramentas opcionais e saía com 0 mesmo com a memória morta (ADR-0023).
- Quando algo quebra, a saída traz **o comando que corrige**, não um stack trace.

### Adicionado

- **`lib/core/health.mjs`** — saúde do núcleo como dados: ABI do `better-sqlite3`, memória, índice,
  workspace, `engines`, deps de runtime, `.mcp.json`. Fonte única do `tools:doctor` e do hook
  `SessionStart` (ADR-0023).
- **`lib/core/release.mjs` + `release:check`** — o gate do tarball. Empacota, instala num diretório
  isolado e **executa** os comandos. Grep não prova ausência; instalação prova (ADR-0024).
- **`lib/core/checks.mjs`** — runner compartilhado. Uma máquina, dois catálogos: um guarda o repo,
  outro guarda o pacote publicado.
- **CI**: `tools:doctor` na matriz de Nodes e `release:check` em job próprio. A evidência do release
  passa a viver no log do CI, não na memória de quem publica.
- `spec:new` mantém a allow-list do `.gitignore` — toda spec nova do framework nascia invisível ao git.

### Corrigido

- **A memória morria em silêncio.** Com o `better-sqlite3` compilado contra outra major do Node,
  `query:universal`, `sync:universal`, `context:smart`, `agent:route` e `memory:compress` ficavam
  todos inoperantes — e o `SessionStart` prescrevia `npm install`, que **não** recompila binário
  nativo. A correção é `npm rebuild better-sqlite3`, e agora é isso que o framework diz.
- **`docs/token-optimization.md` mandava rodar quatro comandos inexistentes** (`context:build`,
  `memory:db:reindex`, `memory:db:stats`, `cache:clear`) e linkava um `DEPLOYMENT.md` que nunca
  existiu. É o documento que ensina a economia de tokens (ADR-0009) — um agente obediente executava
  fantasmas.
- **O Governance não conhecia os gates**: descrevia o `tools:doctor` pela definição anterior ao
  ADR-0023 e ignorava o `release:check`.
- `runtime-deps` passava por sorte: os geradores emitem `import … from '@nestjs/common'` dentro de
  template literal, e o parser contava como dependência do framework.

### Evidência

| Bug histórico | Reintroduzido → |
|---|---|
| `better-sqlite3` como `devDependency` (ADR-0021) | reprovado por **dois** checks independentes |
| `dashboard/` fora do `files[]` (v1.1.3) | reprovado: 4 comandos mortos, 19 imports sem destino |
| `otplib`/`qrcode` publicados sem existir no git (v1.1.1) | reprovado sob `--publish`; `npm publish` aborta |

**88 testes** (eram 28). ADR-0023 e ADR-0024. SPEC-009 e SPEC-010.

## [1.1.3] — 2026-07-09 — Dashboard congelado

SPEC-002 (`specs/agent-dashboard/`) passa a `abandoned`. O código permanece em `dashboard/`,
versionado e com os 68 testes verdes, mas deixa de ser superfície pública. Ver
ADR-0022 (`memory/90-decisions/0022-congelar-dashboard-web.md`) para rationale e condições de retomada.

### Corrigido
- **Bug de release**: `docs/dashboard.md` e o script `npm run dashboard` eram publicados no npm,
  mas a pasta `dashboard/` nunca esteve no `files[]`. Quem instalava o pacote recebia a documentação
  e o comando, sem o código. Ambos saíram do tarball.
- `README.md` descrevia o dashboard como "visão opcional read-only"; ele expõe rotas que executam
  processos (`POST /api/workflow/:project/run/:role`). Descrição corrigida.
- `scripts/spec-cli.mjs` — `abandoned` é status válido, mas o `check` o rejeitava como incoerente
  quando havia `plan.md`/`tasks.md`, derrubando o gate com exit 1. Agora é tratado como terminal,
  junto de `done`.

### Removido
- Scripts `dashboard`, `dashboard:dev`, `dashboard:install`, `dashboard:web:dev` e
  `dashboard:web:build` do `package.json` do root.
- `docs/dashboard.md` e `specs/agent-dashboard/` do `files[]` do pacote npm.

## [Unreleased] — Workspace separado

SPEC-028 (`specs/reestruturacao-forja-v2/`): separação do framework Forja do workspace de produção.

- `lib/workspace.mjs` — resolução centralizada do workspace (`FORJA_WORKSPACE` > `~/.forjarc.json` > `~/forja-workspace`).
- `bin/init-project.js` — projetos de produto obrigatoriamente em `~/forja-workspace/projects/<nome>`.
- `scripts/sync-universal-memory.js`, `query-universal-memory.js`, `build-smart-context.js`, `memory-schema.mjs` — memória universal (SQLite) movida para o workspace.
- `scripts/check-standards.js` — `npm run project:check <nome>` resolve projeto no workspace.
- `scripts/agent-harness.mjs` + `package.json` — comandos `workspace:init`, `project:new`, `project:list`, `workspace:project:check`.
- Documentação atualizada: `README.md`, `AGENTS.md`, `docs/init-project.md`, `docs/structure.md`.
- ADR-0019 (`memory/90-decisions/0019-workspace-separado.md`) documenta a decisão.
- `.gitignore` reforça que projetos de produto não entram no repo do framework.

## [Unreleased] — Dashboard local

SPEC-002 (`specs/agent-dashboard/`) implementada em 12 tasks (T1-T12).

- `dashboard/server/` — Fastify 5 com 7 rotas (specs, handoffs, projects, tokens, commands SSE, briefing, health)
- `dashboard/web/` — Vite + React + Tailwind + Recharts; 6 telas; bundle 166KB gzip (NFR < 500KB ✓)
- `dashboard/server/lib/` — allowlist hard-coded, run-command, spec-parser, briefing-parser, token-estimator
- Scripts: `npm run dashboard`, `dashboard:dev`, `dashboard:install`, `dashboard:web:build`
- **60 testes verde** (55 dashboard + 5 root)
- `docs/dashboard.md` cobre uso, allowlist, troubleshooting, segurança

## [v1.1] — 2026-05-10 — Refator SDD + Orquestração

### Frente 1 — Cleanup + ADRs
- 13 relatórios históricos movidos para `docs/archive/`
- 4 guias úteis migrados para `docs/{structure,init-project,examples,publishing}.md`
- 2 exemplos antigos arquivados em `docs/archive/examples/`
- Monolito bin (1486 LOC) preservado em `docs/archive/legacy-bin/`
- `DOC-MAP.md` reescrito (204 → 50 linhas)
- 6 ADRs criados a partir de decisões dispersas (`memory/90-decisions/0001-0006`)

### Frente 2 — Bins e exemplos consolidados
- `bin/create-memory-nest-kit-v2.js` promovido a oficial (substituiu monolito)
- `package.json`: bin secundário, novos scripts `spec:*`, `agent:route`, `memory:vacuum`
- `exemplo-v3` mantido como exemplo canônico

### Frente 3 — Pipeline SDD
- `specs/_templates/{spec,plan,tasks}.md`
- `scripts/spec-cli.mjs` com `new`/`plan`/`tasks`/`check` (4/4 testes verdes)
- ADR-0007 estabelece SDD como obrigatório para features não-triviais
- SPEC-001 (`specs/pipeline-sdd-e-orquestracao/`) é a meta-spec deste refator

### Frente 4 — Sub-agents executáveis
- 6 sub-agents em `.claude/agents/`: orchestrator, context-engineer, sdd-architect, product, marketing, governance
- 3 prompts portáveis novos em `prompts/`
- `scripts/agent-router.mjs` persiste handoffs em `universal.db.handoffs` (7 campos validados)
- ADR-0008 documenta migração handoff markdown → SQLite
- `AGENTS.md` reescrito

### Frente 5 — Hooks token-economy
- `.claude/settings.json` com hooks `SessionStart` e `UserPromptSubmit`
- `scripts/hook-session-start.mjs` injeta status de specs + handoffs abertos
- `scripts/hook-user-prompt.mjs` opt-in (`FRAMEWORK_HOOK_INJECT=1`), cache 30min, cap 4KB
- `scripts/pre-commit.sh` agora roda `spec:check` + `check-standards`
- ADR-0009 documenta trade-offs
- `.memoryrc.json` ganha seção `hooks`; `handoff` aponta para SQLite

---

## [v1.0] — 2026-05-02 — 4 Fases Estruturais

Detalhes completos em `docs/archive/PROJETO-COMPLETO.md`.

### Fase 1 — Arquitetura
- Monolito `bin/create-memory-nest-kit.js` (1486 LOC) refatorado em 5 módulos em `lib/`
- Orquestrador final: 125 LOC (redução de 91%)
- 1.820 LOC reutilizáveis em `lib/generators/`, `lib/validators/`, `lib/utils/`, `lib/context-builder.js`
- 7/7 testes passando; backward compatible

### Fase 2 — Documentação por Persona
- `docs/personas/{executive,architect,developer,qa}/` — guias estruturados
- `docs/quick-reference.md`, `docs/glossary.md`, `DOC-MAP.md`
- Onboarding reduzido em ~83% (medido em tempo de leitura)

### Fase 3 — Economia de Tokens
- `lib/context-builder.js` — API com 3 modos (`global`, `domain`, `task`), FTS5, cache LRU
- `scripts/compress-memory.mjs` — archive de runs > 30 dias, VACUUM
- `.memoryrc.json` — configuração centralizada
- `docs/token-optimization.md`, `scripts/token-benchmark.mjs`
- Redução estimada: 40-60% em tokens enviados ao modelo

### Fase 4 — Dev Workflow
- `scripts/dev.mjs` — CLI unificada (health/build-context/sprint/check)
- `scripts/pre-commit.sh` — validação automática
- `scripts/check-standards.js`, `scripts/generate-dashboard.js`
- 100% das operações cobertas por scripts npm

---

## [v0.x] — 2026-04 — Bootstrap

- Estrutura inicial `memory/` hierárquica (00-global a 90-decisions)
- `bin/create-memory-nest-kit.js` — scaffold inicial monolítico
- SQLite universal (`.memory/sqlite/universal.db`) com FTS5
- Scripts `sprint-manager.js`, `sync-universal-memory.js`, `query-universal-memory.js`
- AGENTS.md com topologia de 6 papéis
- `exemplo-projeto/`, `exemplo-v2/`, `exemplo-v3/` — outputs de referência
